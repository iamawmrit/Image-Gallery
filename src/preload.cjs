const { contextBridge, ipcRenderer } = require('electron')

console.log('Preload: Starting...');

try {
    contextBridge.exposeInMainWorld('api', {
        // Scanner
        scanStart: () => ipcRenderer.invoke('scan:start'),
        scanAddFolder: (path) => ipcRenderer.invoke('scan:add-folder', path),
        scanRemoveFolder: (path) => ipcRenderer.invoke('scan:remove-folder', path),
        scanGetFolders: () => ipcRenderer.invoke('scan:get-folders'),

        // Database
        dbGetImages: (options) => ipcRenderer.invoke('db:get-images', options),
        dbGetImage: (filepath) => ipcRenderer.invoke('db:get-image', filepath),
        dbGetFolders: () => ipcRenderer.invoke('db:get-folders'),
        dbSearch: (query) => ipcRenderer.invoke('db:search', query),
        dbGetStats: () => ipcRenderer.invoke('db:get-stats'),

        // Thumbnails
        thumbGet: (data) => ipcRenderer.invoke('thumb:get', data),
        thumbGenerateBatch: (images) => ipcRenderer.invoke('thumb:generate-batch', images),

        // Image operations
        imageRead: (filepath) => ipcRenderer.invoke('image:read', filepath),
        imageSave: (data) => ipcRenderer.invoke('image:save', data),
        imageSaveAs: (data) => ipcRenderer.invoke('image:save-as', data),
        imageExport: (data) => ipcRenderer.invoke('image:export', data),
        imageCrop: (data) => ipcRenderer.invoke('image:crop', data),
        imageDelete: (filepath) => ipcRenderer.invoke('image:delete', filepath),
        imageShowInFinder: (filepath) => ipcRenderer.invoke('image:show-in-finder', filepath),
        imageCopyToClipboard: (filepath) => ipcRenderer.invoke('image:copy-to-clipboard', filepath),
        imageGetExif: (filepath) => ipcRenderer.invoke('image:get-exif', filepath),
        imageGetMetadata: (filepath) => ipcRenderer.invoke('image:get-metadata', filepath),

        // App
        appOpenFolder: () => ipcRenderer.invoke('app:open-folder'),
        appGetSettings: () => ipcRenderer.invoke('app:get-settings'),
        appSetSettings: (settings) => ipcRenderer.invoke('app:set-settings', settings),
        appGetPath: (name) => ipcRenderer.invoke('app:get-path', name),

        // Event listeners
        on: (channel, callback) => {
            const validChannels = [
                'scan:progress', 'scan:complete',
                'watcher:file-added', 'watcher:file-removed', 'watcher:file-changed',
                'menu:add-folder', 'menu:preferences', 'menu:save', 'menu:save-as',
                'menu:export', 'menu:show-in-finder', 'menu:delete', 'menu:undo',
                'menu:redo', 'menu:select-all', 'menu:edit-image', 'menu:zoom-in',
                'menu:zoom-out', 'menu:zoom-actual', 'menu:zoom-fit', 'menu:toggle-sidebar',
                'menu:sort', 'menu:thumb-size', 'menu:open-image'
            ]
            if (validChannels.includes(channel)) {
                const listener = (event, ...args) => callback(...args)
                ipcRenderer.on(channel, listener)
                return () => ipcRenderer.removeListener(channel, listener)
            }
        },

        // File protocol
        fileRead: (filepath) => ipcRenderer.invoke('file:read', filepath)
    })
    console.log('Preload: API exposed');
} catch (err) {
    console.error('Preload: Failed to expose API', err);
}
