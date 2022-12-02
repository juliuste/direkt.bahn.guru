import isUicLocationCode from 'is-uic-location-code'
import { toISO } from 'uic-codes'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import deLocale from 'i18n-iso-countries/langs/de.json'
import frLocale from 'i18n-iso-countries/langs/fr.json'

export const fetchStation = async (query) => {
	return Promise.race([
		fetch(`https://v5.db.transport.rest/locations?query=${query}&poi=false&addresses=false`),
		fetch(`https://v5.db.juliustens.eu/locations?query=${query}&poi=false&addresses=false`),
	])
}

countries.registerLocale(enLocale)
countries.registerLocale(deLocale)
countries.registerLocale(frLocale)

export const formatStationId = i => (i.length === 9 && i.slice(0, 2)) ? i.slice(2) : i
const countryForStationId = (_i, language) => {
	const i = formatStationId(_i)
	if (!isUicLocationCode(i)) return undefined
	const countryPrefix = +i.slice(0, 2)
	const alpha3 = toISO[countryPrefix]
	if (!alpha3) return undefined
	return countries.getName(alpha3, language, { select: 'official' }) || countries.getName(alpha3, 'en', { select: 'official' })
}

export const stationById = async id => {
	const candidates = await (fetchStation(id).then(res => res.json()))
	const matchingCandidate = candidates.find(s => (formatStationId(s.id) === formatStationId(id)) && formatStationId(id) && s.location)
	if (!matchingCandidate) {
		const error = new Error('Station not found.')
		error.code = 'STATION_NOT_FOUND'
		throw error
	}
	return matchingCandidate
}

export const locationToPoint = location => ({ type: 'Point', coordinates: [location.longitude, location.latitude] })

export const durationCategory = d => {
	if (d === 0) return 0
	if (!d) return -1
	if (d > 0 && d <= 60) return 1
	if (d > 0 && d <= 120) return 2
	if (d > 0 && d <= 240) return 3
	if (d > 0 && d <= 480) return 4
	if (d > 0 && d <= 960) return 5
	return 6
}

export const durationCategoryColour = c => {
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

export const toPoint = language => station => ({
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

export const isLongDistanceOrRegionalOrSuburban = s => {
	return s.products && (s.products.nationalExp || s.products.nationalExpress || s.products.national || s.products.regionalExp || s.products.regionalExpress || s.products.regional || s.products.suburban) && isUicLocationCode(formatStationId(s.id))
}

export const isRegion = s => {
	return s.name.toUpperCase() === s.name
}

export const hasLocation = s => {
	return !!s.location
}
