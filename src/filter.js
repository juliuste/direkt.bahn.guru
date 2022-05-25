// based on https://github.com/el/filter-switch

export class MapboxFilterControl {
	entries = []
	defaultEntry = null
	constructor (entries, defaultEntry, onChange) {
		this.entries = entries
		this.defaultEntry = defaultEntry
		this.onChange = onChange.bind(this)
		this.onDocumentClick = this.onDocumentClick.bind(this)
	}

	getDefaultPosition () { return 'top-right' }

	onAdd (map) {
		this.map = map
		this.controlContainer = document.createElement('div')
		this.controlContainer.classList.add('mapboxgl-ctrl')
		this.controlContainer.classList.add('mapboxgl-ctrl-group')
		this.mapStyleContainer = document.createElement('div')
		this.entryButton = document.createElement('button')
		this.entryButton.type = 'button'
		this.mapStyleContainer.classList.add('mapboxgl-filter-list')

		const activeEntry = this.entries.find(e => e.isActive)
		const activeIsDefault = activeEntry && (activeEntry.id === this.defaultEntry)

		for (const entry of this.entries) {
			const entryElement = document.createElement('button')
			entryElement.type = 'button'
			entryElement.innerText = entry.title
			entryElement.classList.add(entry.title.replace(/[^a-z0-9-]/gi, '_'))
			entryElement.dataset.id = entry.id
			entryElement.addEventListener('click', event => {
				const srcElement = event.srcElement
				this.closeModal()
				if (srcElement.classList.contains('active')) return

				this.onChange(entryElement.dataset.id)
				if (entryElement.dataset.id !== this.defaultEntry) this.entryButton.classList.add('active')
				else this.entryButton.classList.remove('active')

				const elms = this.mapStyleContainer.getElementsByClassName('active')
				while (elms[0]) elms[0].classList.remove('active')
				srcElement.classList.add('active')
			})
			if (entry.isActive) entryElement.classList.add('active')
			this.mapStyleContainer.appendChild(entryElement)
		}

		this.entryButton.classList.add('mapboxgl-ctrl-icon')
		this.entryButton.classList.add('mapboxgl-filter-switch')
		if (!activeIsDefault) this.entryButton.classList.add('active')
		this.entryButton.addEventListener('click', event => { this.openModal() })

		document.addEventListener('click', this.onDocumentClick)

		this.controlContainer.appendChild(this.entryButton)
		this.controlContainer.appendChild(this.mapStyleContainer)
		return this.controlContainer
	}

	onRemove () {
		if (!this.controlContainer || !this.controlContainer.parentNode || !this.map || !this.entryButton) return
		this.entryButton.removeEventListener('click', this.onDocumentClick)
		this.controlContainer.parentNode.removeChild(this.controlContainer)
		document.removeEventListener('click', this.onDocumentClick)
		this.map = undefined
	}

	closeModal () {
		if (this.mapStyleContainer && this.entryButton) {
			this.mapStyleContainer.style.display = 'none'
			this.entryButton.style.display = 'block'
		}
	}

	openModal () {
		if (this.mapStyleContainer && this.entryButton) {
			this.mapStyleContainer.style.display = 'block'
			this.entryButton.style.display = 'none'
		}
	}

	onDocumentClick (event) {
		if (this.controlContainer && !this.controlContainer.contains(event.target)) this.closeModal()
	}
}
