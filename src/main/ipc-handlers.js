import { ipcMain, dialog, shell, app } from 'electron'
import { clipboard, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'

import { startScan, addFolderToScan, removeFolderFromScan } from './scanner.js'
import { getImages, getImage, getFolders, searchImages, getStats, deleteImage } from './database.js'
import { generateThumbnail, generateBatch } from './thumbnailer.js'
import { readImageAsBase64, saveImage, saveImageAs, exportImage, cropImage, getImageMetadata } from './image-processor.js'

let handlersSetup = false

function setupIpcHandlers(mainWindow, store) {
    if (handlersSetup) return
    handlersSetup = true

    // ─── Scanner ───────────────────────────────────────────────
    ipcMain.handle('scan:start', async (event) => {
        console.log('IPC: scan:start called');
        const folders = store.get('scanFolders')
        console.log('IPC: Scanning folders:', folders);
        startScan(
            folders,
            (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan:progress', progress)
                }
            },
            (result) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan:complete', result)
                }
            }
        )
        return { started: true, folders }
    })

    ipcMain.handle('scan:add-folder', async (event, folderPath) => {
        let targetPath = folderPath
        if (!targetPath) {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory'],
                title: 'Add Folder to Gallery'
            })
            if (result.canceled || !result.filePaths.length) return null
            targetPath = result.filePaths[0]
        }
        const folders = addFolderToScan(targetPath, store)
        return { folders, added: targetPath }
    })

    ipcMain.handle('scan:remove-folder', async (event, folderPath) => {
        const folders = removeFolderFromScan(folderPath, store)
        return { folders }
    })

    ipcMain.handle('scan:get-folders', () => store.get('scanFolders'))

    // ─── Database ───────────────────────────────────────────────
    ipcMain.handle('db:get-images', async (event, options) => {
        try {
            return getImages(options)
        } catch (err) {
            console.error('IPC: db:get-images error:', err)
            throw err
        }
    })

    ipcMain.handle('db:get-image', async (event, filepath) => {
        return getImage(filepath)
    })

    ipcMain.handle('db:get-folders', async () => {
        return getFolders()
    })

    ipcMain.handle('db:search', async (event, query) => {
        return searchImages(query)
    })

    ipcMain.handle('db:get-stats', async () => {
        return getStats()
    })

    // ─── Thumbnails ─────────────────────────────────────────────
    ipcMain.handle('thumb:get', async (event, { filepath, modified }) => {
        return generateThumbnail(filepath, modified)
    })

    ipcMain.handle('thumb:generate-batch', async (event, images) => {
        return generateBatch(images)
    })

    // ─── Image Operations ────────────────────────────────────────
    ipcMain.handle('image:read', async (event, filepath) => {
        return readImageAsBase64(filepath)
    })

    ipcMain.handle('image:save', async (event, { filepath, dataUrl }) => {
        return saveImage(filepath, dataUrl)
    })

    ipcMain.handle('image:save-as', async (event, { dataUrl, format, quality }) => {
        const ext = format === 'jpeg' ? 'jpg' : format

        const filters = [
            { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
            { name: 'PNG', extensions: ['png'] },
            { name: 'WebP', extensions: ['webp'] },
            { name: 'TIFF', extensions: ['tiff'] }
        ]

        // Prioritize requested format to ensure defaultPath matches selected filter
        const idx = filters.findIndex(f => f.extensions.includes(ext))
        if (idx > 0) {
            const [item] = filters.splice(idx, 1)
            filters.unshift(item)
        }

        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: 'image',
            filters
        })
        if (result.canceled) return null

        // Update format based on actual filename chosen by user
        const finalExt = path.extname(result.filePath).slice(1).toLowerCase()
        const finalFormat = finalExt === 'jpg' ? 'jpeg' : (finalExt || format)

        return saveImageAs(dataUrl, result.filePath, finalFormat, quality)
    })

    ipcMain.handle('image:export', async (event, { dataUrl, format, quality, width, height }) => {
        const ext = format === 'jpeg' ? 'jpg' : format

        const filters = [
            { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
            { name: 'PNG', extensions: ['png'] },
            { name: 'WebP', extensions: ['webp'] },
            { name: 'TIFF', extensions: ['tiff'] }
        ]

        // Prioritize requested format
        const idx = filters.findIndex(f => f.extensions.includes(ext))
        if (idx > 0) {
            const [item] = filters.splice(idx, 1)
            filters.unshift(item)
        }

        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: 'image',
            filters
        })
        if (result.canceled) return null

        // Update format based on actual filename chosen by user
        const finalExt = path.extname(result.filePath).slice(1).toLowerCase()
        const finalFormat = finalExt === 'jpg' ? 'jpeg' : (finalExt || format)

        return exportImage(dataUrl, result.filePath, { format: finalFormat, quality, width, height })
    })

    ipcMain.handle('image:crop', async (event, { filepath, cropData, outputPath }) => {
        return cropImage(filepath, cropData, outputPath)
    })

    ipcMain.handle('image:delete', async (event, filepath) => {
        await shell.trashItem(filepath)
        deleteImage(filepath)
        return { deleted: filepath }
    })

    ipcMain.handle('image:show-in-finder', async (event, filepath) => {
        shell.showItemInFolder(filepath)
        return true
    })

    ipcMain.handle('image:copy-to-clipboard', async (event, filepath) => {
        try {
            const img = nativeImage.createFromPath(filepath)
            clipboard.writeImage(img)
            return true
        } catch (e) {
            // Fallback: read and create from buffer
            const data = await fs.promises.readFile(filepath)
            const img = nativeImage.createFromBuffer(data)
            clipboard.writeImage(img)
            return true
        }
    })

    ipcMain.handle('image:get-exif', async (event, filepath) => {
        try {
            const { default: exifr } = await import('exifr')
            const exif = await exifr.parse(filepath, { all: true })
            return exif || {}
        } catch (e) {
            return {}
        }
    })

    ipcMain.handle('image:get-metadata', async (event, filepath) => {
        return getImageMetadata(filepath)
    })

    // ─── App ────────────────────────────────────────────────────
    ipcMain.handle('app:open-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        })
        if (result.canceled) return null
        return result.filePaths[0]
    })

    ipcMain.handle('app:get-settings', () => store.store)

    ipcMain.handle('app:set-settings', (event, settings) => {
        for (const [key, value] of Object.entries(settings)) {
            store.set(key, value)
        }
        return store.store
    })

    ipcMain.handle('app:get-path', (event, name) => {
        return app.getPath(name)
    })

    // File protocol for local images
    ipcMain.handle('file:read', async (event, filepath) => {
        const data = await fs.promises.readFile(filepath)
        return data.buffer
    })
}

export { setupIpcHandlers }
