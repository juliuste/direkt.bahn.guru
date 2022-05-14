const { fetch } = require('fetch-ponyfill')()
const { stringify } = require('query-string')
const isUicLocationCode = require('is-uic-location-code')
const { toISO } = require('uic-codes')
const countries = require('i18n-iso-countries')
const enLocale = require('i18n-iso-countries/langs/en.json')
const deLocale = require('i18n-iso-countries/langs/de.json')

const fetchStation = async (query) => {
	return Promise.race([
		fetch(`https://v5.db.transport.rest/locations?query=${query}&poi=false&addresses=false`),
		fetch(`https://v5.db.juliustens.eu/locations?query=${query}&poi=false&addresses=false`),
	])
}

countries.registerLocale(enLocale)
countries.registerLocale(deLocale)

const formatStationId = i => (i.length === 9 && i.slice(0, 2)) ? i.slice(2) : i
const countryForStationId = (_i, language) => {
	const i = formatStationId(_i)
	if (!isUicLocationCode(i)) return undefined
	const countryPrefix = +i.slice(0, 2)
	const alpha3 = toISO[countryPrefix]
	if (!alpha3) return undefined
	return countries.getName(alpha3, language, { select: 'official' }) || countries.getName(alpha3, 'en', { select: 'official' })
}

const stationById = async id => {
	const candidates = await (fetchStation(id).then(res => res.json()))
	return candidates.find(s => (formatStationId(s.id) === formatStationId(id)) && formatStationId(id) && s.location)
}

const locationToPoint = location => ({ type: 'Point', coordinates: [location.longitude, location.latitude] })

const durationCategory = d => {
	if (d === 0) return 0
	if (!d) return -1
	if (d > 0 && d <= 60) return 1
	if (d > 0 && d <= 120) return 2
	if (d > 0 && d <= 240) return 3
	if (d > 0 && d <= 480) return 4
	if (d > 0 && d <= 960) return 5
	return 6
}

const durationCategoryColour = c => {
	if (c === -1) return '#999' // unknown duration
	if (c === 0) return '#333' // 0
	if (c === 1) return '#191' // < 1h
	if (c === 2) return '#2d1' // 1h-2h
	if (c === 3) return '#d4d411' // 2h-4h
	if (c === 4) return '#d91' // 4h-8h
	if (c === 5) return '#d41' // 8h-16h
	if (c === 6) return '#a41' // > 16h
	return '#999'
}

const buildLink = (origin, destination) => {
	const query = {
		origin: origin.name,
		destination: destination.name,
		submit: 'Suchen',
		class: 2,
		bc: 0,
		departureAfter: null,
		arrivalBefore: null,
		duration: null,
		maxChanges: 0,
		weeks: 4,
	}
	return `https://bahn.guru/calendar?${stringify(query)}`
}

const toPoint = language => station => ({
	center: [station.location.longitude, station.location.latitude],
	geometry: {
		type: 'Point',
		coordinates: [station.location.longitude, station.location.latitude],
	},
	place_name: [station.name, countryForStationId(station.id, language)].filter(Boolean).join(', '),
	place_type: ['coordinate'],
	properties: {
		id: station.id,
		name: station.name,
	},
	type: 'Feature',
})

const isLongDistanceOrRegionalOrSuburban = s => {
	return s.products && (s.products.nationalExp || s.products.nationalExpress || s.products.national || s.products.regionalExp || s.products.regionalExpress || s.products.regional || s.products.suburban) && isUicLocationCode(formatStationId(s.id))
}

const isRegion = s => {
	return s.name.toUpperCase() === s.name
}

const hasLocation = s => {
	return !!s.location
}

module.exports = {
	fetchStation,
	formatStationId,
	stationById,
	locationToPoint,
	durationCategory,
	durationCategoryColour,
	buildLink,
	toPoint,
	isLongDistanceOrRegionalOrSuburban,
	isRegion,
	hasLocation,
}
