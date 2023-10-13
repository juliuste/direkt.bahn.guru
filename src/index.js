'use strict'

import Sweetalert from 'sweetalert2'
import mapboxGl from 'mapbox-gl'
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder'
import { sortBy } from 'lodash'
import getQueryState from 'querystate'
import { Duration } from 'luxon'

import {
	formatStationId,
	stationById,
	locationToPoint,
	durationCategory,
	durationCategoryColour,
	toPoint,
	isLongDistanceOrRegionalOrSuburban,
	isRegion,
	hasLocation,
	fetchStation,
} from './helpers.js'
import { MapboxFilterControl } from './filter.js'
import { MapboxStationControl } from './station-control.js'
import { translate, language } from './translations.js'

const queryState = getQueryState()
const selectTrainType = () => queryState.get('trainType', 'all')
const selectMaxDuration = () => queryState.get('maxDuration', Infinity)
const selectStations = () => {
	const state = queryState.get('stations', [])
	return typeof state === 'string' ? [state] : state
}

const donationUrl = 'https://github.com/sponsors/juliuste?frequency=one-time'

let popupOpenSince = null
let popupOpenFor = null
let successfulSearches = 0

let selectedStations = {}

const fetchLocation = async (id) => {
	const station = await stationById(id)
	geocoder.setInput('')
	if (selectedStations[station]) {
		return
	}

	const linkedStations = await fetch(`https://api.direkt.bahn.guru/${formatStationId(station.id)}?localTrainsOnly=${selectTrainType() === 'all' ? 'false' : 'true'}&v=4`)
		.then(res => res.json())
		.then(async results => results.filter(r => !!r.location))
	if (linkedStations.length === 0) {
		const error = new Error('No results found.')
		error.code = 'NO_RESULTS'
		throw error
	}
	selectedStations[id] = { ...station, linkedStations }
	return station
}

const drawLocations = () => {
	const geojson = {
		type: 'FeatureCollection',
		features: [],
	}

	for (const originStation of Object.values(selectedStations)) {
		const stationFeature = {
			type: 'feature',
			geometry: locationToPoint(originStation.location),
			properties: {
				type: 1,
				name: originStation.name,
				duration: durationCategory(0),
				durationMinutes: 0,
			},
		}

		const features = sortBy(originStation.linkedStations.filter(s => s.duration < selectMaxDuration()).map(r => ({
			type: 'feature',
			geometry: locationToPoint(r.location),
			properties: {
				type: 2,
				name: r.name,
				duration: durationCategory(r.duration),
				durationMinutes: r.duration,
				calendarUrl: r.calendarUrl,
				dbUrlGerman: r.dbUrlGerman,
				dbUrlEnglish: r.dbUrlEnglish,
			},
		})), x => (-1) * x.properties.duration)
		geojson.features.push(...features)
		geojson.features.push(stationFeature)
	}
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
		const { dbUrlGerman, dbUrlEnglish, calendarUrl, type } = e.features[0].properties
		if (type === 1) return // don't show popup when origin station is clicked

		console.log(e.features[0].properties)
		if (!(popupOpenSince && (+new Date() - (+popupOpenSince) > 50) && popupOpenFor === dbUrlGerman)) return // @todo xD
		const { isConfirmed, isDenied } = await Sweetalert.fire({
			title: translate('redirectionAlertTitle'),
			html: selectTrainType() === 'regional-only'
				? [translate('redirectionAlertMessage'), translate('redirectionAlertLocalTrainWarning')].join('<br><br>')
				: translate('redirectionAlertMessage'),
			showCancelButton: true,
			cancelButtonText: translate('redirectionAlertCancel'),
			showDenyButton: true,
			denyButtonText: translate('redirectionAlertCalendar'),
			denyButtonColor: '#999999',
			showConfirmButton: true,
			confirmButtonText: translate('redirectionAlertDb'),
			confirmButtonColor: '#3085d6',
		})
		if (isConfirmed) {
			if (language.toLowerCase() === 'de' && dbUrlGerman) window.open(dbUrlGerman, 'target_' + dbUrlGerman)
			else if (dbUrlEnglish) window.open(dbUrlEnglish, 'target_' + dbUrlEnglish)
		}
		if (isDenied && calendarUrl) window.open(calendarUrl, 'target_' + calendarUrl)
	})

	map.on('mouseenter', 'stations', e => {
		const coordinates = e.features[0].geometry.coordinates.slice()
		const { name, duration, durationMinutes, dbUrlGerman } = e.features[0].properties

		let durationElement = ''
		if (Number.isInteger(durationMinutes)) {
			const durationColour = durationCategoryColour(duration)
			const formattedDuration = Duration.fromObject({ minutes: durationMinutes }).toFormat('h:mm')
			durationElement = ` <b style="color: ${durationColour};">${formattedDuration}h</b>`
		}

		popupOpenSince = new Date()
		popupOpenFor = dbUrlGerman
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
}

const addLocation = async (id) => {
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

	await fetchLocation(id)
		.then(async () => {
			if (successfulSearches !== 4) return Sweetalert.close()
			// show donation request once, after the user already completed three searches successfully
			const { isConfirmed } = await Sweetalert.fire({
				title: translate('donationAlertTitle'),
				text: translate('donationAlertMessage'),
				showDenyButton: true,
				denyButtonText: translate('donationAlertSkip'),
				denyButtonColor: '#333333',
				showConfirmButton: true,
				confirmButtonText: translate('donationAlertContinue'),
				confirmButtonColor: '#3085d6',
			})
			if (isConfirmed) window.open(donationUrl, 'target_' + donationUrl)
		})
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
	queryState.set('stations', [...selectStations(), id])
	drawLocations()
	successfulSearches += 1
}

const reset = async () => {
	selectedStations = {}
	stationControl.clear()
	const stations = selectStations()
	await Promise.all(stations.map(o => fetchLocation(o).then(station => {
		stationControl.addStation(station.id, station.name)
	}))).then(drawLocations)
}

mapboxGl.accessToken = ''
const map = new mapboxGl.Map({
	container: 'map',
	style: 'mapbox://styles/mapbox/light-v10',
	zoom: 4.5,
	center: [10.43, 51.15],
	attributionControl: true,
	customAttribution: [
		'<b><i><a href="https://gist.github.com/juliuste/f9776a6b7925bc6cc2d52225dd83336e">Why are some trains missing?</a></i></b>',
		`<b><a href="${donationUrl}">Donate</a></b>`,
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
		const filteredResults = results.filter(x => isLongDistanceOrRegionalOrSuburban(x) && !isRegion(x) && hasLocation(x))
		return filteredResults.map(toPoint(language))
	},
})
map.addControl(geocoder)

geocoder.on('result', async item => {
	const { properties } = item.result
	const id = formatStationId(properties.id)
	if (selectStations().includes(id)) {
		return
	}
	await addLocation(id)
	stationControl.addStation(id, selectedStations[id].name)
})

const stationControl = new MapboxStationControl((stationId) => {
	delete selectedStations[stationId]
	queryState.set('stations', selectStations().filter(s => s !== stationId))
	drawLocations()
})
map.addControl(stationControl)

map.addControl(new MapboxFilterControl(
	({ trainTypes, maxDuration }) => {
		if (trainTypes && trainTypes !== queryState.get('trainType')) {
			queryState.set('trainType', trainTypes)
			reset()
		}
		if (maxDuration && maxDuration !== queryState.get('maxDuration')) {
			queryState.set('maxDuration', maxDuration)
			drawLocations()
		}
	}, {
		trainTypes: [
			{ id: 'all', title: translate('filterAllTrains'), isActive: selectTrainType() === 'all' },
			{ id: 'regional-only', title: translate('filterRegionalTrains'), isActive: selectTrainType() === 'regional-only' },
		],
		maxDuration: { type: 'number', min: 0, step: 10, style: 'width:40px;' },
	},
))

map.on('load', reset)
