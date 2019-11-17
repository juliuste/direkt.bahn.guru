'use strict'

// forked from https://github.com/mapbox/mapbox-gl-geocoder/commit/c6a1450
// released under ISC license https://github.com/mapbox/mapbox-gl-geocoder/blob/c6a1450/LICENSE
// @todo publish this fork as a separate module

var Typeahead = require('suggestions')
var debounce = require('lodash/debounce')
var extend = require('xtend')
var EventEmitter = require('events').EventEmitter

/**
 * A geocoder component using Mapbox Geocoding API
 * @class MapboxGeocoder
 *
 * @param {Object} options
 * @param {Function} options.geocode Required. Async function that returns a list of results for given query.
 * @param {Number} [options.zoom=16] On geocoded result what zoom level should the map animate to when a `bbox` isn't found in the response. If a `bbox` is found the map will fit to the `bbox`.
 * @param {Boolean} [options.flyTo=true] If false, animating the map to a selected result is disabled.
 * @param {String} [options.placeholder="Search"] Override the default placeholder attribute value.
 * @param {Object} [options.proximity] a proximity argument: this is
 * a geographical point given as an object with latitude and longitude
 * properties. Search results closer to this point will be given
 * higher priority.
 * @param {Boolean} [options.trackProximity=false] If true, the geocoder proximity will automatically update based on the map view.
 * @param {Number} [options.minLength=2] Minimum number of characters to enter before results are shown.
 * @param {Number} [options.limit=5] Maximum number of results to show.
 * @example
 * var geocoder = new MapboxGeocoder({ geocode: async (query) => [] });
 * map.addControl(geocoder);
 * @return {MapboxGeocoder} `this`
 */
function MapboxGeocoder (options) {
	this._eventEmitter = new EventEmitter()
	this.options = extend({}, this.options, options)
}

MapboxGeocoder.prototype = {

	options: {
		placeholder: 'Search',
		zoom: 4,
		flyTo: true,
		trackProximity: false,
		minLength: 2,
		limit: 5
	},

	onAdd: function (map) {
		this._map = map
		this._onChange = this._onChange.bind(this)
		this._onKeyDown = this._onKeyDown.bind(this)
		this._onQueryResult = this._onQueryResult.bind(this)
		this._clear = this._clear.bind(this)
		this._updateProximity = this._updateProximity.bind(this)

		var el = this.container = document.createElement('div')
		el.className = 'mapboxgl-ctrl-geocoder mapboxgl-ctrl'

		var icon = document.createElement('span')
		icon.className = 'geocoder-icon geocoder-icon-search'

		this._inputEl = document.createElement('input')
		this._inputEl.type = 'text'
		this._inputEl.placeholder = this.options.placeholder

		this._inputEl.addEventListener('keydown', this._onKeyDown)
		this._inputEl.addEventListener('change', this._onChange)

		var actions = document.createElement('div')
		actions.classList.add('geocoder-pin-right')

		this._clearEl = document.createElement('button')
		this._clearEl.className = 'geocoder-icon geocoder-icon-close'
		this._clearEl.setAttribute('aria-label', 'Clear')
		this._clearEl.addEventListener('click', this._clear)

		this._loadingEl = document.createElement('span')
		this._loadingEl.className = 'geocoder-icon geocoder-icon-loading'

		actions.appendChild(this._clearEl)
		actions.appendChild(this._loadingEl)

		el.appendChild(icon)
		el.appendChild(this._inputEl)
		el.appendChild(actions)

		this._typeahead = new Typeahead(this._inputEl, [], {
			filter: false,
			minLength: this.options.minLength,
			limit: this.options.limit
		})
		this._typeahead.getItemValue = function (item) { return item.place_name }

		if (this.options.trackProximity) {
			this._updateProximity()
			this._map.on('moveend', this._updateProximity)
		}

		return el
	},

	onRemove: function () {
		this.container.parentNode.removeChild(this.container)

		if (this.options.trackProximity) {
			this._map.off('moveend', this._updateProximity)
		}

		this._map = null

		return this
	},

	_onKeyDown: debounce(function (e) {
		// if target has shadowRoot, then get the actual active element inside the shadowRoot
		var target = e.target.shadowRoot ? e.target.shadowRoot.activeElement : e.target
		if (!target.value) {
			// eslint-disable-next-line no-return-assign
			return this._clearEl.style.display = 'none'
		}

		// TAB, ESC, LEFT, RIGHT, ENTER, UP, DOWN
		if (e.metaKey || [9, 27, 37, 39, 13, 38, 40].indexOf(e.keyCode) !== -1) return

		if (target.value.length >= this.options.minLength) {
			this._geocode(target.value)
		}
	}, 200),

	_onChange: function () {
		if (this._inputEl.value) this._clearEl.style.display = 'block'
		var selected = this._typeahead.selected
		var selectedId = selected ? selected.properties.id : null
		if (selected && this._lastSelectedId !== selectedId) {
			this._lastSelectedId = selectedId
			if (this.options.flyTo) {
				this._map.flyTo({
					center: selected.center,
					zoom: this.options.zoom
				})
			}
			this._eventEmitter.emit('result', { result: selected })
		}
	},

	_geocode: function (searchInput) {
		this._loadingEl.style.display = 'block'
		this._eventEmitter.emit('loading', { query: searchInput })

		var request = this.options.geocode(searchInput)
		request.then(function (response) {
			this._loadingEl.style.display = 'none'

			var res = { features: response }

			if (res.features.length) {
				this._clearEl.style.display = 'block'
			} else {
				this._clearEl.style.display = 'none'
				this._typeahead.selected = null
			}

			this._eventEmitter.emit('results', res)
			this._typeahead.update(res.features)
		}.bind(this))

		request.catch(function (err) {
			this._loadingEl.style.display = 'none'
			this._clearEl.style.display = 'none'
			this._typeahead.selected = null
			this._eventEmitter.emit('error', { error: err })
		}.bind(this))

		return request
	},

	_clear: function (ev) {
		if (ev) ev.preventDefault()
		this._inputEl.value = ''
		this._typeahead.selected = null
		this._typeahead.clear()
		this._onChange()
		this._inputEl.focus()
		this._clearEl.style.display = 'none'
		this._eventEmitter.emit('clear')
	},

	_onQueryResult: function (response) {
		var results = response.entity
		if (!results.features.length) return
		var result = results.features[0]
		this._typeahead.selected = result
		this._inputEl.value = result.place_name
		this._onChange()
	},

	_updateProximity: function () {
		// proximity is designed for local scale, if the user is looking at the whole world,
		// it doesn't make sense to factor in the arbitrary centre of the map
		if (this._map.getZoom() > 9) {
			var center = this._map.getCenter().wrap()
			this.setProximity({ longitude: center.lng, latitude: center.lat })
		} else {
			this.setProximity(null)
		}
	},

	/**
   * Set & query the input
   * @param {string} searchInput location name or other search input
   * @returns {MapboxGeocoder} this
   */
	query: function (searchInput) {
		this._geocode(searchInput).then(this._onQueryResult)
		return this
	},

	/**
   * Set input
   * @param {string} searchInput location name or other search input
   * @returns {MapboxGeocoder} this
   */
	setInput: function (searchInput) {
		// Set input value to passed value and clear everything else.
		this._inputEl.value = searchInput
		this._typeahead.selected = null
		this._typeahead.clear()
		this._onChange()
		return this
	},

	/**
   * Set proximity
   * @param {Object} proximity The new options.proximity value. This is a geographical point given as an object with latitude and longitude properties.
   * @returns {MapboxGeocoder} this
   */
	setProximity: function (proximity) {
		this.options.proximity = proximity
		return this
	},

	/**
   * Get proximity
   * @returns {Object} The geocoder proximity
   */
	getProximity: function () {
		return this.options.proximity
	},

	/**
   * Subscribe to events that happen within the plugin.
   * @param {String} type name of event. Available events and the data passed into their respective event objects are:
   *
   * - __clear__ `Emitted when the input is cleared`
   * - __loading__ `{ query } Emitted when the geocoder is looking up a query`
   * - __results__ `{ results } Fired when the geocoder returns a response`
   * - __result__ `{ result } Fired when input is set`
   * - __error__ `{ error } Error as string`
   * @param {Function} fn function that's called when the event is emitted.
   * @returns {MapboxGeocoder} this;
   */
	on: function (type, fn) {
		this._eventEmitter.on(type, fn)
		return this
	},

	/**
   * Remove an event
   * @returns {MapboxGeocoder} this
   * @param {String} type Event name.
   * @param {Function} fn Function that should unsubscribe to the event emitted.
   */
	off: function (type, fn) {
		this._eventEmitter.removeListener(type, fn)
		return this
	}
}

module.exports = MapboxGeocoder
