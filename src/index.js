'use strict'

const { fetch } = require('fetch-ponyfill')()
const Sweetalert = require('sweetalert2')
const mapboxGl = require('mapbox-gl')
const MapboxGeocoder = require('@mapbox/mapbox-gl-geocoder')
const sortBy = require('lodash/sortBy')
const queryState = require('querystate')()
const { Duration } = require('luxon')

const { match } = require('@formatjs/intl-localematcher')
const { getUserLocales } = require('get-user-locale')

// todo: use a library for this
const translations = {
	baseTitle: {
		de: '🇪🇺 Zug-Direktverbindungen',
		en: '🇪🇺 Direct train connections',
	},
	searchPlaceholder: {
		de: 'Station suchen…',
		en: 'Search for a station…',
	},
	redirectionAlertTitle: {
		de: 'Verbindungsdetails',
		en: 'Connection details',
	},
	redirectionAlertMessage: {
		de: 'Du wirst auf den Bahn-Preiskalender für die gewählte Verbindung weitergeleitet. Bitte beachte, dass du dort nur Preise für von der DB beworbene Fernverkehrsverbindungen findest, für alle anderen Verbindungen suche bitte auf den Seiten der lokalen Betreiber.',
		en: 'You will be forwarded to a price overview for the connection you selected. Please note that this page only includes prices for tickes sold by DB Fernverkehr. Please check the corresponding vendor\'s website for all other connections.',
	},
	redirectionAlertCancel: {
		de: 'Abbrechen',
		en: 'Cancel',
	},
	redirectionAlertContinue: {
		de: 'Öffnen',
		en: 'Continue',
	},
	loadingAlertTitle: {
		de: 'Lädt…',
		en: 'Loading…',
	},
	loadingAlertMessage: {
		de: 'Verbindungen werden gesucht. Bei vielbefahrenen Stationen kann das bis zu 30 Sekunden dauern.',
		en: 'Looking up connections. This might take up to 30 seconds at highly frequented stations.',
	},
	stationNotFoundAlertTitle: {
		de: 'Huch?!',
		en: 'Oops?!',
	},
	stationNotFoundAlertMessage: {
		de: 'Leider konnte die gewählte Station nicht in der Liste der S-Bahn-, Regional- und Fernverkehrshalte gefunden werden, versuchen Sie es bitte mit einer anderen.',
		en: 'Unfortunately, the station you were looking for could not be found in our database. Please try a different one.',
	},
	noResultsAlertTitle: {
		de: 'Hmm…',
		en: 'Hmm…',
	},
	noResultsAlertMessage: {
		de: 'Leider konnten für die Station, die du gesucht hast, keine Verbindungen gefunden werden.',
		en: 'Unfortunately, we couldn\'t find any connections for the station you selected.',
	},
	unknownErrorAlertTitle: {
		de: 'Huch?!',
		en: 'Oops?!',
	},
	unknownErrorAlertMessage: {
		de: 'Leider ist ein unbekannter Fehler aufgetreten, bitte versuchen Sie es erneut oder kontaktieren Sie uns, falls der Fehler häufiger auftritt.',
		en: 'Unknown error. Please try again in a few moments or contact us, if the issue persists.',
	},
}

const supportedLanguages = ['de', 'en']
const language = match(getUserLocales(), supportedLanguages, 'en')
const translate = token => {
	const translation = translations[token]
	if (!translation) { console.error('missing translation for token'); return token }
	const translationForLanguage = translation[language]
	if (!translation) { console.error(`missing translation for token ${token} in language ${language}`); return translation.en || token }
	return translationForLanguage
}

const {
	formatStationId,
	stationById,
	locationToPoint,
	durationCategory,
	durationCategoryColour,
	buildLink,
	toPoint,
	isLongDistanceOrRegional,
	isRegion,
	hasLocation,
	fetchStation,
} = require('./helpers')

mapboxGl.accessToken = 'pk.eyJ1IjoianVsaXVzdGUiLCJhIjoiY2t2N3UyeDZ2MjdqZjJvb3ZmcWNyc2QxbSJ9.oB7xzSTcmeDMcl4DhjSl0Q'
const map = new mapboxGl.Map({
	container: 'map',
	style: 'mapbox://styles/mapbox/light-v10',
	zoom: 4.5,
	center: [10.43, 51.15],
	attributionControl: true,
	customAttribution: [
		'<b><a href="https://github.com/juliuste/direkt.bahn.guru">GitHub</a></b>',
		'<b><a href="https://bahn.guru/impressum">Impressum</a></b>',
	],
})

// automatically resize map to always match the window's size
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

const popup = new mapboxGl.Popup({
	closeButton: false,
	closeOnClick: false,
	maxWidth: null,
})

const geocoder = new MapboxGeocoder({
	accessToken: 'some-invalid-token-since-we-dont-use-the-mapbox-search-anyway',
	marker: false,
	mapboxgl: map,
	zoom: 4.5,
	placeholder: translate('searchPlaceholder'),
	localGeocoder: () => [], // the mapbox geocoder library has a slightly awkward api, which requires this stub to disable requests to the "normal" mapbox place search api
	localGeocoderOnly: true,
	externalGeocoder: async (query) => {
		const results = await (fetchStation(query).then(res => res.json()))
		const filteredResults = results.filter(x => isLongDistanceOrRegional(x) && !isRegion(x) && hasLocation(x))
		return filteredResults.map(toPoint)
	},
})
map.addControl(geocoder)

let popupOpenSince = null
let popupOpenFor = null
const selectLocation = async id => {
	const origin = await stationById(id)
	if (!origin) {
		const error = new Error('Station not found.')
		error.code = 'STATION_NOT_FOUND'
		throw error
	}
	geocoder.setPlaceholder(origin.name || translate('searchPlaceholder'))
	geocoder.setInput('')

	const pageTitle = document.querySelector('title')
	if (origin.name) pageTitle.innerHTML = [origin.name, translate('baseTitle')].join(' | ')
	const stationFeature = {
		type: 'feature',
		geometry: locationToPoint(origin.location),
		properties: {
			type: 1,
			name: origin.name,
			duration: durationCategory(0),
			durationMinutes: 0,
		},
	}
	const geojson = {
		type: 'FeatureCollection',
		features: [],
	}
	return fetch(`https://api.direkt.bahn.guru/${formatStationId(origin.id)}?allowLocalTrains=true&allowSuburbanTrains=true`)
		.then(res => res.json())
		.then(async results => {
			const resultsWithLocations = results.map(r => ({
				...r,
				location: r.location,
			})).filter(r => !!r.location)
			const features = sortBy(resultsWithLocations.map(r => ({
				type: 'feature',
				geometry: locationToPoint(r.location),
				properties: {
					type: 2,
					name: r.name,
					duration: durationCategory(r.duration),
					durationMinutes: r.duration,
					link: buildLink(origin, r),
				},
			})), x => (-1) * x.properties.duration)
			geojson.features = features
			geojson.features.push(stationFeature)

			const source = {
				type: 'geojson',
				data: geojson,
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
						['zoom'],
						4.5, ['*', 4.5, ['/', 2, ['number', ['get', 'type']]]], // origin = 1, destination = 2
						15, ['*', 12, ['/', 2, ['number', ['get', 'type']]]], // origin = 1, destination = 2
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
						5, durationCategoryColour(5), // 8h-16h
						6, durationCategoryColour(6), // > 16h
					],
					'circle-stroke-color': '#333',
					'circle-stroke-width': 0.5,
				},
			})

			map.on('click', 'stations', async e => {
				const link = e.features[0].properties.link
				if (!(popupOpenSince && (+new Date() - (+popupOpenSince) > 50) && popupOpenFor === link)) return // @todo xD
				const { dismiss } = await Sweetalert.fire({
					title: translate('redirectionAlertTitle'),
					text: translate('redirectionAlertMessage'),
					showCancelButton: true,
					cancelButtonText: translate('redirectionAlertCancel'),
					showConfirmButton: true,
					confirmButtonText: translate('redirectionAlertContinue'),
					confirmButtonColor: '#3085d6',
				})
				if (!dismiss) {
					if (link) window.open(link, 'target_' + link)
				}
			})

			map.on('mouseenter', 'stations', e => {
				const coordinates = e.features[0].geometry.coordinates.slice()
				const { name, duration, durationMinutes, link } = e.features[0].properties

				let durationElement = ''
				if (Number.isInteger(durationMinutes)) {
					const durationColour = durationCategoryColour(duration)
					const formattedDuration = Duration.fromObject({ minutes: durationMinutes }).toFormat('h:mm')
					durationElement = ` <b style="color: ${durationColour};">${formattedDuration}h</b>`
				}

				popupOpenSince = new Date()
				popupOpenFor = link
				popup.setLngLat(coordinates)
					.setHTML(`${name}${durationElement}`)
					.addTo(map)
				map.getCanvas().style.cursor = 'pointer'
			})

			map.on('mouseleave', 'stations', e => {
				map.getCanvas().style.cursor = ''
				popupOpenSince = null
				popupOpenFor = null
				popup.remove()
			})

			if (resultsWithLocations.length === 0) {
				const error = new Error('No results found.')
				error.code = 'NO_RESULTS'
				throw error
			}
		})
}

const onSelectLocation = async id => {
	Sweetalert.fire({
		title: translate('loadingAlertTitle'),
		text: translate('loadingAlertMessage'),
		willOpen: () => Sweetalert.enableLoading(),
		allowOutsideClick: false,
		allowEscapeKey: false,
		allowEnterKey: false,
		showConfirmButton: false,
		showDenyButton: false,
		showCancelButton: false,
	})

	await selectLocation(id)
		.then(() => Sweetalert.close())
		.catch(error => {
			Sweetalert.disableLoading()
			if (error.code === 'STATION_NOT_FOUND') {
				return Sweetalert.fire({ title: translate('stationNotFoundAlertTitle'), text: translate('stationNotFoundAlertMessage'), icon: 'error', confirmButtonColor: '#3085d6' })
			}
			if (error.code === 'NO_RESULTS') {
				return Sweetalert.fire({ title: translate('noResultsAlertTitle'), text: translate('noResultsAlertMessage'), icon: 'warning', confirmButtonColor: '#3085d6' })
			}
			// @todo give more info on server errors
			return Sweetalert.fire({ title: translate('unknownErrorAlertTitle'), text: translate('unknownErrorAlertMessage'), icon: 'error', confirmButtonColor: '#3085d6' })
		})
}

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
