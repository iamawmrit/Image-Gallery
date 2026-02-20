// Image Viewer - Full screen overlay with keyboard navigation, zoom, filmstrip, EXIF

class ImageViewer {
    constructor() {
        this.images = []
        this.currentIndex = 0
        this.zoom = 1
        this.panX = 0
        this.panY = 0
        this.isPanning = false
        this.panStartX = 0
        this.panStartY = 0
        this.slideshowTimer = null
        this.infoVisible = false
        this.isOpen = false

        this.el = document.getElementById('viewer')
        this.buildHTML()
        this.bindEvents()
    }

    buildHTML() {
        this.el.innerHTML = `
      <div id="viewer-topbar">
        <button id="viewer-close" title="Close (Esc)">${Utils.getIcon('close')}</button>
        <span id="viewer-filename">filename.jpg</span>
        <span id="viewer-meta"></span>
        <button class="viewer-btn" id="viewer-btn-info">${Utils.getIcon('info')} Info</button>
        <button class="viewer-btn" id="viewer-btn-slideshow">${Utils.getIcon('play')} Slideshow</button>
        <button class="viewer-btn" id="viewer-btn-share">${Utils.getIcon('share')} Share</button>
      </div>

      <div id="viewer-canvas">
        <button class="viewer-nav" id="viewer-prev">‹</button>
        <img id="viewer-img" alt="">
        <button class="viewer-nav" id="viewer-next">›</button>

        <div id="viewer-zoom-controls">
          <button class="zoom-btn" id="zoom-out">−</button>
          <span id="viewer-zoom-level">100%</span>
          <button class="zoom-btn" id="zoom-in">+</button>
          <button class="zoom-btn" id="zoom-fit" title="Fit">⊡</button>
          <button class="zoom-btn" id="zoom-actual" title="Actual Size">1:1</button>
        </div>

        <div id="viewer-info-panel">
          <div class="info-section">
            <div class="info-section-title">File Info</div>
            <div id="info-file-rows"></div>
          </div>
          <div class="info-section">
            <div class="info-section-title">Camera</div>
            <div id="info-camera-rows"></div>
          </div>
          <div class="info-section">
            <div class="info-section-title">Settings</div>
            <div id="info-settings-rows"></div>
          </div>
          <div class="info-section">
            <div class="info-section-title">Location</div>
            <div id="info-gps-rows"></div>
          </div>
        </div>

        <div id="viewer-slideshow-indicator">⏸ Slideshow</div>
      </div>

      <div id="viewer-filmstrip"></div>
    `
    }

    bindEvents() {
        // Close
        document.getElementById('viewer-close').addEventListener('click', () => this.close())

        // Navigation
        document.getElementById('viewer-prev').addEventListener('click', () => this.prev())
        document.getElementById('viewer-next').addEventListener('click', () => this.next())

        // Zoom
        document.getElementById('zoom-in').addEventListener('click', () => this.zoomBy(1.25))
        document.getElementById('zoom-out').addEventListener('click', () => this.zoomBy(0.8))
        document.getElementById('zoom-fit').addEventListener('click', () => this.zoomFit())
        document.getElementById('zoom-actual').addEventListener('click', () => this.zoomActual())

        // Buttons
        document.getElementById('viewer-btn-info').addEventListener('click', () => this.toggleInfo())
        document.getElementById('viewer-btn-slideshow').addEventListener('click', () => this.toggleSlideshow())

        // Edit Button
        const editBtn = document.createElement('button')
        editBtn.className = 'viewer-btn'
        editBtn.id = 'viewer-btn-edit'
        editBtn.innerHTML = `${Utils.getIcon('edit')} Edit`
        editBtn.addEventListener('click', () => this.toggleEdit())
        document.getElementById('viewer-topbar').insertBefore(editBtn, document.getElementById('viewer-btn-info'))

        // Editor Controls
        // this.setupEditor() // Removed in favor of external editor

        // Mouse wheel zoom
        document.getElementById('viewer-canvas').addEventListener('wheel', (e) => {
            e.preventDefault()
            const factor = e.deltaY < 0 ? 1.1 : 0.9
            this.zoomBy(factor, e.clientX, e.clientY)
        }, { passive: false })

        // Pan
        const img = document.getElementById('viewer-img')
        img.addEventListener('mousedown', (e) => {
            if (this.zoom <= 1) return
            e.preventDefault()
            this.isPanning = true
            this.panStartX = e.clientX - this.panX
            this.panStartY = e.clientY - this.panY
            img.classList.add('panning')
        })
        document.addEventListener('mousemove', (e) => {
            if (!this.isPanning) return
            this.panX = e.clientX - this.panStartX
            this.panY = e.clientY - this.panStartY
            this.applyTransform()
        })
        document.addEventListener('mouseup', () => {
            this.isPanning = false
            img.classList.remove('panning')
        })

        // Trackpad gestures
        let lastTouchDist = 0
        document.getElementById('viewer-canvas').addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                )
            }
        })
        document.getElementById('viewer-canvas').addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault()
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                )
                const factor = dist / lastTouchDist
                lastTouchDist = dist
                this.zoomBy(factor)
            }
        }, { passive: false })

        // Keyboard
        this._keyHandler = (e) => {
            if (!this.isOpen) return
            switch (e.key) {
                case 'ArrowRight': e.preventDefault(); this.next(); break
                case 'ArrowLeft': e.preventDefault(); this.prev(); break
                case 'ArrowUp': e.preventDefault(); this.zoomBy(1.1); break
                case 'ArrowDown': e.preventDefault(); this.zoomBy(0.9); break
                case 'Escape': this.close(); break
                case ' ': e.preventDefault(); this.toggleSlideshow(); break
                case 'f': case 'F': document.getElementById('viewer-canvas').requestFullscreen?.(); break
                case 'e': case 'E': this.toggleEdit(); break
                case 'Delete': this.deleteCurrentImage(); break
                case '+': case '=': this.zoomBy(1.25); break
                case '-': this.zoomBy(0.8); break
                case '0': this.zoomFit(); break
                case '1': this.zoomActual(); break
                case 'i': case 'I': this.toggleInfo(); break
            }
            if (e.metaKey && e.key === 'c') {
                const img = this.images[this.currentIndex]
                if (img) window.api.imageCopyToClipboard(img.filepath)
            }
        }
        document.addEventListener('keydown', this._keyHandler)

        // Menu events
        window.api.on('menu:zoom-in', () => { if (this.isOpen) this.zoomBy(1.25) })
        window.api.on('menu:zoom-out', () => { if (this.isOpen) this.zoomBy(0.8) })
        window.api.on('menu:zoom-actual', () => { if (this.isOpen) this.zoomActual() })
        window.api.on('menu:zoom-fit', () => { if (this.isOpen) this.zoomFit() })
        window.api.on('menu:show-in-finder', () => {
            if (this.isOpen) window.api.imageShowInFinder(this.images[this.currentIndex]?.filepath)
        })
        window.api.on('menu:delete', () => { if (this.isOpen) this.deleteCurrentImage() })
        window.api.on('menu:edit-image', () => { if (this.isOpen) this.toggleEdit() })
    }

    toggleEdit() {
        if (this.images[this.currentIndex]) {
            // Close viewer to open editor? Or keep it open in background?
            // Editor is an overlay on top of everything.
            // If we close viewer, we lose context.
            // Let's keep viewer open but maybe hide it? 
            // Actually editor overlay has higher z-index (likely).
            // But if we save, we want to return to viewer.
            // So keeping viewer open is better.
            window.appEvents.emit('viewer:edit', this.images[this.currentIndex])
        }
    }

    reloadCurrent() {
        if (!this.isOpen) return
        const img = this.images[this.currentIndex]
        if (!img) return

        // Force reload image
        const imgEl = document.getElementById('viewer-img')
        const src = Utils.filePathToSrc(img.filepath)
        imgEl.src = `${src}?t=${Date.now()}`

        // Update thumbnail in filmstrip
        const thumb = document.querySelector(`.filmstrip-thumb[data-index="${this.currentIndex}"] img`)
        if (thumb) {
            // We might need to regenerate thumb?
            // window.api.thumbGet will return cached path.
            // But if file changed, thumb might be outdated.
            // For now just reload the main image.
        }
    }

    open(images, index = 0) {
        this.images = images
        this.currentIndex = index
        this.isOpen = true
        this.el.style.display = 'flex'
        this.zoom = 1
        this.panX = 0
        this.panY = 0
        this.loadImage(index)
        this.renderFilmstrip()
        document.body.style.overflow = 'hidden'
    }

    close() {
        this.isOpen = false
        this.el.style.display = 'none'
        this.stopSlideshow()
        document.body.style.overflow = ''
    }

    async loadImage(index) {
        if (index < 0 || index >= this.images.length) return
        this.currentIndex = index

        const img = this.images[index]
        const imgEl = document.getElementById('viewer-img')

        imgEl.style.opacity = '0'
        imgEl.src = Utils.filePathToSrc(img.filepath)
        imgEl.onload = () => {
            imgEl.style.opacity = '1'
            this.zoom = 1
            this.panX = 0
            this.panY = 0
            this.applyTransform()
            this.updateZoomLabel()
        }
        imgEl.onerror = () => {
            // Try base64 fallback
            window.api.imageRead(img.filepath).then(dataUrl => {
                imgEl.src = dataUrl
                imgEl.style.opacity = '1'
            }).catch(() => { })
        }

        // Update top bar
        document.getElementById('viewer-filename').textContent = img.filename
        document.getElementById('viewer-meta').textContent =
            `${Utils.formatBytes(img.size)} · ${Utils.formatDate(img.modified)}`

        // Update filmstrip
        this.updateFilmstripActive(index)

        // Load EXIF if info panel is open
        if (this.infoVisible) this.loadExif(img)

        // Preload adjacent images
        this.preload(index - 1)
        this.preload(index + 1)
    }

    preload(index) {
        if (index < 0 || index >= this.images.length) return
        const img = new Image()
        img.src = Utils.filePathToSrc(this.images[index].filepath)
    }

    next() {
        if (this.currentIndex < this.images.length - 1) {
            this.loadImage(this.currentIndex + 1)
        }
    }

    prev() {
        if (this.currentIndex > 0) {
            this.loadImage(this.currentIndex - 1)
        }
    }

    zoomBy(factor, cx, cy) {
        const newZoom = Utils.clamp(this.zoom * factor, 0.1, 10)
        this.zoom = newZoom
        this.applyTransform()
        this.updateZoomLabel()
    }

    zoomFit() {
        this.zoom = 1
        this.panX = 0
        this.panY = 0
        this.applyTransform()
        this.updateZoomLabel()
    }

    zoomActual() {
        const imgEl = document.getElementById('viewer-img')
        const canvas = document.getElementById('viewer-canvas')
        const naturalW = imgEl.naturalWidth || 1
        const displayW = canvas.clientWidth
        this.zoom = naturalW / displayW
        this.panX = 0
        this.panY = 0
        this.applyTransform()
        this.updateZoomLabel()
    }

    applyTransform() {
        const imgEl = document.getElementById('viewer-img')
        imgEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`
        imgEl.style.cursor = this.zoom > 1 ? 'grab' : 'default'
    }

    updateZoomLabel() {
        document.getElementById('viewer-zoom-level').textContent = Math.round(this.zoom * 100) + '%'
    }

    renderFilmstrip() {
        const strip = document.getElementById('viewer-filmstrip')
        strip.innerHTML = ''

        const start = Math.max(0, this.currentIndex - 20)
        const end = Math.min(this.images.length, this.currentIndex + 21)

        for (let i = start; i < end; i++) {
            const img = this.images[i]
            const thumb = document.createElement('div')
            thumb.className = `filmstrip-thumb${i === this.currentIndex ? ' active' : ''}`
            thumb.dataset.index = i

            const imgEl = document.createElement('img')
            imgEl.alt = img.filename

            // Load thumbnail
            window.api.thumbGet({ filepath: img.filepath, modified: img.modified }).then(thumbPath => {
                if (thumbPath) imgEl.src = Utils.filePathToSrc(thumbPath)
            })

            thumb.appendChild(imgEl)
            thumb.addEventListener('click', () => this.loadImage(i))
            strip.appendChild(thumb)
        }

        // Scroll active into view
        setTimeout(() => {
            const active = strip.querySelector('.filmstrip-thumb.active')
            active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        }, 50)
    }

    updateFilmstripActive(index) {
        document.querySelectorAll('.filmstrip-thumb').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.index) === index)
        })
        const active = document.querySelector('.filmstrip-thumb.active')
        active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }

    toggleSlideshow() {
        if (this.slideshowTimer) {
            this.stopSlideshow()
        } else {
            this.startSlideshow()
        }
    }

    startSlideshow() {
        const btn = document.getElementById('viewer-btn-slideshow')
        const indicator = document.getElementById('viewer-slideshow-indicator')
        btn.classList.add('active')
        btn.innerHTML = `${Utils.getIcon('pause')} Pause`
        indicator.classList.add('visible')
        indicator.innerHTML = `${Utils.getIcon('play')} Slideshow`

        this.slideshowTimer = setInterval(() => {
            if (this.currentIndex < this.images.length - 1) {
                this.next()
            } else {
                this.loadImage(0)
            }
        }, 3000)
    }

    stopSlideshow() {
        if (this.slideshowTimer) {
            clearInterval(this.slideshowTimer)
            this.slideshowTimer = null
        }
        const btn = document.getElementById('viewer-btn-slideshow')
        const indicator = document.getElementById('viewer-slideshow-indicator')
        if (btn) { btn.classList.remove('active'); btn.innerHTML = `${Utils.getIcon('play')} Slideshow` }
        if (indicator) indicator.classList.remove('visible')
    }

    toggleInfo() {
        this.infoVisible = !this.infoVisible
        const panel = document.getElementById('viewer-info-panel')
        const btn = document.getElementById('viewer-btn-info')
        panel.classList.toggle('visible', this.infoVisible)
        btn.classList.toggle('active', this.infoVisible)
        if (this.infoVisible) this.loadExif(this.images[this.currentIndex])
    }

    async loadExif(img) {
        const fileRows = document.getElementById('info-file-rows')
        const cameraRows = document.getElementById('info-camera-rows')
        const settingsRows = document.getElementById('info-settings-rows')
        const gpsRows = document.getElementById('info-gps-rows')

        // File info
        fileRows.innerHTML = `
      ${this.infoRow('Name', img.filename)}
      ${this.infoRow('Size', Utils.formatBytes(img.size))}
      ${this.infoRow('Modified', Utils.formatDateTime(img.modified))}
      ${this.infoRow('Type', img.extension?.toUpperCase())}
      ${img.width ? this.infoRow('Dimensions', `${img.width} × ${img.height}`) : ''}
    `

        try {
            const exif = await window.api.imageGetExif(img.filepath)
            if (!exif) return

            cameraRows.innerHTML = `
        ${exif.Make ? this.infoRow('Camera', `${exif.Make} ${exif.Model || ''}`) : ''}
        ${exif.LensModel ? this.infoRow('Lens', exif.LensModel) : ''}
        ${exif.Software ? this.infoRow('Software', exif.Software) : ''}
      `

            settingsRows.innerHTML = `
        ${exif.ISO ? this.infoRow('ISO', exif.ISO) : ''}
        ${exif.ExposureTime ? this.infoRow('Shutter', `1/${Math.round(1 / exif.ExposureTime)}s`) : ''}
        ${exif.FNumber ? this.infoRow('Aperture', `f/${exif.FNumber}`) : ''}
        ${exif.FocalLength ? this.infoRow('Focal Length', `${exif.FocalLength}mm`) : ''}
        ${exif.Flash !== undefined ? this.infoRow('Flash', exif.Flash ? 'On' : 'Off') : ''}
        ${exif.WhiteBalance !== undefined ? this.infoRow('White Balance', exif.WhiteBalance === 0 ? 'Auto' : 'Manual') : ''}
        ${exif.DateTimeOriginal ? this.infoRow('Taken', Utils.formatDateTime(new Date(exif.DateTimeOriginal).getTime())) : ''}
      `

            if (exif.latitude && exif.longitude) {
                gpsRows.innerHTML = `
          ${this.infoRow('Latitude', exif.latitude.toFixed(6))}
          ${this.infoRow('Longitude', exif.longitude.toFixed(6))}
          ${exif.GPSAltitude ? this.infoRow('Altitude', `${Math.round(exif.GPSAltitude)}m`) : ''}
        `
            } else {
                gpsRows.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:12px">No GPS data</div>'
            }
        } catch (e) {
            cameraRows.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:12px">No EXIF data</div>'
        }
    }

    infoRow(label, value) {
        if (!value) return ''
        return `<div class="info-row">
      <span class="info-label">${Utils.escapeHtml(String(label))}</span>
      <span class="info-value">${Utils.escapeHtml(String(value))}</span>
    </div>`
    }

    async deleteCurrentImage() {
        const img = this.images[this.currentIndex]
        if (!img) return
        if (!confirm(`Move "${img.filename}" to Trash?`)) return
        await window.api.imageDelete(img.filepath)
        this.images.splice(this.currentIndex, 1)
        if (this.images.length === 0) {
            this.close()
        } else {
            this.currentIndex = Math.min(this.currentIndex, this.images.length - 1)
            this.loadImage(this.currentIndex)
            this.renderFilmstrip()
        }
        window.gallery.reload()
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.imageViewer = new ImageViewer()
})
