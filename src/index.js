'use strict'

import Sweetalert from 'sweetalert2'
import mapboxGl from 'mapbox-gl'
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder'
import { sortBy } from 'lodash'
import getQueryState from 'querystate'
import { Duration } from 'luxon'

import { match } from '@formatjs/intl-localematcher'
import { getUserLocales } from 'get-user-locale'

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

const queryState = getQueryState()

const donationUrl = 'https://github.com/sponsors/juliuste?frequency=one-time'

// todo: use a library for this
// when adding a language, also add the locale for it in helpers.js
const translations = {
	baseTitle: {
		de: '🇪🇺 Zug-Direktverbindungen',
		en: '🇪🇺 Direct train connections',
	},
	searchPlaceholder: {
		de: 'Station suchen…',
		en: 'Search for a station…',
	},
	filterAllTrains: {
		de: 'Alle Züge',
		en: 'All trains',
	},
	filterRegionalTrains: {
		de: 'Nur Nahverkehr',
		en: 'Local and regional trains',
	},
	donationAlertTitle: {
		de: 'Dieses Projekt unterstützen',
		en: 'Support this project',
	},
	donationAlertMessage: {
		de: 'Dieses Projekt wird ehrenamtlich von Open-Source-Softwareentwickler:innen betrieben, und macht aufgrund der Kosten für Server und Kartografie-Kacheln jeden Monat Verluste. Wir wären daher über jede Spende sehr dankbar!',
		en: 'This project is maintained by open source developers in their spare time, who also use their private funds to cover operational costs for servers and map tiles. We are grateful for any donation!',
	},
	donationAlertSkip: {
		de: 'Vielleicht später',
		en: 'Maybe later',
	},
	donationAlertContinue: {
		de: 'Jetzt spenden',
		en: 'Donate now',
	},
	redirectionAlertTitle: {
		de: 'Verbindungsdetails',
		en: 'Connection details',
	},
	redirectionAlertMessage: {
		de: 'Du kannst dir die gewählte Zugverbindung auf der Website der Deutschen Bahn anschauen, oder dich zum Preiskalender für diese Strecke weiterleiten lassen. Bitte beachte, dass der Kalender leider nur für von der DB beworbene Fernverkehrsverbindungen funktioniert, für alle anderen Verbindungen informiere dich bitte auf den Seiten der lokalen Betreiber.',
		en: 'You can check details for the selected train on the Deutsche Bahn (DB) website, or be forwarded to our price calendar for that route. Please note that the calendar only includes prices for tickes sold by DB Fernverkehr. Please check the corresponding vendor\'s website for all other connections.',
	},
	redirectionAlertLocalTrainWarning: {
		de: 'Bitte beachte außerdem, dass aus technischen Gründen einige Züge fälschlicherweise als Teil des Nahverkehrs angezeigt werden können, obwohl dort keine Nahverkehrstickets gelten (z.B. Flixtrain). Bitte beachte dazu auch die Hinweise auf bahn.de!',
		en: 'Furthermore, beware that (for technical reasons) some trains might be incorrectly categorized as local transit, even though local/regional fares don\'t apply (e.g. Flixtrain). Please refer to bahn.de for additional information!',
	},
	redirectionAlertCancel: {
		de: 'Abbrechen',
		en: 'Cancel',
	},
	redirectionAlertCalendar: {
		de: 'Preiskalender (beta)',
		en: 'Price calendar (beta)',
	},
	redirectionAlertDb: {
		de: 'Auf bahn.de zeigen',
		en: 'Show on bahn.de',
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

mapboxGl.accessToken = 'pk.eyJ1IjoianVsaXVzdGUiLCJhIjoiY2t2N3UyeDZ2MjdqZjJvb3ZmcWNyc2QxbSJ9.oB7xzSTcmeDMcl4DhjSl0Q'
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

let popupOpenSince = null
let popupOpenFor = null
let successfulSearches = 0
const selectLocation = async (id, local) => {
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
	return fetch(`https://api.direkt.bahn.guru/${formatStationId(origin.id)}?localTrainsOnly=${local ? 'true' : 'false'}&v=4`)
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
					calendarUrl: r.calendarUrl,
					dbUrlGerman: r.dbUrlGerman,
					dbUrlEnglish: r.dbUrlEnglish,
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
				const { dbUrlGerman, dbUrlEnglish, calendarUrl, type } = e.features[0].properties
				if (type === 1) return // don't show popup when origin is clicked

				console.log(e.features[0].properties)
				if (!(popupOpenSince && (+new Date() - (+popupOpenSince) > 50) && popupOpenFor === dbUrlGerman)) return // @todo xD
				const { isConfirmed, isDenied } = await Sweetalert.fire({
					title: translate('redirectionAlertTitle'),
					html: local
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

			if (resultsWithLocations.length === 0) {
				const error = new Error('No results found.')
				error.code = 'NO_RESULTS'
				throw error
			}

			successfulSearches += 1
		})
}

const onSelectLocation = async (id, local) => {
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

	await selectLocation(id, local)
		.then(async () => {
			if (successfulSearches !== 3) return Sweetalert.close()
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
}

const localTransitOnly = () => queryState.get('local') === 'true'
const selectedOrigin = () => queryState.get('origin')

geocoder.on('result', item => {
	const { properties } = item.result
	const id = formatStationId(properties.id)
	queryState.set('origin', id)
	onSelectLocation(id, localTransitOnly())
})

map.on('load', () => {
	const origin = selectedOrigin()
	if (origin) onSelectLocation(origin, localTransitOnly())
})

map.addControl(new MapboxFilterControl([
	{ id: 'all', title: translate('filterAllTrains'), isActive: !localTransitOnly() },
	{ id: 'regional-only', title: translate('filterRegionalTrains'), isActive: localTransitOnly() },
], 'all', (id) => {
	const local = (id === 'regional-only')
	if (local) queryState.set('local', 'true')
	else queryState.remove('local')
	const origin = selectedOrigin()
	if (origin) onSelectLocation(origin, local)
}))
