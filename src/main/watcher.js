import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import chokidar from 'chokidar'
import { isImageFile, SKIP_DIRS } from './scanner.js'
import { imageExists, deleteImage, getDb } from './database.js'
import path from 'path'
import fs from 'fs'

let watcher = null

function initWatcher(folders, mainWindow) {
    if (watcher) {
        watcher.close()
    }

    const validFolders = folders.filter(f => {
        try { return fs.existsSync(f) } catch (e) { return false }
    })

    if (validFolders.length === 0) return

    watcher = chokidar.watch(validFolders, {
        ignored: (path, stats) => {
            if (!path) return false
            const basename = path.split(/[/\\]/).pop()
            // Ignore dotfiles/folders except current directory
            if (basename.startsWith('.') && basename !== '.') return true
            // Check against SKIP_DIRS
            if (stats && stats.isDirectory() && SKIP_DIRS.has(basename)) return true
            // Also check if path contains skipped dirs (for non-directory paths or when stats not available)
            // But chokidar 'ignored' function is tricky. Let's keep it simple with regex for common ones
            // and use the function for exact directory matches.
            return false
        },
        persistent: true,
        ignoreInitial: true,
        depth: 20,
        awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 }
    })

    watcher.on('add', async (filePath) => {
        if (!isImageFile(path.basename(filePath))) return
        try {
            const stat = fs.statSync(filePath)
            const db = getDb()
            db.prepare(`
        INSERT OR REPLACE INTO images (filepath, filename, extension, size, created, modified, folder, width, height, thumbnail_path, exif_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, '', '{}')
      `).run(
                filePath,
                path.basename(filePath),
                path.extname(filePath).toLowerCase().slice(1),
                stat.size,
                stat.birthtime.getTime(),
                stat.mtime.getTime(),
                path.dirname(filePath)
            )
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('watcher:file-added', {
                    filepath: filePath,
                    filename: path.basename(filePath),
                    extension: path.extname(filePath).toLowerCase().slice(1),
                    size: stat.size,
                    created: stat.birthtime.getTime(),
                    modified: stat.mtime.getTime(),
                    folder: path.dirname(filePath),
                    width: 0,
                    height: 0,
                    thumbnail_path: ''
                })
            }
        } catch (e) { console.error('Watcher add error:', e) }
    })

    watcher.on('unlink', (filePath) => {
        if (!isImageFile(path.basename(filePath))) return
        try {
            deleteImage(filePath)
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('watcher:file-removed', { filepath: filePath })
            }
        } catch (e) { console.error('Watcher unlink error:', e) }
    })

    watcher.on('change', (filePath) => {
        if (!isImageFile(path.basename(filePath))) return
        try {
            const stat = fs.statSync(filePath)
            const db = getDb()
            db.prepare('UPDATE images SET size = ?, modified = ?, thumbnail_path = \'\' WHERE filepath = ?')
                .run(stat.size, stat.mtime.getTime(), filePath)
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('watcher:file-changed', { filepath: filePath })
            }
        } catch (e) { console.error('Watcher change error:', e) }
    })

    watcher.on('error', (err) => console.error('Watcher error:', err))
}

function updateWatcher(folders, mainWindow) {
    initWatcher(folders, mainWindow)
}

export { initWatcher, updateWatcher }
