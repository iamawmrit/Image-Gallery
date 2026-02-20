
class Editor {
    constructor() {
        this.container = document.getElementById('editor-overlay')
        this.canvasEl = document.getElementById('editor-canvas')
        this.canvas = null
        this.currentImage = null
        this.originalPath = null
        this.modified = false

        // State
        this.mode = null // 'adjust' | 'crop' | 'filter' | 'draw' | 'text' | 'export'
        this.history = []
        this.historyIndex = -1
        this.isHistoryLocked = false

        // Adjustments state
        this.adjustments = {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            temperature: 0,
            blur: 0,
            sharpness: 0,
            exposure: 0
        }

        // Active filter preset
        this.activePreset = null

        // Crop state
        this.cropRect = null
        this.cropRatio = null // null (free), 1, 4/5, 16/9

        // Draw state
        this.drawColor = '#ff0000'
        this.drawSize = 5
        this.drawTool = 'select' // pencil, select, arrow, line, rect, circle, blur

        // Bound event handlers for consistent addition/removal
        this.onMouseDownHandler = this.onDrawMouseDown.bind(this)
        this.onMouseMoveHandler = this.onDrawMouseMove.bind(this)
        this.onMouseUpHandler = this.onDrawMouseUp.bind(this)

        this.init()
    }

    init() {
        // Top Toolbar
        document.getElementById('editor-btn-cancel').addEventListener('click', () => this.close())
        document.getElementById('editor-btn-save').addEventListener('click', () => this.save())
        document.getElementById('editor-btn-undo').addEventListener('click', () => this.undo())
        document.getElementById('editor-btn-redo').addEventListener('click', () => this.redo())

        // Main Toolbar Navigation
        const navBtns = document.querySelectorAll('.editor-nav-btn')
        navBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = btn.dataset.mode
                this.setMode(mode)
            })
        })

        // Event Listeners from App
        if (window.appEvents) {
            window.appEvents.on('ctx:edit', (img) => this.open(img))
            window.appEvents.on('viewer:edit', (img) => this.open(img))
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.container.style.display === 'none') return

            // Don't trigger shortcuts if editing text
            const activeObj = this.canvas ? this.canvas.getActiveObject() : null
            if (activeObj && activeObj.isEditing) return

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) this.redo()
                else this.undo()
                e.preventDefault()
            }

            if (e.key === 'Backspace' || e.key === 'Delete') {
                this.deleteActiveObject()
            }

            if (e.key === 'ArrowUp') {
                this.handleZoom(1.1)
                e.preventDefault()
            }
            if (e.key === 'ArrowDown') {
                this.handleZoom(0.9)
                e.preventDefault()
            }

            // Draw Tool Shortcuts
            if (this.mode === 'draw' && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement.tagName !== 'INPUT') {
                let tool = null
                if (e.key === '1') tool = 'arrow'
                else if (e.key === '2') tool = 'rect'
                else if (e.key === '3') tool = 'circle'
                else if (e.key === '4') tool = 'line'
                else if (e.key === '5') tool = 'pencil'
                else if (e.key === '6') tool = 'blur'
                else if (e.key === '0' || e.key === 'Escape') tool = 'select'

                if (tool) {
                    const btn = this.container.querySelector(`.editor-btn[data-tool="${tool}"]`)
                    if (btn) btn.click()
                }
            }
        })
    }

    async open(img) {
        if (!window.fabric) {
            console.error('Fabric.js not loaded')
            return
        }

        this.currentImage = img
        this.originalPath = img.filepath
        this.container.style.display = 'flex'

        // Initialize Canvas
        if (!this.canvas) {
            this.initCanvas()
        } else {
            this.canvas.clear()
            this.resizeCanvas()
        }

        // Reset State
        this.history = []
        this.historyIndex = -1
        this.adjustments = {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            temperature: 0,
            blur: 0,
            sharpness: 0,
            exposure: 0,
            hue: 0,
            grain: 0,
            vignette: 0
        }
        this.exportQuality = 0.9
        this.activePreset = 'none'
        this.presetIntensity = 1
        this.cropRect = null
        this.cropRatio = null

        await this.loadImage()
        this.saveState() // Initial state
        this.setMode('adjust')
    }

    close() {
        this.container.style.display = 'none'
        if (this.canvas) {
            this.canvas.clear()
        }
    }

    initCanvas() {
        const container = document.getElementById('editor-canvas-container')
        this.canvas = new fabric.Canvas('editor-canvas', {
            width: container.clientWidth,
            height: container.clientHeight,
            backgroundColor: 'transparent',
            selection: true,
            preserveObjectStacking: true
        })

        // Handle object modification for history
        this.canvas.on('object:modified', () => this.saveState())
        this.canvas.on('object:added', (e) => {
            if (!e.target.excludeFromHistory) this.saveState()
        })
        this.canvas.on('path:created', () => this.saveState())

        this.canvas.on('mouse:wheel', (opt) => {
            const delta = opt.e.deltaY
            const zoom = delta < 0 ? 1.1 : 0.9
            this.handleZoom(zoom)
            opt.e.preventDefault()
            opt.e.stopPropagation()
        })

        window.addEventListener('resize', () => this.resizeCanvas())
    }

    resizeCanvas() {
        if (this.container.style.display === 'none') return
        const container = document.getElementById('editor-canvas-container')
        this.canvas.setDimensions({
            width: container.clientWidth,
            height: container.clientHeight
        })

        if (this.mainImage) {
            this.centerImage()
        }
    }

    async loadImage() {
        try {
            const ImageClass = fabric.FabricImage || fabric.Image
            const imgObj = await ImageClass.fromURL(`file://${this.originalPath}`)

            this.mainImage = imgObj
            this.centerImage()

            // Set up filters array
            // 0: Brightness, 1: Contrast, 2: Saturation, 3: Blur, 4: Noise/Grain, 5: Temperature/Tint, 6: Preset
            this.mainImage.filters = new Array(10).fill(null)

            this.canvas.add(imgObj)
            this.canvas.sendObjectToBack(imgObj)
            this.canvas.renderAll()
        } catch (e) {
            console.error('Failed to load image:', e)
        }
    }

    handleZoom(factor) {
        if (!this.canvas) return

        let zoom = this.canvas.getZoom()
        zoom *= factor
        if (zoom > 5) zoom = 5
        if (zoom < 0.1) zoom = 0.1

        this.canvas.zoomToPoint(new fabric.Point(this.canvas.width / 2, this.canvas.height / 2), zoom)
        this.canvas.requestRenderAll()
    }

    centerImage() {
        if (!this.mainImage) return

        this.canvas.setZoom(1)

        const padding = 40
        const availableW = this.canvas.width - padding
        const availableH = this.canvas.height - padding

        // Reset scale to 1 to calculate ratios
        this.mainImage.scale(1)

        const scaleX = availableW / this.mainImage.width
        const scaleY = availableH / this.mainImage.height
        const scale = Math.min(scaleX, scaleY, 1)

        this.mainImage.set({
            left: this.canvas.width / 2,
            top: this.canvas.height / 2,
            originX: 'center',
            originY: 'center',
            scaleX: scale,
            scaleY: scale,
            selectable: false,
            evented: false
        })

        this.canvas.renderAll()
    }

    setMode(mode) {
        // Cleanup previous mode
        if (this.mode === 'crop') this.endCrop()
        if (this.mode === 'draw') {
            this.canvas.isDrawingMode = false
            this.canvas.off('mouse:down', this.drawMouseDown)
            this.canvas.off('mouse:move', this.drawMouseMove)
            this.canvas.off('mouse:up', this.drawMouseUp)
        }

        this.mode = mode

        // Update Nav UI
        document.querySelectorAll('.editor-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode)
        })

        this.renderSubToolbar(mode)

        // Setup new mode
        if (mode === 'crop') {
            this.startCrop()
        } else if (mode === 'draw') {
            this.setupDrawMode()
        } else if (mode === 'text') {
            // Text mode just enables adding text
        }
    }

    renderSubToolbar(mode) {
        const container = document.getElementById('editor-sub-toolbar')
        container.innerHTML = '' // Clear

        if (mode === 'adjust') {
            this.renderAdjustControls(container)
        } else if (mode === 'crop') {
            this.renderCropControls(container)
        } else if (mode === 'filter') {
            this.renderFilterControls(container)
        } else if (mode === 'draw') {
            this.renderDrawControls(container)
        } else if (mode === 'text') {
            this.renderTextControls(container)
        } else if (mode === 'export') {
            this.renderExportControls(container)
        }
    }

    // ─── Mode Controls Renders ──────────────────────────────────────────

    renderAdjustControls(container) {
        // Auto Enhance Button
        const autoBtn = document.createElement('button')
        autoBtn.className = 'editor-btn primary'
        autoBtn.style.marginBottom = '12px'
        autoBtn.style.width = '100%'
        autoBtn.innerHTML = '✨ Auto Enhance'
        autoBtn.addEventListener('click', () => {
            this.adjustments.brightness = 0.05
            this.adjustments.contrast = 0.1
            this.adjustments.saturation = 0.1
            this.applyAdjustment('brightness', 0.05)
            this.applyAdjustment('contrast', 0.1)
            this.applyAdjustment('saturation', 0.1)
            // Update sliders
            this.renderSubToolbar('adjust')
            this.saveState()
        })
        container.appendChild(autoBtn)

        const sliders = [
            { id: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.01 },
            { id: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.01 },
            { id: 'saturation', label: 'Saturation', min: -1, max: 1, step: 0.01 },
            { id: 'temperature', label: 'Warmth', min: -1, max: 1, step: 0.01 },
            { id: 'blur', label: 'Blur', min: 0, max: 1, step: 0.01 },
            { id: 'sharpness', label: 'Sharpness', min: 0, max: 1, step: 0.01 },
            { id: 'grain', label: 'Grain', min: 0, max: 1, step: 0.01 },
            { id: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01 },
        ]

        sliders.forEach(s => {
            const wrap = document.createElement('div')
            wrap.className = 'slider-container'

            const label = document.createElement('div')
            label.className = 'slider-label'
            label.innerHTML = `<span>${s.label}</span><span>${Math.round(this.adjustments[s.id] * 100)}</span>`

            const input = document.createElement('input')
            input.type = 'range'
            input.min = s.min
            input.max = s.max
            input.step = s.step
            input.value = this.adjustments[s.id]

            input.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value)
                this.adjustments[s.id] = val
                label.lastElementChild.textContent = Math.round(val * 100)
                this.applyAdjustment(s.id, val)
            })

            input.addEventListener('change', () => this.saveState())

            wrap.appendChild(label)
            wrap.appendChild(input)
            container.appendChild(wrap)
        })
    }

    renderCropControls(container) {
        const ratios = [
            { label: 'Free', value: null },
            { label: '1:1', value: 1 },
            { label: '4:5', value: 0.8 },
            { label: '16:9', value: 1.777 },
            { label: '4:3', value: 1.333 },
            { label: '2:3', value: 0.666 }
        ]

        const ratioGroup = document.createElement('div')
        ratioGroup.className = 'sub-tool-group'
        ratios.forEach(r => {
            const btn = document.createElement('button')
            btn.className = `editor-btn ${this.cropRatio === r.value ? 'active' : ''}`
            btn.textContent = r.label
            btn.addEventListener('click', () => {
                this.cropRatio = r.value
                this.updateCropRect()
                // Update active state
                Array.from(ratioGroup.children).forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
            })
            ratioGroup.appendChild(btn)
        })
        container.appendChild(ratioGroup)

        // Actions
        const actionGroup = document.createElement('div')
        actionGroup.className = 'sub-tool-group'
        actionGroup.style.marginLeft = '16px'

        const rotateBtn = document.createElement('button')
        rotateBtn.className = 'editor-btn'
        rotateBtn.innerHTML = 'Rotate'
        rotateBtn.addEventListener('click', () => {
            this.rotateImage(90)
            this.saveState()
        })

        const flipBtn = document.createElement('button')
        flipBtn.className = 'editor-btn'
        flipBtn.innerHTML = 'Flip H'
        flipBtn.addEventListener('click', () => {
            this.mainImage.set('flipX', !this.mainImage.flipX)
            this.canvas.renderAll()
            this.saveState()
        })

        const resizeBtn = document.createElement('button')
        resizeBtn.className = 'editor-btn'
        resizeBtn.innerHTML = 'Resize'
        resizeBtn.addEventListener('click', () => this.showResizeDialog())

        const applyBtn = document.createElement('button')
        applyBtn.className = 'editor-btn primary'
        applyBtn.innerHTML = 'Apply'
        applyBtn.addEventListener('click', () => this.applyCrop())

        actionGroup.appendChild(rotateBtn)
        actionGroup.appendChild(flipBtn)
        actionGroup.appendChild(resizeBtn)
        actionGroup.appendChild(applyBtn)
        container.appendChild(actionGroup)
    }

    showResizeDialog() {
        const w = Math.round(this.mainImage.width * this.mainImage.scaleX)
        const h = Math.round(this.mainImage.height * this.mainImage.scaleY)
        const newW = prompt('Enter new width:', w)
        if (newW && !isNaN(newW)) {
            const factor = parseInt(newW) / w
            this.mainImage.scale(this.mainImage.scaleX * factor)
            this.centerImage()
            this.saveState()
        }
    }

    getSmallImageDataUrl() {
        if (!this.mainImage) return ''
        const el = this.mainImage.getElement()
        const cvs = document.createElement('canvas')
        const size = 80
        cvs.width = size
        cvs.height = size
        const ctx = cvs.getContext('2d')
        const aspect = el.width / el.height
        let sx, sy, sw, sh
        if (aspect > 1) {
            sh = el.height
            sw = el.height
            sx = (el.width - el.height) / 2
            sy = 0
        } else {
            sw = el.width
            sh = el.width
            sx = 0
            sy = (el.height - el.width) / 2
        }
        ctx.drawImage(el, sx, sy, sw, sh, 0, 0, size, size)
        return cvs.toDataURL('image/jpeg', 0.8)
    }

    renderFilterControls(container) {
        const presets = [
            { id: 'none', label: 'None' },
            { id: 'grayscale', label: 'B&W' },
            { id: 'sepia', label: 'Sepia' },
            { id: 'warm', label: 'Warm' },
            { id: 'cool', label: 'Cool' },
            { id: 'vintage', label: 'Vintage' },
            { id: 'cinematic', label: 'Cinema' },
            { id: 'vibrant', label: 'Vibrant' },
            { id: 'matte', label: 'Matte' },
            { id: 'invert', label: 'Invert' },
        ]

        const thumbUrl = this.getSmallImageDataUrl()

        // Preset List
        const list = document.createElement('div')
        list.style.display = 'flex'
        list.style.gap = '8px'
        list.style.overflowX = 'auto'
        list.style.paddingBottom = '8px'
        list.style.marginBottom = '8px'

        presets.forEach(p => {
            const btn = document.createElement('div')
            btn.className = `filter-preset ${this.activePreset === p.id ? 'active' : ''}`

            const preview = document.createElement('div')
            preview.className = 'filter-preview'
            if (thumbUrl) {
                preview.style.backgroundImage = `url(${thumbUrl})`
                preview.style.backgroundSize = 'cover'

                // CSS Filters for preview approximation
                switch (p.id) {
                    case 'grayscale': preview.style.filter = 'grayscale(1)'; break;
                    case 'sepia': preview.style.filter = 'sepia(1)'; break;
                    case 'invert': preview.style.filter = 'invert(1)'; break;
                    case 'warm': preview.style.filter = 'sepia(0.4) saturate(1.5) hue-rotate(-10deg)'; break;
                    case 'cool': preview.style.filter = 'hue-rotate(180deg) sepia(0.1) saturate(0.8)'; break;
                    case 'vintage': preview.style.filter = 'sepia(0.6) contrast(0.8)'; break;
                    case 'cinematic': preview.style.filter = 'contrast(1.2) saturate(1.2) sepia(0.2)'; break;
                    case 'vibrant': preview.style.filter = 'saturate(2)'; break;
                    case 'matte': preview.style.filter = 'contrast(0.8) brightness(1.2)'; break;
                }
            } else {
                preview.style.backgroundColor = '#555'
            }

            const name = document.createElement('div')
            name.className = 'filter-name'
            name.textContent = p.label

            btn.appendChild(preview)
            btn.appendChild(name)

            btn.addEventListener('click', () => {
                this.activePreset = p.id
                this.applyPreset()
                // Update active state
                Array.from(list.children).forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
            })

            list.appendChild(btn)
        })
        container.appendChild(list)

        // Intensity Slider
        const sliderWrap = document.createElement('div')
        sliderWrap.className = 'slider-container'
        sliderWrap.style.width = '200px'

        const label = document.createElement('div')
        label.className = 'slider-label'
        label.innerHTML = `<span>Intensity</span><span>${Math.round(this.presetIntensity * 100)}</span>`

        const input = document.createElement('input')
        input.type = 'range'
        input.min = 0
        input.max = 1
        input.step = 0.05
        input.value = this.presetIntensity

        input.addEventListener('input', (e) => {
            this.presetIntensity = parseFloat(e.target.value)
            label.lastElementChild.textContent = Math.round(this.presetIntensity * 100)
            this.applyPreset(null, false)
        })
        input.addEventListener('change', () => {
            this.saveState()
        })

        sliderWrap.appendChild(label)
        sliderWrap.appendChild(input)
        container.appendChild(sliderWrap)
    }

    renderDrawControls(container) {
        let previewDot = null
        // Tools: Select, Pencil, Arrow, Line, Rect, Circle, Blur
        const tools = [
            { id: 'select', icon: '👆', label: 'Select (0)', shortcut: '0' },
            { id: 'pencil', icon: '✎', label: 'Pencil (5)', shortcut: '5' },
            { id: 'arrow', icon: '↗', label: 'Arrow (1)', shortcut: '1' },
            { id: 'line', icon: '/', label: 'Line (4)', shortcut: '4' },
            { id: 'rect', icon: '□', label: 'Rect (2)', shortcut: '2' },
            { id: 'circle', icon: '○', label: 'Circle (3)', shortcut: '3' },
            { id: 'blur', icon: '💧', label: 'Blur (6)', shortcut: '6' }
        ]

        const toolGroup = document.createElement('div')
        toolGroup.className = 'sub-tool-group'

        tools.forEach(t => {
            const btn = document.createElement('button')
            btn.className = `editor-btn ${this.drawTool === t.id ? 'active' : ''}`
            btn.innerHTML = `
                <span style="font-size: 20px;">${t.icon}</span>
                <span style="position: absolute; bottom: 2px; right: 4px; font-size: 10px; opacity: 0.6; font-weight: bold;">${t.shortcut}</span>
            `
            btn.style.position = 'relative'
            btn.style.padding = '4px 8px'
            btn.title = t.label
            btn.dataset.tool = t.id
            btn.addEventListener('click', () => {
                this.drawTool = t.id
                this.setupDrawMode()
                Array.from(toolGroup.children).forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
            })
            toolGroup.appendChild(btn)
        })
        container.appendChild(toolGroup)

        // Colors
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ffffff', '#000000']
        const colorGroup = document.createElement('div')
        colorGroup.className = 'sub-tool-group'
        colorGroup.style.marginLeft = '16px'
        colorGroup.style.display = 'flex'
        colorGroup.style.alignItems = 'center'
        colorGroup.style.gap = '6px'

        const setColor = (c) => {
            this.drawColor = c
            if (previewDot) previewDot.style.backgroundColor = c
            this.setupDrawMode()

            // Update active object color if any
            const active = this.canvas.getActiveObject()
            if (active) {
                if (active.type === 'i-text') {
                    active.set('fill', c)
                } else if (active.type === 'group' && active.objectType === 'arrow') {
                    active.getObjects().forEach(o => {
                        o.set('stroke', c)
                        if (o.type === 'triangle') o.set('fill', c)
                    })
                } else {
                    if (active.stroke) active.set('stroke', c)
                    if (active.fill && active.fill !== 'transparent') active.set('fill', c)
                }
                this.canvas.requestRenderAll()
                this.saveState()
            }
        }

        // Custom Color Picker
        const picker = document.createElement('input')
        picker.type = 'color'
        picker.value = this.drawColor
        picker.style.width = '28px'
        picker.style.height = '28px'
        picker.style.padding = '0'
        picker.style.border = '1px solid #555'
        picker.style.borderRadius = '4px'
        picker.style.backgroundColor = 'transparent'
        picker.style.cursor = 'pointer'

        picker.addEventListener('input', (e) => {
            setColor(e.target.value)
            Array.from(colorGroup.children).forEach(b => {
                if (b.tagName === 'BUTTON') b.classList.remove('active')
            })
        })

        colors.forEach(c => {
            const btn = document.createElement('button')
            btn.className = `color-picker-btn ${this.drawColor === c ? 'active' : ''}`
            btn.style.backgroundColor = c
            btn.addEventListener('click', () => {
                setColor(c)
                Array.from(colorGroup.children).forEach(b => {
                    if (b.tagName === 'BUTTON') b.classList.remove('active')
                })
                btn.classList.add('active')
                picker.value = c
            })
            colorGroup.appendChild(btn)
        })

        colorGroup.appendChild(picker)
        container.appendChild(colorGroup)

        // Size Slider
        const sizeContainer = document.createElement('div')
        sizeContainer.className = 'slider-container'
        sizeContainer.style.width = '160px'
        sizeContainer.style.marginLeft = '16px'
        sizeContainer.style.display = 'flex'
        sizeContainer.style.alignItems = 'center'
        sizeContainer.style.gap = '8px'

        const label = document.createElement('div')
        label.className = 'slider-label'
        label.style.minWidth = '40px'
        label.innerHTML = `<span>Size</span><span>${this.drawSize}</span>`

        const input = document.createElement('input')
        input.type = 'range'
        input.min = 1
        input.max = 50
        input.value = this.drawSize
        input.style.flex = '1'

        previewDot = document.createElement('div')
        previewDot.style.width = `${this.drawSize}px`
        previewDot.style.height = `${this.drawSize}px`
        previewDot.style.backgroundColor = this.drawColor
        previewDot.style.borderRadius = '50%'
        previewDot.style.flexShrink = '0'
        previewDot.style.transition = 'width 0.1s, height 0.1s'

        input.addEventListener('input', (e) => {
            this.drawSize = parseInt(e.target.value)
            label.lastElementChild.textContent = this.drawSize
            previewDot.style.width = `${this.drawSize}px`
            previewDot.style.height = `${this.drawSize}px`
            this.setupDrawMode()

            // Update active object stroke width
            const active = this.canvas.getActiveObject()
            if (active && active.type !== 'i-text') {
                if (active.type === 'group' && active.objectType === 'arrow') {
                    active.getObjects().forEach(o => {
                        if (o.type === 'line') o.set('strokeWidth', this.drawSize)
                    })
                } else {
                    if (active.strokeWidth !== undefined) active.set('strokeWidth', this.drawSize)
                }
                this.canvas.requestRenderAll()
                this.saveState()
            }
        })

        sizeContainer.appendChild(label)
        sizeContainer.appendChild(input)
        sizeContainer.appendChild(previewDot)
        container.appendChild(sizeContainer)
    }

    renderTextControls(container) {
        const addBtn = document.createElement('button')
        addBtn.className = 'editor-btn primary'
        addBtn.innerHTML = '+ Add Text'
        addBtn.addEventListener('click', () => {
            const text = new fabric.IText('Double click to edit', {
                left: this.canvas.width / 2,
                top: this.canvas.height / 2,
                originX: 'center',
                originY: 'center',
                fontFamily: 'system-ui',
                fill: '#ffffff',
                fontSize: 40
            })
            this.canvas.add(text)
            this.canvas.setActiveObject(text)
            this.saveState()
        })
        container.appendChild(addBtn)

        // Colors
        const colors = ['#ffffff', '#000000', '#ff0000', '#ffff00', '#00ff00', '#0000ff']
        const colorGroup = document.createElement('div')
        colorGroup.className = 'sub-tool-group'
        colorGroup.style.marginLeft = '16px'
        colorGroup.style.display = 'flex'
        colorGroup.style.alignItems = 'center'
        colorGroup.style.gap = '6px'

        const updateTextColor = (c) => {
            const activeObj = this.canvas.getActiveObject()
            if (activeObj && activeObj.type === 'i-text') {
                activeObj.set('fill', c)
                this.canvas.requestRenderAll()
                this.saveState()
            }
        }

        // Custom Color Picker
        const picker = document.createElement('input')
        picker.type = 'color'
        picker.value = '#ffffff'

        const active = this.canvas.getActiveObject()
        if (active && active.type === 'i-text') {
            picker.value = active.fill
        }

        picker.style.width = '28px'
        picker.style.height = '28px'
        picker.style.padding = '0'
        picker.style.border = '1px solid #555'
        picker.style.borderRadius = '4px'
        picker.style.backgroundColor = 'transparent'
        picker.style.cursor = 'pointer'

        picker.addEventListener('input', (e) => {
            updateTextColor(e.target.value)
        })

        colors.forEach(c => {
            const btn = document.createElement('button')
            btn.className = 'color-picker-btn'
            btn.style.backgroundColor = c
            btn.addEventListener('click', () => {
                updateTextColor(c)
                picker.value = c
            })
            colorGroup.appendChild(btn)
        })

        colorGroup.appendChild(picker)
        container.appendChild(colorGroup)
    }

    renderExportControls(container) {
        // Quality Slider
        const qWrap = document.createElement('div')
        qWrap.className = 'slider-container'
        qWrap.style.marginBottom = '16px'

        const qLabel = document.createElement('div')
        qLabel.className = 'slider-label'
        qLabel.innerHTML = `<span>Quality</span><span>${Math.round(this.exportQuality * 100)}%</span>`

        const qInput = document.createElement('input')
        qInput.type = 'range'
        qInput.min = 0.1
        qInput.max = 1
        qInput.step = 0.1
        qInput.value = this.exportQuality
        qInput.addEventListener('input', (e) => {
            this.exportQuality = parseFloat(e.target.value)
            qLabel.lastElementChild.textContent = Math.round(this.exportQuality * 100) + '%'
        })

        qWrap.appendChild(qLabel)
        qWrap.appendChild(qInput)
        container.appendChild(qWrap)

        const btnJpg = document.createElement('button')
        btnJpg.className = 'editor-btn primary'
        btnJpg.innerHTML = 'Save as JPG'
        btnJpg.style.marginRight = '8px'
        btnJpg.addEventListener('click', () => this.save('jpeg'))

        const btnPng = document.createElement('button')
        btnPng.className = 'editor-btn primary'
        btnPng.innerHTML = 'Save as PNG'
        btnPng.addEventListener('click', () => this.save('png'))

        const btnWebp = document.createElement('button')
        btnWebp.className = 'editor-btn primary'
        btnWebp.innerHTML = 'Save as WebP'
        btnWebp.addEventListener('click', () => this.save('webp'))

        container.appendChild(btnJpg)
        container.appendChild(btnPng)
        container.appendChild(btnWebp)
    }

    // ─── Implementation Details ──────────────────────────────────────────

    applyAdjustment(type, value) {
        if (!this.mainImage) return

        // 0: Brightness, 1: Contrast, 2: Saturation, 3: Blur, 4: Sharpness, 5: Temperature

        let filter = null
        // Map types to fabric filters
        if (type === 'brightness') {
            filter = new fabric.filters.Brightness({ brightness: value })
            this.mainImage.filters[0] = filter
        } else if (type === 'contrast') {
            filter = new fabric.filters.Contrast({ contrast: value })
            this.mainImage.filters[1] = filter
        } else if (type === 'saturation') {
            filter = new fabric.filters.Saturation({ saturation: value })
            this.mainImage.filters[2] = filter
        } else if (type === 'blur') {
            filter = value > 0 ? new fabric.filters.Blur({ blur: value * 20 }) : null
            this.mainImage.filters[3] = filter
        } else if (type === 'sharpness') {
            // Interpolate matrix based on value
            // Identity: [0,0,0, 0,1,0, 0,0,0]
            // Sharpen:  [0,-1,0, -1,5,-1, 0,-1,0]
            // Delta:    [0,-1,0, -1,4,-1, 0,-1,0]

            if (value <= 0) {
                filter = null
            } else {
                const v = value // 0 to 1
                const matrix = [
                    0, -v, 0,
                    -v, 1 + 4 * v, -v,
                    0, -v, 0
                ]
                filter = new fabric.filters.Convolute({ matrix: matrix })
            }
            this.mainImage.filters[4] = filter
        } else if (type === 'temperature') {
            // Warm (orange) or Cool (blue)
            const color = value > 0 ? '#ffb700' : '#0066ff'
            filter = value !== 0 ? new fabric.filters.BlendColor({
                color: color,
                mode: 'tint',
                alpha: Math.abs(value) * 0.5
            }) : null
            this.mainImage.filters[5] = filter
        } else if (type === 'grain') {
            filter = value > 0 ? new fabric.filters.Noise({ noise: value * 100 }) : null
            this.mainImage.filters[7] = filter
        } else if (type === 'vignette') {
            // Vignette is tricky as a filter.
            // Best to use an overlay object or just simulate with a radial gradient on an overlay rect?
            // But managing the overlay rect is hard in this function.
            // Alternative: Use a 'Composed' filter if we had one.
            // Simplest: Just use a Noise filter for now if Vignette is too hard?
            // Or skip Vignette for now if it requires object management.
            // Let's try to manage a vignette object.
            this.updateVignette(value)
            // Return early as we don't set a filter on mainImage
            this.canvas.renderAll()
            return
        }

        this.mainImage.applyFilters()
        this.canvas.renderAll()
    }

    updateVignette(value) {
        // value 0 to 1
        if (value <= 0) {
            if (this.vignetteOverlay) {
                this.canvas.remove(this.vignetteOverlay)
                this.vignetteOverlay = null
            }
            return
        }

        if (!this.vignetteOverlay) {
            const width = this.canvas.width
            const height = this.canvas.height

            // Create a radial gradient
            // Fabric doesn't support radial gradient on Rect easily in all versions?
            // It does.
            this.vignetteOverlay = new fabric.Rect({
                left: 0,
                top: 0,
                width: width,
                height: height,
                selectable: false,
                evented: false,
                excludeFromHistory: true // Don't track this in history? Or maybe yes?
            })
            this.canvas.add(this.vignetteOverlay)
            this.canvas.bringObjectToFront(this.vignetteOverlay)
        }

        // Update gradient
        const opacity = value
        // We want transparent in center, black at edges
        // Gradient: center (0,0) radius r
        // But rect is top/left.
        // Let's just use a simple color overlay with 'overlay' mode? No that's flat.
        // Use SVG radial gradient?

        // Let's try to set a gradient
        const grad = new fabric.Gradient({
            type: 'radial',
            coords: {
                r1: 0,
                r2: Math.max(this.canvas.width, this.canvas.height) / 1.5,
                x1: this.canvas.width / 2,
                y1: this.canvas.height / 2,
                x2: this.canvas.width / 2,
                y2: this.canvas.height / 2,
            },
            colorStops: [
                { offset: 0, color: 'transparent' },
                { offset: 0.5, color: `rgba(0,0,0,${opacity * 0.2})` },
                { offset: 1, color: `rgba(0,0,0,${opacity})` }
            ]
        })

        this.vignetteOverlay.set({
            width: this.canvas.width,
            height: this.canvas.height,
            fill: grad
        })
        this.canvas.bringObjectToFront(this.vignetteOverlay)
    }

    applyPreset(id, save = true) {
        if (!this.mainImage) return
        if (id) this.activePreset = id

        const presetId = this.activePreset
        const intensity = this.presetIntensity

        // Clear preset filter slot (index 6)
        this.mainImage.filters[6] = null

        if (presetId === 'grayscale') {
            this.mainImage.filters[6] = new fabric.filters.Saturation({ saturation: -1 * intensity })
        } else if (presetId === 'sepia') {
            this.mainImage.filters[6] = new fabric.filters.BlendColor({
                color: '#5b3c11',
                mode: 'tint',
                alpha: 0.6 * intensity
            })
        } else if (presetId === 'invert') {
            // Only apply if intensity is high enough
            if (intensity > 0.1) {
                this.mainImage.filters[6] = new fabric.filters.Invert()
            }
        } else if (presetId === 'warm') {
            this.mainImage.filters[6] = new fabric.filters.BlendColor({
                color: '#ff9900',
                mode: 'tint',
                alpha: 0.3 * intensity
            })
        } else if (presetId === 'cool') {
            this.mainImage.filters[6] = new fabric.filters.BlendColor({
                color: '#0044cc',
                mode: 'tint',
                alpha: 0.3 * intensity
            })
        } else if (presetId === 'vintage') {
            this.mainImage.filters[6] = new fabric.filters.BlendColor({
                color: '#5b3c11',
                mode: 'tint',
                alpha: 0.5 * intensity
            })
        } else if (presetId === 'cinematic') {
            this.mainImage.filters[6] = new fabric.filters.BlendColor({
                color: '#00ddff',
                mode: 'overlay',
                alpha: 0.2 * intensity
            })
        } else if (presetId === 'vibrant') {
            this.mainImage.filters[6] = new fabric.filters.Saturation({ saturation: 0.5 * intensity })
        } else if (presetId === 'matte') {
            this.mainImage.filters[6] = new fabric.filters.Contrast({ contrast: -0.2 * intensity })
        }

        this.mainImage.applyFilters()
        this.canvas.renderAll()
        if (save) this.saveState()
    }

    // ─── Draw Mode ───────────────────────────────────────────────────────

    setupDrawMode() {
        this.canvas.isDrawingMode = false
        this.canvas.selection = false
        this.canvas.off('mouse:down', this.drawMouseDown)
        this.canvas.off('mouse:move', this.drawMouseMove)
        this.canvas.off('mouse:up', this.drawMouseUp)

        const isSelectTool = this.drawTool === 'select'

        // Update object selectability
        this.canvas.getObjects().forEach(obj => {
            if (obj === this.mainImage) {
                obj.selectable = false
                obj.evented = false
            } else {
                obj.selectable = isSelectTool
                obj.evented = isSelectTool
            }
        })
        this.canvas.requestRenderAll()

        if (isSelectTool) {
            this.canvas.selection = true
            return
        }

        if (this.drawTool === 'pencil') {
            this.canvas.isDrawingMode = true
            this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas)
            this.canvas.freeDrawingBrush.color = this.drawColor
            this.canvas.freeDrawingBrush.width = this.drawSize
        } else {
            // Shape tools
            this.canvas.isDrawingMode = false
            this.drawMouseDown = this.onDrawMouseDown.bind(this)
            this.drawMouseMove = this.onDrawMouseMove.bind(this)
            this.drawMouseUp = this.onDrawMouseUp.bind(this)

            this.canvas.on('mouse:down', this.drawMouseDown)
            this.canvas.on('mouse:move', this.drawMouseMove)
            this.canvas.on('mouse:up', this.drawMouseUp)
        }
    }

    onDrawMouseDown(o) {
        if (this.mode !== 'draw' || this.drawTool === 'pencil' || this.drawTool === 'select') return

        // Don't start drawing if clicking on an existing object
        if (o.target && o.target !== this.mainImage) return
        this.isDrawing = true
        const pointer = this.canvas.getScenePoint(o.e)
        this.origX = pointer.x
        this.origY = pointer.y

        if (this.drawTool === 'rect' || this.drawTool === 'blur') {
            this.activeShape = new fabric.Rect({
                left: this.origX,
                top: this.origY,
                originX: 'left',
                originY: 'top',
                width: pointer.x - this.origX,
                height: pointer.y - this.origY,
                angle: 0,
                fill: this.drawTool === 'blur' ? 'rgba(255,255,255,0.3)' : 'transparent',
                stroke: this.drawTool === 'blur' ? 'transparent' : this.drawColor,
                strokeWidth: this.drawTool === 'blur' ? 0 : this.drawSize,
                transparentCorners: false
            })
        } else if (this.drawTool === 'circle') {
            this.activeShape = new fabric.Circle({
                left: this.origX,
                top: this.origY,
                originX: 'left',
                originY: 'top',
                radius: 1,
                fill: 'transparent',
                stroke: this.drawColor,
                strokeWidth: this.drawSize
            })
        } else if (this.drawTool === 'line') {
            const points = [this.origX, this.origY, this.origX, this.origY]
            this.activeShape = new fabric.Line(points, {
                strokeWidth: this.drawSize,
                fill: this.drawColor,
                stroke: this.drawColor,
                selectable: false,
                evented: false,
                originX: 'left',
                originY: 'top',
                excludeFromHistory: true
            })
        } else if (this.drawTool === 'arrow') {
            // Create Line
            const points = [this.origX, this.origY, this.origX, this.origY]
            this.arrowLine = new fabric.Line(points, {
                strokeWidth: this.drawSize,
                fill: this.drawColor,
                stroke: this.drawColor,
                selectable: false,
                evented: false,
                originX: 'center',
                originY: 'center',
                excludeFromHistory: true
            })

            // Create Head
            this.arrowHead = new fabric.Triangle({
                left: this.origX,
                top: this.origY,
                originX: 'center',
                originY: 'center',
                width: this.drawSize * 3,
                height: this.drawSize * 3,
                fill: this.drawColor,
                selectable: false,
                evented: false,
                excludeFromHistory: true
            })

            this.canvas.add(this.arrowLine)
            this.canvas.add(this.arrowHead)
            this.activeShape = this.arrowLine // Mark as active so we know we are drawing
        }

        if (this.activeShape && this.drawTool !== 'arrow') {
            this.canvas.add(this.activeShape)
        }
    }

    onDrawMouseMove(o) {
        if (!this.isDrawing || !this.activeShape) return
        const pointer = this.canvas.getScenePoint(o.e)

        if (this.drawTool === 'rect' || this.drawTool === 'blur') {
            if (this.origX > pointer.x) {
                this.activeShape.set({ left: Math.abs(pointer.x) })
            }
            if (this.origY > pointer.y) {
                this.activeShape.set({ top: Math.abs(pointer.y) })
            }
            this.activeShape.set({ width: Math.abs(this.origX - pointer.x) })
            this.activeShape.set({ height: Math.abs(this.origY - pointer.y) })
        } else if (this.drawTool === 'circle') {
            const radius = Math.abs(this.origX - pointer.x) / 2
            this.activeShape.set({ radius: radius })
            if (this.origX > pointer.x) {
                this.activeShape.set({ left: pointer.x })
            }
        } else if (this.drawTool === 'line') {
            this.activeShape.set({ x2: pointer.x, y2: pointer.y })
        } else if (this.drawTool === 'arrow') {
            if (!this.arrowLine || !this.arrowHead) return

            // Update Line
            this.arrowLine.set({ x2: pointer.x, y2: pointer.y })

            // Update Head
            const x1 = this.origX
            const y1 = this.origY
            const x2 = pointer.x
            const y2 = pointer.y

            const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI

            this.arrowHead.set({
                left: x2,
                top: y2,
                angle: angle + 90
            })

            this.arrowLine.setCoords()
            this.arrowHead.setCoords()
        }

        if (this.activeShape && this.drawTool !== 'arrow') {
            this.activeShape.setCoords()
        }

        this.canvas.requestRenderAll()
    }

    onDrawMouseUp(o) {
        if (this.isDrawing) {
            this.isDrawing = false

            if (this.drawTool === 'arrow' && this.arrowLine && this.arrowHead) {
                // Finalize Arrow
                const x1 = this.arrowLine.x1
                const y1 = this.arrowLine.y1
                const x2 = this.arrowLine.x2
                const y2 = this.arrowLine.y2

                // Remove temp objects
                this.canvas.remove(this.arrowLine)
                this.canvas.remove(this.arrowHead)

                // Check length
                const dx = x2 - x1
                const dy = y2 - y1
                const len = Math.sqrt(dx * dx + dy * dy)

                if (len >= 5) {
                    // Re-create as a Group for the final object
                    const line = new fabric.Line([x1, y1, x2, y2], {
                        strokeWidth: this.drawSize,
                        fill: this.drawColor,
                        stroke: this.drawColor,
                        originX: 'center',
                        originY: 'center'
                    })

                    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
                    const head = new fabric.Triangle({
                        left: x2,
                        top: y2,
                        originX: 'center',
                        originY: 'center',
                        angle: angle + 90,
                        width: this.drawSize * 3,
                        height: this.drawSize * 3,
                        fill: this.drawColor
                    })

                    const group = new fabric.Group([line, head], {
                        selectable: false, // Wait for Select tool
                        evented: true,
                        objectType: 'arrow'
                    })

                    this.canvas.add(group)
                }

                this.arrowLine = null
                this.arrowHead = null
                this.activeShape = null
            } else if (this.drawTool === 'blur' && this.activeShape) {
                // Convert the temporary rect to a blurred image clone
                const left = this.activeShape.left
                const top = this.activeShape.top
                const width = this.activeShape.width * this.activeShape.scaleX
                const height = this.activeShape.height * this.activeShape.scaleY

                this.canvas.remove(this.activeShape)

                // Crop the main image area
                // This is complex because we need to crop relative to the image
                // Simplification: Take a snapshot of that area
                // Note: this snapshots existing drawings too, which is probably what we want
                try {
                    const dataUrl = this.canvas.toDataURL({
                        left: left,
                        top: top,
                        width: width,
                        height: height,
                        format: 'png'
                    })

                    fabric.FabricImage.fromURL(dataUrl).then((img) => {
                        img.set({
                            left: left,
                            top: top,
                            width: width,
                            height: height
                        })
                        img.filters.push(new fabric.filters.Blur({ blur: 0.5 })) // Heavy blur
                        img.applyFilters()
                        this.canvas.add(img)
                    })
                } catch (e) {
                    console.error(e)
                }
                return
            }

            this.activeShape = null
            this.saveState()
        }
    }

    // ─── Crop ────────────────────────────────────────────────────────────

    startCrop() {
        if (!this.mainImage) return

        // Add a crop rect
        const width = this.mainImage.getScaledWidth()
        const height = this.mainImage.getScaledHeight()

        this.cropRect = new fabric.Rect({
            left: this.mainImage.left,
            top: this.mainImage.top,
            originX: 'center',
            originY: 'center',
            width: width * 0.8,
            height: height * 0.8,
            fill: 'rgba(0,0,0,0.3)', // Dim slightly to show it's a selection? No, usually outside is dimmed.
            // Better: transparent fill, but we can't easily dim outside without an overlay.
            // For now, clear fill, white dashed border.
            fill: 'transparent',
            stroke: 'white',
            strokeWidth: 2,
            strokeDashArray: [5, 5],
            cornerColor: 'white',
            cornerStrokeColor: 'black',
            borderColor: 'white',
            cornerSize: 12,
            transparentCorners: false,
            lockRotation: true,
            excludeFromHistory: true
        })

        this.canvas.add(this.cropRect)
        this.canvas.setActiveObject(this.cropRect)

        // Handle aspect ratio scaling
        this.cropRect.on('scaling', () => {
            if (this.cropRatio) {
                const w = this.cropRect.width * this.cropRect.scaleX
                const h = w / this.cropRatio
                this.cropRect.set({
                    height: h / this.cropRect.scaleY
                })
            }
        })

        this.canvas.renderAll()
    }

    updateCropRect() {
        if (!this.cropRect || !this.cropRatio) return
        // Force aspect ratio
        const currentW = this.cropRect.getScaledWidth()
        const newH = currentW / this.cropRatio

        this.cropRect.set({ height: newH, scaleY: 1 })

        // If ratio is set, lock uni scaling to make it easier (optional, but good for UX)
        // Actually, just enforcing it in scaling event is enough.

        this.canvas.renderAll()
    }

    endCrop() {
        if (this.cropRect) {
            this.canvas.remove(this.cropRect)
            this.cropRect = null
        }
    }

    applyCrop() {
        if (!this.cropRect || !this.mainImage) return

        // Calculate crop relative to image
        const cropRect = this.cropRect
        const image = this.mainImage

        const scaleX = image.scaleX
        const scaleY = image.scaleY

        // Get crop coordinates relative to canvas
        const left = cropRect.left - (cropRect.getScaledWidth() / 2)
        const top = cropRect.top - (cropRect.getScaledHeight() / 2)
        const width = cropRect.getScaledWidth()
        const height = cropRect.getScaledHeight()

        // Create a temporary canvas to crop
        const tempCanvas = document.createElement('canvas')
        const tempCtx = tempCanvas.getContext('2d')
        tempCanvas.width = width
        tempCanvas.height = height

        // Draw the visible canvas area to temp canvas
        // Note: simplest way is to use toDataURL with crop options
        const dataURL = this.canvas.toDataURL({
            left: left,
            top: top,
            width: width,
            height: height,
            format: 'png'
        })

        // Replace main image
        fabric.FabricImage.fromURL(dataURL).then((newImg) => {
            this.canvas.clear()
            this.mainImage = newImg
            this.centerImage()
            this.canvas.add(newImg)
            this.canvas.sendToBack(newImg)

            // Re-initialize filters array
            this.mainImage.filters = new Array(10).fill(null)

            this.endCrop()
            this.saveState()
            this.setMode('adjust') // Switch back to adjust
        })
    }

    rotateImage(angle) {
        if (!this.mainImage) return
        const curAngle = this.mainImage.angle || 0
        this.mainImage.set('angle', curAngle + angle)
        this.centerImage() // Re-center might be needed if dimensions swap
        this.saveState()
    }

    deleteActiveObject() {
        const active = this.canvas.getActiveObject()
        if (active && active !== this.mainImage) {
            this.canvas.remove(active)
            this.saveState()
        }
    }

    // ─── History ─────────────────────────────────────────────────────────

    saveState() {
        if (this.isHistoryLocked) return

        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1)
        }

        const json = this.canvas.toJSON()
        this.history.push(json)
        this.historyIndex++

        if (this.history.length > 20) {
            this.history.shift()
            this.historyIndex--
        }

        this.updateHistoryButtons()
    }

    async undo() {
        if (this.historyIndex <= 0) return

        this.isHistoryLocked = true
        this.historyIndex--
        const json = this.history[this.historyIndex]

        await this.canvas.loadFromJSON(json)

        // Re-assign main image reference if needed
        const objects = this.canvas.getObjects()
        if (objects.length > 0) {
            this.mainImage = objects[0] // Assumption: first object is main image
        }

        this.canvas.renderAll()
        this.isHistoryLocked = false
        this.updateHistoryButtons()
    }

    async redo() {
        if (this.historyIndex >= this.history.length - 1) return

        this.isHistoryLocked = true
        this.historyIndex++
        const json = this.history[this.historyIndex]

        await this.canvas.loadFromJSON(json)

        const objects = this.canvas.getObjects()
        if (objects.length > 0) {
            this.mainImage = objects[0]
        }

        this.canvas.renderAll()
        this.isHistoryLocked = false
        this.updateHistoryButtons()
    }

    updateHistoryButtons() {
        const undoBtn = document.getElementById('editor-btn-undo')
        const redoBtn = document.getElementById('editor-btn-redo')

        undoBtn.style.opacity = this.historyIndex > 0 ? 1 : 0.3
        redoBtn.style.opacity = this.historyIndex < this.history.length - 1 ? 1 : 0.3
    }

    // ─── Save ────────────────────────────────────────────────────────────

    async save(format = null) {
        try {
            const isSaveAs = !!format

            // Determine format if not provided (overwrite mode)
            let saveFormat = format
            if (!saveFormat) {
                const ext = this.originalPath.split('.').pop().toLowerCase()
                if (ext === 'png') saveFormat = 'png'
                else if (ext === 'webp') saveFormat = 'webp'
                else saveFormat = 'jpeg'
            }

            // Calculate export parameters to match original image resolution
            // We use the main image's bounding box and scale to determine the export area and multiplier
            const rect = this.mainImage.getBoundingRect()
            const multiplier = 1 / (this.mainImage.scaleX || 1)

            // High quality export
            const dataURL = this.canvas.toDataURL({
                format: saveFormat,
                quality: this.exportQuality,
                multiplier: multiplier,
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            })

            if (isSaveAs) {
                const result = await window.api.imageSaveAs({
                    dataUrl: dataURL,
                    format: saveFormat,
                    quality: Math.round(this.exportQuality * 100)
                })

                if (result) {
                    this.close()
                    if (window.appEvents) window.appEvents.emit('gallery:refresh')
                }
            } else {
                // Overwrite
                await window.api.imageSave({
                    filepath: this.originalPath,
                    dataUrl: dataURL
                })
                this.close()
                if (window.appEvents) window.appEvents.emit('gallery:refresh')
            }
        } catch (e) {
            console.error('Save failed:', e)
        }
    }
}

// Initialize
window.editor = new Editor()
