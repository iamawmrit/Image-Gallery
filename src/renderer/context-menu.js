// Context Menu

class ContextMenu {
    constructor() {
        this.menu = document.getElementById('context-menu')
        this.currentImage = null
        this.init()
    }

    init() {
        document.getElementById('ctx-open').addEventListener('click', () => {
            if (this.currentImage) window.appEvents.emit('ctx:open', this.currentImage)
            this.hide()
        })
        document.getElementById('ctx-edit').addEventListener('click', () => {
            if (this.currentImage) window.appEvents.emit('ctx:edit', this.currentImage)
            this.hide()
        })
        document.getElementById('ctx-finder').addEventListener('click', () => {
            if (this.currentImage) window.appEvents.emit('ctx:finder', this.currentImage)
            this.hide()
        })
        document.getElementById('ctx-copy-path').addEventListener('click', () => {
            if (this.currentImage) window.appEvents.emit('ctx:copy-path', this.currentImage)
            this.hide()
        })
        document.getElementById('ctx-copy-image').addEventListener('click', () => {
            if (this.currentImage) window.appEvents.emit('ctx:copy-image', this.currentImage)
            this.hide()
        })
        document.getElementById('ctx-delete').addEventListener('click', () => {
            if (this.currentImage) window.appEvents.emit('ctx:delete', this.currentImage)
            this.hide()
        })

        document.addEventListener('click', () => this.hide())
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hide() })
    }

    show(e, image) {
        this.currentImage = image
        this.menu.classList.add('visible')

        // Position
        const menuW = 200, menuH = 200
        let x = e.clientX, y = e.clientY
        if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8
        if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8
        this.menu.style.left = x + 'px'
        this.menu.style.top = y + 'px'
    }

    hide() {
        this.menu.classList.remove('visible')
        this.currentImage = null
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.contextMenu = new ContextMenu()
})
