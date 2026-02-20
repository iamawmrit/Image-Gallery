// Gallery - Virtual scroll grid with lazy loading

class Gallery {
    constructor() {
        this.images = []
        this.filteredImages = []
        this.selectedIndices = new Set()
        this.thumbSize = 160
        this.sortBy = 'modified'
        this.sortOrder = 'desc'
        this.currentFolder = null
        this.currentExtension = null
        this.searchQuery = ''
        this.page = 0
        this.pageSize = 500
        this.totalImages = 0
        this.loading = false
        this.lastClickIndex = -1

        this.grid = document.getElementById('gallery-grid')
        this.scrollContainer = document.getElementById('gallery-scroll')
        this.emptyState = document.getElementById('empty-state')

        this.thumbObserver = new IntersectionObserver(this.onThumbVisible.bind(this), {
            root: this.scrollContainer,
            rootMargin: '400px',
            threshold: 0
        })

        // Ensure Utils is available
        if (window.Utils) {
            this.init()
        } else {
            // Wait for Utils to be loaded
            const checkUtils = setInterval(() => {
                if (window.Utils) {
                    clearInterval(checkUtils)
                    this.init()
                }
            }, 50)
        }
    }

    init() {
        // Force set thumb size on init
        document.documentElement.style.setProperty('--thumb-size', this.thumbSize + 'px')

        // Toolbar controls
        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.sortBy = e.target.value
            this.reload()
        })

        document.getElementById('btn-sort-order').addEventListener('click', () => {
            this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc'
            document.getElementById('btn-sort-order').textContent = this.sortOrder === 'desc' ? '↓' : '↑'
            this.reload()
        })

        const slider = document.getElementById('thumb-size-slider')
        slider.addEventListener('input', Utils.debounce((e) => {
            this.thumbSize = parseInt(e.target.value)
            document.documentElement.style.setProperty('--thumb-size', this.thumbSize + 'px')
            this.renderGrid()
        }, 100))

        document.getElementById('btn-add-folder').addEventListener('click', () => this.addFolder())
        document.getElementById('btn-add-folder-sidebar').addEventListener('click', () => this.addFolder())
        document.getElementById('btn-scan').addEventListener('click', () => this.startScan())
        document.getElementById('btn-empty-scan').addEventListener('click', () => this.startScan())
        document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed')
        })

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
            if (e.metaKey && e.key === 'a') { e.preventDefault(); this.selectAll() }
        })

        // Scroll for pagination
        this.scrollContainer.addEventListener('scroll', Utils.throttle(() => {
            const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer
            if (scrollTop + clientHeight > scrollHeight - 800 && !this.loading) {
                this.loadMore()
            }
        }, 200))

        // Menu events
        window.api.on('menu:add-folder', (path) => this.addFolder(path))
        window.api.on('menu:sort', (sort) => {
            this.sortBy = sort
            document.getElementById('sort-select').value = sort
            this.reload()
        })
        window.api.on('menu:thumb-size', (size) => {
            this.thumbSize = size
            document.getElementById('thumb-size-slider').value = size
            document.documentElement.style.setProperty('--thumb-size', size + 'px')
            this.renderGrid()
        })
        window.api.on('menu:toggle-sidebar', () => {
            document.getElementById('sidebar').classList.toggle('collapsed')
        })
        window.api.on('menu:select-all', () => this.selectAll())
        window.api.on('menu:delete', () => this.deleteSelected())

        // Watcher events
        window.api.on('watcher:file-added', (img) => {
            if (img && img.filepath) {
                this.addSingleImage(img)
            } else {
                this.reload()
            }
        })
        window.api.on('watcher:file-removed', (data) => {
            if (data && data.filepath) {
                this.removeSingleImage(data.filepath)
            } else {
                this.reload()
            }
        })
        window.api.on('watcher:file-changed', (data) => {
            // Reload to get updated stats/thumbnail
            // We could optimize this to update single item, but reload is safer
            // to ensure sort order (modified date) is correct.
            this.reload()
        })

        // App events
        window.appEvents.on('filter:folder', (folder) => {
            this.currentFolder = folder
            this.reload()
        })
        window.appEvents.on('filter:search', (query) => {
            this.searchQuery = query
            this.reload()
        })
        window.appEvents.on('filter:extension', (ext) => {
            this.currentExtension = ext
            this.reload()
        })
        window.appEvents.on('refresh', () => this.reload())

        // Context menu
        window.appEvents.on('ctx:open', (img) => this.openViewer(this.filteredImages.indexOf(img)))
        window.appEvents.on('ctx:finder', (img) => window.api.imageShowInFinder(img.filepath))
        window.appEvents.on('ctx:copy-path', (img) => navigator.clipboard.writeText(img.filepath))
        window.appEvents.on('ctx:copy-image', (img) => window.api.imageCopyToClipboard(img.filepath))
        window.appEvents.on('ctx:delete', (img) => this.deleteImage(img))

        // Drag selection
        this.setupDragSelect()

        // Load initial data
        this.loadImages()

        // Failsafe: Ensure loading screen is removed after 5 seconds max
        setTimeout(() => {
            if (this.loading) {
                console.warn('Loading timed out, forcing splash screen removal');
                this.loading = false;
                this.hideLoading();
            }
        }, 5000);
    }

    async loadImages() {
        this.loading = true
        this.page = 0
        this.images = []
        this.filteredImages = []

        try {
            const result = await window.api.dbGetImages({
                page: 0,
                limit: this.pageSize,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder,
                folder: this.currentFolder,
                extension: this.currentExtension,
                search: this.searchQuery || null
            })

            this.totalImages = result.total
            this.filteredImages = result.images
            this.renderGrid()
            this.updateStatus()

            // If no images, check if we need to scan
            if (result.total === 0) {
                console.log('No images found in DB, starting auto-scan...');
                this.showEmptyState()
                this.startScan()
            } else {
                this.hideEmptyState()
            }
        } catch (e) {
            console.error('Load images error:', e)
        } finally {
            this.loading = false
            this.hideLoading()
        }
    }

    async loadMore() {
        if (this.filteredImages.length >= this.totalImages) return
        this.loading = true
        this.page++

        try {
            const result = await window.api.dbGetImages({
                page: this.page,
                limit: this.pageSize,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder,
                folder: this.currentFolder,
                extension: this.currentExtension,
                search: this.searchQuery || null
            })

            this.filteredImages.push(...result.images)
            this.appendItems(result.images, this.filteredImages.length - result.images.length)
        } catch (e) {
            console.error('Load more error:', e)
        }

        this.loading = false
    }

    addSingleImage(img) {
        // Check if image matches current filters
        if (this.currentFolder && img.folder !== this.currentFolder) return
        if (this.currentExtension && img.extension !== this.currentExtension) return
        if (this.searchQuery && !img.filename.toLowerCase().includes(this.searchQuery.toLowerCase())) return

        // Add to arrays
        this.images.unshift(img)
        this.filteredImages.unshift(img)
        this.totalImages++

        // Create DOM element
        const item = this.createThumbItem(img, 0)

        // Update indices of existing items
        const items = Array.from(this.grid.children)
        items.forEach(el => {
            const idx = parseInt(el.dataset.index)
            el.dataset.index = idx + 1
        })

        // Prepend to grid
        if (this.grid.firstChild) {
            this.grid.insertBefore(item, this.grid.firstChild)
        } else {
            this.grid.appendChild(item)
            this.hideEmptyState()
        }

        this.thumbObserver.observe(item)
        this.updateStatus()
    }

    removeSingleImage(filepath) {
        const index = this.filteredImages.findIndex(img => img.filepath === filepath)
        if (index === -1) return

        // Remove from arrays
        this.filteredImages.splice(index, 1)
        this.images = this.images.filter(img => img.filepath !== filepath)
        this.totalImages--

        // Remove from DOM
        const item = this.grid.querySelector(`.thumb-item[data-filepath="${CSS.escape(filepath)}"]`)
        if (item) {
            this.thumbObserver.unobserve(item)
            item.remove()
        }

        // Update indices
        const items = Array.from(this.grid.children)
        items.forEach((el, i) => {
            el.dataset.index = i
        })

        this.updateStatus()
        if (this.filteredImages.length === 0) this.showEmptyState()
    }

    reload() {
        this.selectedIndices.clear()
        this.loadImages()
    }

    renderGrid() {
        this.thumbObserver.disconnect()
        this.grid.innerHTML = ''

        this.filteredImages.forEach((img, index) => {
            const item = this.createThumbItem(img, index)
            this.grid.appendChild(item)
            this.thumbObserver.observe(item)
        })

        this.updateStatus()
    }

    appendItems(images, startIndex) {
        images.forEach((img, i) => {
            const item = this.createThumbItem(img, startIndex + i)
            this.grid.appendChild(item)
            this.thumbObserver.observe(item)
        })
    }

    createThumbItem(img, index) {
        const item = document.createElement('div')
        item.className = 'thumb-item'
        item.dataset.index = index
        item.dataset.filepath = img.filepath

        if (this.selectedIndices.has(index)) item.classList.add('selected')

        // Placeholder
        const placeholder = document.createElement('div')
        placeholder.className = 'thumb-placeholder'
        placeholder.textContent = Utils.getFileIcon(img.extension)
        item.appendChild(placeholder)

        // Image (lazy loaded)
        const imgEl = document.createElement('img')
        imgEl.className = 'thumb-img loading'
        imgEl.alt = img.filename
        imgEl.dataset.filepath = img.filepath
        imgEl.dataset.modified = img.modified

        // Aspect ratio placeholder to prevent layout shift
        if (img.width && img.height) {
            imgEl.style.aspectRatio = `${img.width} / ${img.height}`
        } else {
            imgEl.style.aspectRatio = '1 / 1' // Default square if unknown
        }

        item.appendChild(imgEl)

        // Overlay
        const overlay = document.createElement('div')
        overlay.className = 'thumb-overlay'
        overlay.innerHTML = `<span class="thumb-name">${Utils.escapeHtml(img.filename)}</span>`
        item.appendChild(overlay)

        // Events
        item.addEventListener('click', (e) => this.onItemClick(e, index))
        item.addEventListener('dblclick', () => this.openViewer(index))
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            window.contextMenu.show(e, img)
        })

        return item
    }

    async onThumbVisible(entries) {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue
            const item = entry.target
            const imgEl = item.querySelector('.thumb-img')
            if (!imgEl || imgEl.src) continue

            const filepath = imgEl.dataset.filepath
            const modified = imgEl.dataset.modified

            this.thumbObserver.unobserve(item)

            try {
                const thumbPath = await window.api.thumbGet({ filepath, modified: parseInt(modified) })
                if (thumbPath) {
                    imgEl.src = Utils.filePathToSrc(thumbPath)
                    imgEl.onload = () => {
                        imgEl.classList.remove('loading')
                        imgEl.classList.add('loaded')
                        item.querySelector('.thumb-placeholder')?.remove()
                        // Allow image to take its natural aspect ratio
                        imgEl.style.aspectRatio = 'auto'
                    }
                    imgEl.onerror = () => {
                        imgEl.remove()
                    }
                }
            } catch (e) { /* skip */ }
        }
    }

    onItemClick(e, index) {
        e.stopPropagation()

        if (e.metaKey) {
            // Cmd+Click: toggle selection
            if (this.selectedIndices.has(index)) {
                this.selectedIndices.delete(index)
            } else {
                this.selectedIndices.add(index)
            }
            this.lastClickIndex = index
        } else if (e.shiftKey && this.lastClickIndex >= 0) {
            // Shift+Click: range select
            const start = Math.min(this.lastClickIndex, index)
            const end = Math.max(this.lastClickIndex, index)
            for (let i = start; i <= end; i++) this.selectedIndices.add(i)
        } else {
            // Normal click: open viewer
            this.selectedIndices.clear()
            this.openViewer(index)
            this.lastClickIndex = index
            this.updateSelectionUI()
            return
        }

        this.lastClickIndex = index
        this.updateSelectionUI()
        this.updateStatus()
    }

    openViewer(index) {
        window.imageViewer.open(this.filteredImages, index)
    }

    selectAll() {
        for (let i = 0; i < this.filteredImages.length; i++) {
            this.selectedIndices.add(i)
        }
        this.updateSelectionUI()
        this.updateStatus()
    }

    updateSelectionUI() {
        const items = this.grid.querySelectorAll('.thumb-item')
        items.forEach((item) => {
            const index = parseInt(item.dataset.index)
            item.classList.toggle('selected', this.selectedIndices.has(index))
        })
    }

    async deleteImage(img) {
        if (!confirm(`Move "${img.filename}" to Trash?`)) return
        await window.api.imageDelete(img.filepath)
        this.reload()
    }

    async deleteSelected() {
        if (this.selectedIndices.size === 0) return
        if (!confirm(`Move ${this.selectedIndices.size} photo(s) to Trash?`)) return
        const toDelete = [...this.selectedIndices].map(i => this.filteredImages[i]).filter(Boolean)
        for (const img of toDelete) {
            await window.api.imageDelete(img.filepath)
        }
        this.selectedIndices.clear()
        this.reload()
    }

    async addFolder(folderPath) {
        const result = await window.api.scanAddFolder(folderPath)
        if (result) {
            window.sidebar.refresh()
            this.startScan()
        }
    }

    startScan() {
        const progress = document.getElementById('scan-progress')
        const countEl = document.getElementById('scan-count')
        const textEl = document.getElementById('scan-progress-text')
        progress.classList.add('visible')

        let count = 0
        const removeProgress = window.api.on('scan:progress', (data) => {
            count = data.found
            countEl.textContent = count
            textEl.textContent = data.current.split('/').pop()
        })

        const removeComplete = window.api.on('scan:complete', (data) => {
            progress.classList.remove('visible')
            removeProgress?.()
            removeComplete?.()
            this.reload()
            window.sidebar.refresh()
        })

        window.api.scanStart()
    }

    updateStatus() {
        const countEl = document.getElementById('status-count')
        const selectedEl = document.getElementById('status-selected')
        const folderEl = document.getElementById('status-folder')

        countEl.textContent = `${this.totalImages.toLocaleString()} photos`
        selectedEl.textContent = this.selectedIndices.size > 0
            ? `${this.selectedIndices.size} selected`
            : 'None selected'
        folderEl.textContent = this.currentFolder
            ? this.currentFolder.split('/').pop()
            : 'All Photos'
    }

    showEmptyState() {
        this.emptyState.style.display = 'flex'
        this.grid.style.display = 'none'
    }

    hideEmptyState() {
        this.emptyState.style.display = 'none'
        this.grid.style.display = 'block'
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay')
        if (!overlay) return
        overlay.classList.add('hidden')
        setTimeout(() => overlay.remove(), 300)
    }

    setupDragSelect() {
        let isDragging = false
        let startX, startY
        let selectionBox = null

        this.scrollContainer.addEventListener('mousedown', (e) => {
            if (e.target.closest('.thumb-item')) return
            if (e.button !== 0) return
            isDragging = true
            startX = e.clientX
            startY = e.clientY

            selectionBox = document.createElement('div')
            selectionBox.style.cssText = `
        position: fixed; border: 1px solid var(--accent);
        background: rgba(10,132,255,0.1); pointer-events: none; z-index: 50;
      `
            document.body.appendChild(selectionBox)
        })

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return
            const x = Math.min(e.clientX, startX)
            const y = Math.min(e.clientY, startY)
            const w = Math.abs(e.clientX - startX)
            const h = Math.abs(e.clientY - startY)
            selectionBox.style.left = x + 'px'
            selectionBox.style.top = y + 'px'
            selectionBox.style.width = w + 'px'
            selectionBox.style.height = h + 'px'
        })

        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return
            isDragging = false
            if (selectionBox) { selectionBox.remove(); selectionBox = null }

            const rect = { left: Math.min(e.clientX, startX), top: Math.min(e.clientY, startY), right: Math.max(e.clientX, startX), bottom: Math.max(e.clientY, startY) }
            if (rect.right - rect.left < 5 || rect.bottom - rect.top < 5) return

            const items = this.grid.querySelectorAll('.thumb-item')
            if (!e.metaKey) this.selectedIndices.clear()
            items.forEach(item => {
                const r = item.getBoundingClientRect()
                if (r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) {
                    this.selectedIndices.add(parseInt(item.dataset.index))
                }
            })
            this.updateSelectionUI()
            this.updateStatus()
        })
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Force hide loading screen after 3 seconds regardless of what happens
    setTimeout(() => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            console.log('Force hiding loading screen via failsafe');
            overlay.classList.add('hidden');
            setTimeout(() => overlay.remove(), 500);
        }
    }, 3000);

    window.gallery = new Gallery()
})
