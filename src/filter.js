// based on https://github.com/el/filter-switch

import { translate } from './translations.js'

export class MapboxFilterControl {
	trainTypes = []

	constructor (onChange, filters) {
		this.onChange = onChange.bind(this)
		this.filters = filters
		this.onDocumentClick = this.onDocumentClick.bind(this)
	}

	getDefaultPosition () { return 'top-right' }

	onAdd (map) {
		document.addEventListener('click', this.onDocumentClick)

		this.map = map

		this.controls = document.createElement('div')
		this.controls.classList.add('mapboxgl-ctrl')
		this.controls.classList.add('mapboxgl-ctrl-group')

		this.settingsButton = document.createElement('button')
		this.settingsButton.type = 'button'
		this.settingsButton.classList.add('mapboxgl-ctrl-icon')
		this.settingsButton.classList.add('mapboxgl-filter-switch')
		this.settingsButton.addEventListener('click', event => { this.openModal() })
		this.controls.appendChild(this.settingsButton)

		this.controlsContainer = document.createElement('div')
		this.controlsContainer.classList.add('mapboxgl-filter-container')
		this.controls.appendChild(this.controlsContainer)

		this.createChoiceList('trainTypes', this.filters.trainTypes)
		this.createInput('maxDuration', this.filters.maxDuration)

		return this.controls
	}

	createChoiceList (choiceType, choices) {
		const containerElem = document.createElement('div')
		containerElem.classList.add('mapboxgl-filter-list')
		this.controlsContainer.appendChild(containerElem)
		const titleElem = document.createElement('h3')
		titleElem.innerText = translate(choiceType)
		containerElem.appendChild(titleElem)

		for (const choice of choices) {
			const elem = document.createElement('button')
			elem.type = 'button'
			elem.innerText = choice.title
			elem.classList.add(choice.title.replace(/[^a-z0-9-]/gi, '_'))
			elem.dataset.id = choice.id
			elem.addEventListener('click', event => {
				const srcElement = event.srcElement
				if (srcElement.classList.contains('active')) return

				this.onChange({ [choiceType]: elem.dataset.id })

				const elms = containerElem.getElementsByClassName('active')
				while (elms[0]) elms[0].classList.remove('active')
				srcElement.classList.add('active')
			})
			if (choice.isActive) elem.classList.add('active')
			containerElem.appendChild(elem)
		}
	}

	createInput (type, params) {
		const containerElem = document.createElement('div')
		containerElem.classList.add('mapboxgl-filter-list')
		this.controlsContainer.appendChild(containerElem)
		const inputElem = document.createElement('input')
		for (const [param, value] of Object.entries(params)) {
			inputElem[param] = value
		}
		inputElem.name = type
		inputElem.classList.add('mapboxgl-ctrl-input')
		const labelElem = document.createElement('label')
		labelElem.innerText = translate(type)
		labelElem.for = type
		inputElem.addEventListener('change', event => {
			this.onChange({ [type]: event.target.value })
		})
		containerElem.appendChild(labelElem)
		containerElem.appendChild(inputElem)
	}

	onRemove () {
		if (!this.controls || !this.controls.parentNode || !this.map || !this.settingsButton) return
		this.settingsButton.removeEventListener('click', this.onDocumentClick)
		this.controls.parentNode.removeChild(this.controls)
		document.removeEventListener('click', this.onDocumentClick)
		this.map = undefined
	}

	closeModal () {
		if (this.controlsContainer && this.settingsButton) {
			this.controlsContainer.style.display = 'none'
			this.settingsButton.style.display = 'block'
		}
	}

	openModal () {
		if (this.controlsContainer && this.settingsButton) {
			this.controlsContainer.style.display = 'block'
			this.settingsButton.style.display = 'none'
		}
	}

	onDocumentClick (event) {
		if (this.controls && !this.controls.contains(event.target)) this.closeModal()
	}
}
