// Sidebar - folder tree navigation

class Sidebar {
    constructor() {
        this.folderTree = document.getElementById('folder-tree')
        this.activeFolder = null
        // Ensure Utils is available before refreshing
        if (window.Utils) {
            this.refresh()
        } else {
            document.addEventListener('DOMContentLoaded', () => this.refresh())
        }
    }

    async refresh() {
        try {
            const [folders, scanFolders] = await Promise.all([
                window.api.dbGetFolders(),
                window.api.scanGetFolders()
            ])

            this.render(folders, scanFolders)
        } catch (e) {
            console.error('Sidebar refresh error:', e)
        }
    }

    render(folders, scanFolders) {
        this.folderTree.innerHTML = ''

        // Header: Watched
        const header = document.createElement('div')
        header.className = 'sidebar-section-header'
        header.innerHTML = `
            <span>Watched</span>
            <span style="cursor:pointer;opacity:0.5;font-size:14px" title="Clear">×</span>
        `
        this.folderTree.appendChild(header)

        // Item: All Photos
        const allItem = this.createFolderItem('checkbox', 'All Photos', null, null)
        allItem.dataset.folder = 'null'
        // Pre-select All Photos if activeFolder is null
        if (this.activeFolder === null) allItem.classList.add('active')
        this.folderTree.appendChild(allItem)

        // Label: Pictures; Pictures
        const subLabel = document.createElement('div')
        subLabel.style.cssText = 'padding: 12px 16px 4px; color: var(--text-muted); font-size: 11px; opacity: 0.6;'
        subLabel.textContent = 'Pictures; Pictures'
        this.folderTree.appendChild(subLabel)

        // Scan folders (Watched)
        scanFolders.forEach(folderPath => {
            const name = folderPath.split('/').pop()
            const count = folders.find(f => f.folder === folderPath)?.count || 0
            const item = this.createFolderItem('checkbox', name, folderPath, count, true)
            item.dataset.folder = folderPath
            if (this.activeFolder === folderPath) item.classList.add('active')

            // Context menu
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault()
                e.stopPropagation()
                this.showFolderMenu(e, folderPath)
            })

            this.folderTree.appendChild(item)
        })

        // Header: Watchedfiles
        const header2 = document.createElement('div')
        header2.className = 'sidebar-section-header'
        header2.style.marginTop = '16px'
        header2.textContent = 'Watchedfiles'
        this.folderTree.appendChild(header2)

        // Other folders from DB (not in scan list)
        const watchedSet = new Set(scanFolders)
        const otherFolders = folders.filter(f => !watchedSet.has(f.folder))

        otherFolders.sort((a, b) => a.folder.localeCompare(b.folder)).forEach(({ folder, count }) => {
            const name = folder.split('/').pop()
            const item = this.createFolderItem('checkbox', name, folder, count)
            item.dataset.folder = folder
            if (this.activeFolder === folder) item.classList.add('active')
            this.folderTree.appendChild(item)
        })
    }

    getIcon(name) {
        // Simple SVG icons
        const icons = {
            'camera': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>',
            'folder': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
            'folder-open': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
            'minus': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
            'checkbox': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" ry="4"></rect></svg>',
            'checkbox-checked': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" ry="4"></rect><polyline points="9 11 12 14 22 4"></polyline></svg>'
        }
        return icons[name] || ''
    }

    createFolderItem(iconName, name, folderPath, count, isScanFolder = false) {
        const item = document.createElement('div')
        item.className = `folder-item${isScanFolder ? ' scan-folder' : ''}`

        // Use macOS style folder icon
        let iconHtml = ''
        if (folderPath === 'null') {
            // All Photos icon
            iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon" style="fill:currentColor;stroke:none"><path d="M20 4h-4l-2-2h-4L8 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10z"/><circle cx="12" cy="13" r="3.2"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>`
        } else {
            // Folder icon - macOS style blue folder
            iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon" style="fill:#35a2ff;stroke:none"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`
        }

        item.innerHTML = `
          <span class="folder-checkbox">${this.getCheckbox(folderPath === this.activeFolder)}</span>
          <span class="folder-icon">${iconHtml}</span>
          <span class="folder-name">${Utils.escapeHtml(name)}</span>
          ${count !== null ? `<span class="folder-count">${count}</span>` : '<span class="folder-count" style="opacity:0">+</span>'}
        `
        item.addEventListener('click', () => {
            if (this.activeFolder === folderPath && folderPath !== null) {
                this.activeFolder = null
            } else {
                this.activeFolder = folderPath
            }
            this.updateSelection()
            window.appEvents.emit('filter:folder', this.activeFolder)
            document.getElementById('status-folder').textContent = this.activeFolder ? name : 'All Photos'
        })
        return item
    }

    getCheckbox(checked) {
        return checked
            ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon" style="width:14px;height:14px;color:var(--accent)"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="currentColor" opacity="0.2"/><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon" style="width:14px;height:14px;color:var(--text-muted);opacity:0.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>`
    }

    updateSelection() {
        const items = this.folderTree.querySelectorAll('.folder-item')
        items.forEach(el => {
            el.classList.remove('active')
            // Update checkbox state visually
            const isTarget = (el.dataset.folder === String(this.activeFolder))
            if (isTarget) el.classList.add('active')

            const checkbox = el.querySelector('.folder-checkbox')
            if (checkbox) checkbox.innerHTML = this.getCheckbox(isTarget)
        })
    }

    showFolderMenu(e, folderPath) {
        const menu = document.createElement('div')
        menu.style.cssText = `
      position: fixed; left: ${e.clientX}px; top: ${e.clientY}px;
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 4px; z-index: 1000;
      box-shadow: var(--shadow-lg); min-width: 160px;
    `
        menu.innerHTML = `
      <div class="ctx-item" id="fm-remove"><span class="ctx-icon">${this.getIcon('minus')}</span> Remove from Watch</div>
    `
        document.body.appendChild(menu)

        menu.querySelector('#fm-remove').addEventListener('click', async () => {
            await window.api.scanRemoveFolder(folderPath)
            this.refresh()
            menu.remove()
        })

        const close = (e) => {
            if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close) }
        }
        setTimeout(() => document.addEventListener('click', close), 0)
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.sidebar = new Sidebar()
})
