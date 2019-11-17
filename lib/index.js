'use strict'
/* global PlainOverlay, window */
// @todo use module instead, this is disgusting :D

const { fetch } = require('fetch-ponyfill')()
const { stringify } = require('query-string')
const alert = require('sweetalert2')
const mapboxgl = require('mapbox-gl')
const MapboxGeocoder = require('./geocode')
const sortBy = require('lodash/sortBy')
const queryState = require('querystate')()
const { Duration } = require('luxon')

const githubLink = '<b><a href="https://github.com/juliuste/direkt.bahn.guru">GitHub</a></b>'
const impressumLink = '<b><a href="https://bahn.guru/impressum">Impressum</a></b>'

mapboxgl.accessToken = 'pk.eyJ1IjoianVsaXVzdGUiLCJhIjoiY2pxZWp2cmR4MXhnNDQ4bXl4ZDBnZ2psOCJ9.uAMKl_nPsY0O1VKU-9Sxtw'
const map = new mapboxgl.Map({
	container: 'map',
	style: 'mapbox://styles/mapbox/light-v9',
	zoom: 4.5,
	center: [10.43, 51.15],
	attributionControl: true,
	customAttribution: [impressumLink, githubLink]
})

const popup = new mapboxgl.Popup({
	closeButton: false,
	closeOnClick: false,
	maxWidth: null
})

const formatStationId = i => {
	if (i.length === 9 && i.slice(0, 2)) return i.slice(2)
	return i
}

const stationById = async id => {
	const candidates = await (fetch(`https://2.db.transport.rest/locations?query=${id}`).then(res => res.json()))
	return candidates.find(s => (formatStationId(s.id) === formatStationId(id)) && formatStationId(id) && s.location)
}

const locationToPoint = location => ({
	type: 'Point',
	coordinates: [location.longitude, location.latitude]
})

const durationCategory = d => {
	if (d === 0) return 0
	if (!d) return -1
	if (d > 0 && d <= 60) return 1
	if (d > 0 && d <= 120) return 2
	if (d > 0 && d <= 240) return 3
	if (d > 0 && d <= 480) return 4
	return 5
}

const durationCategoryColour = c => {
	if (c === -1) return '#999' // unknown duration
	if (c === 0) return '#333' // 0
	if (c === 1) return '#191' // < 1h
	if (c === 2) return '#2d1' // 1h-2h
	if (c === 3) return '#d4d411' // 2h-4h
	if (c === 4) return '#d91' // 4h-8h
	if (c === 5) return '#d41' // > 8h
	return '#999'
}

const buildLink = (origin, destination) => {
	const query = {
		origin: origin.id,
		destination: destination.id,
		submit: 'Suchen',
		class: 2,
		bc: 0,
		departureAfter: null,
		arrivalBefore: null,
		duration: null,
		maxChanges: 0,
		weeks: 8
	}
	return `https://bahn.guru/calendar?${stringify(query)}`
}

const selectLocation = async id => {
	const origin = await stationById(id)
	if (!origin) {
		const error = new Error('Station not found.')
		error.code = 'STATION_NOT_FOUND'
		throw error
	}
	const searchField = document.querySelector('.mapboxgl-ctrl-geocoder input[type="text"]')
	searchField.setAttribute('placeholder', origin.name || 'Station suchen…')
	searchField.value = ''
	searchField.blur()
	const pageTitle = document.querySelector('title')
	if (origin.name) pageTitle.innerHTML = [origin.name, '🇪🇺 Zug-Direktverbindungen'].join(' | ')
	const stationFeature = {
		type: 'feature',
		geometry: locationToPoint(origin.location),
		properties: {
			type: 1,
			name: origin.name,
			duration: durationCategory(0),
			durationMinutes: 0
		}
	}
	const geojson = {
		type: 'FeatureCollection',
		features: []
	}
	return fetch(`https://api.direkt.bahn.guru/${formatStationId(origin.id)}`)
		.then(res => res.json())
		.then(async results => {
			const resultsWithLocations = results.map(r => ({
				...r,
				location: r.location
			})).filter(r => !!r.location)
			const features = sortBy(resultsWithLocations.map(r => ({
				type: 'feature',
				geometry: locationToPoint(r.location),
				properties: {
					type: 2,
					name: r.name,
					duration: durationCategory(r.duration),
					durationMinutes: r.duration,
					link: buildLink(origin, r)
				}
			})), x => (-1) * x.properties.duration)
			geojson.features = features
			geojson.features.push(stationFeature)

			const source = {
				type: 'geojson',
				data: geojson
			}

			if (map.getLayer('stations')) map.removeLayer('stations')
			if (map.getSource('stations')) map.removeSource('stations')

			map.addSource('stations', source)
			map.addLayer({
				id: 'stations',
				type: 'circle',
				source: 'stations',
				paint: {
					'circle-radius': [
						'interpolate',
						['linear'],
						['number', ['get', 'type']],
						1, 8, // origin
						2, 5.5 // destination
					],
					'circle-color': [
						'interpolate',
						['linear'],
						['number', ['get', 'duration']],
						-1, durationCategoryColour(-1), // unknown duration
						0, durationCategoryColour(0), // 0
						1, durationCategoryColour(1), // < 1h
						2, durationCategoryColour(2), // 1h-2h
						3, durationCategoryColour(3), // 2h-4h
						4, durationCategoryColour(4), // 4h-8h
						5, durationCategoryColour(5) // > 8h
					]
				}
			})

			map.on('click', 'stations', e => {
				const link = e.features[0].properties.link
				if (link) window.open(link, 'target_' + link)
			})

			map.on('mouseenter', 'stations', e => {
				const coordinates = e.features[0].geometry.coordinates.slice()
				const { name, duration, durationMinutes } = e.features[0].properties

				let durationElement = ''
				if (Number.isInteger(durationMinutes)) {
					const durationColour = durationCategoryColour(duration)
					const formattedDuration = Duration.fromObject({ minutes: durationMinutes }).toFormat('h:mm')
					durationElement = ` <b style="color: ${durationColour};">${formattedDuration}h</b>`
				}

				popup.setLngLat(coordinates)
					.setHTML(`${name}${durationElement}`)
					.addTo(map)
				map.getCanvas().style.cursor = 'pointer'
			})

			map.on('mouseleave', 'stations', e => {
				map.getCanvas().style.cursor = ''
				popup.remove()
			})
		})
}

const onSelectLocation = async id => {
	const overlay = new PlainOverlay().show()
	await selectLocation(id)
		.finally(() => overlay.hide())
		.catch(error => {
			if (error.code === 'STATION_NOT_FOUND') {
				return alert('Huch?!', 'Leider konnte die gewählte Station nicht in der Liste der Fernverkehrshalte gefunden werden, versuchen Sie es bitte mit einer anderen!', 'error')
			}
			// @todo give more info on server errors
			return alert('Huch?!', 'Leider ist ein unbekannter Fehler aufgetreten, bitte versuchen Sie es erneut oder kontaktieren Sie uns, falls der Fehler häufiger auftritt.', 'error')
		})
}

const el = document.getElementById('map')
const resize = () => {
	const w = Math.max(document.documentElement.clientWidth, window.innerWidth || 0)
	const h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0)
	el.style.width = w + 'px'
	el.style.height = h + 'px'
	map.resize()
}
resize()
window.addEventListener('resize', resize)

const toPoint = (station) => ({
	center: [station.location.longitude, station.location.latitude],
	geometry: {
		type: 'Point',
		coordinates: [station.location.longitude, station.location.latitude]
	},
	place_name: station.name,
	place_type: ['coordinate'],
	properties: {
		id: station.id,
		name: station.name
	},
	type: 'Feature'
})

const isInGermany = s => {
	const shortId = formatStationId(s.id)
	return shortId.slice(0, 2) === '80'
}

const isLongDistance = s => {
	return s.products.nationalExp || s.products.national
}

const isRegion = s => {
	return s.name.toUpperCase() === s.name
}

const hasLocation = s => {
	return !!s.location
}

const geocoder = new MapboxGeocoder({
	geocode: async (query) => {
		const results = await (fetch(`https://2.db.transport.rest/locations?query=${query}`).then(res => res.json()))
		const filteredResults = results.filter(x => isInGermany(x) && isLongDistance(x) && !isRegion(x) && hasLocation(x))
		return filteredResults.map(toPoint)
	},
	accessToken: mapboxgl.accessToken,
	zoom: 4.5,
	placeholder: 'Station suchen…'
})
map.addControl(geocoder)
geocoder.on('result', item => {
	const { properties } = item.result
	const id = formatStationId(properties.id)
	queryState.set('origin', id)
	onSelectLocation(id)
})

map.on('load', () => {
	const selectedOrigin = queryState.get('origin')
	if (selectedOrigin) onSelectLocation(selectedOrigin)
})
