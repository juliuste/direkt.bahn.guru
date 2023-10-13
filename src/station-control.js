export class MapboxStationControl {
	constructor (onRemoveCallback) {
		this.onRemoveCallback = onRemoveCallback
	}

	onAdd (map) {
		this.container = document.createElement('div')
		this.container.classList.add('mapboxgl-ctrl')
		this.container.classList.add('station-control')
		return this.container
	}

	addStation (id, name) {
		const row = document.createElement('div')
	  row.classList.add('station-container')
		const nameElem = document.createElement('span')
	  nameElem.classList.add('station-name')
		nameElem.innerText = name
		row.appendChild(nameElem)
		const remove = document.createElement('icon')
	  remove.classList.add('delete-icon')
		remove.addEventListener('click', event => {
			this.onRemoveCallback(id)
			row.remove()
		})
		row.appendChild(remove)
		this.container.appendChild(row)
	}

	clear () {
		while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild)
    }
	}
}
