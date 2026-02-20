import fs from 'fs'
import path from 'path'
import { getDb } from './database.js'
import { generateThumbnail } from './thumbnailer.js'

const IMAGE_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif',
    'heic', 'heif', 'webp', 'avif', 'svg', 'raw', 'cr2',
    'nef', 'arw', 'dng', 'orf', 'rw2', 'pef', 'srw'
])

const SKIP_DIRS = new Set([
    'node_modules', '.git', '.Trash', 'Library', '.cache',
    '.npm', '.nvm', 'Caches', 'Application Support', 'Containers',
    'CoreData', 'Preferences', 'Saved Application State',
    // Android / Flutter build folders
    'build', 'dist', 'out', 'target', 'bin', 'obj',
    'mipmap-hdpi', 'mipmap-mdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi',
    'drawable-hdpi', 'drawable-mdpi', 'drawable-xhdpi', 'drawable-xxhdpi', 'drawable-xxxhdpi',
    'AppIcons', 'Assets.xcassets', 'android', 'ios', 'flutter', '.dart_tool', '.gradle', '.idea'
])

const SKIP_PATHS = [
    '/System', '/Library', '/private', '/usr', '/bin', '/sbin',
    '/var', '/dev', '/proc', '/tmp', '/Volumes/Recovery'
]

let scanAbortController = null
let scanProgress = { found: 0, current: '', running: false }

function shouldSkipPath(fullPath) {
    for (const skip of SKIP_PATHS) {
        if (fullPath.startsWith(skip)) return true
    }
    return false
}

function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase().slice(1)
    return IMAGE_EXTENSIONS.has(ext)
}

async function scanDirectory(dirPath, onProgress, signal) {
    if (signal?.aborted) return []
    if (shouldSkipPath(dirPath)) return []

    let results = []
    try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            if (signal?.aborted) break
            if (entry.name.startsWith('.')) continue

            const fullPath = path.join(dirPath, entry.name)

            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) continue
                try {
                    const subResults = await scanDirectory(fullPath, onProgress, signal)
                    results = results.concat(subResults)
                } catch (e) { /* skip inaccessible dirs */ }
            } else if (entry.isFile() && isImageFile(entry.name)) {
                // console.log('Found image:', fullPath);
                results.push(fullPath)
                scanProgress.found++
                scanProgress.current = fullPath
                if (onProgress) onProgress({ found: scanProgress.found, current: fullPath })
            }
        }
    } catch (e) { /* skip inaccessible dirs */ }
    return results
}

async function processImageFile(filePath) {
    try {
        const stat = await fs.promises.stat(filePath)
        const ext = path.extname(filePath).toLowerCase().slice(1)
        const filename = path.basename(filePath)
        const folder = path.dirname(filePath)

        return {
            filepath: filePath,
            filename,
            extension: ext,
            size: stat.size,
            created: stat.birthtime.getTime(),
            modified: stat.mtime.getTime(),
            folder,
            width: 0,
            height: 0,
            thumbnail_path: '',
            exif_json: '{}'
        }
    } catch (e) {
        return null
    }
}

async function startScan(folders, onProgress, onComplete) {
    if (scanProgress.running) {
        scanAbortController?.abort()
        await new Promise(r => setTimeout(r, 100))
    }

    scanAbortController = new AbortController()
    scanProgress = { found: 0, current: '', running: true }

    const db = getDb()
    const allImages = []

    try {
        for (const folder of folders) {
            if (!fs.existsSync(folder)) continue
            const images = await scanDirectory(folder, onProgress, scanAbortController.signal)
            allImages.push(...images)
        }

        if (!scanAbortController.signal.aborted) {
            // Batch insert into database
            const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO images 
        (filepath, filename, extension, size, created, modified, folder, width, height, thumbnail_path, exif_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

            const insertMany = db.transaction((images) => {
                for (const img of images) {
                    if (img) {
                        insertStmt.run(
                            img.filepath, img.filename, img.extension, img.size,
                            img.created, img.modified, img.folder,
                            img.width, img.height, img.thumbnail_path, img.exif_json
                        )
                    }
                }
            })

            // Process in batches
            const BATCH = 500
            for (let i = 0; i < allImages.length; i += BATCH) {
                const batch = await Promise.all(
                    allImages.slice(i, i + BATCH).map(processImageFile)
                )
                insertMany(batch.filter(Boolean))
            }

            scanProgress.running = false
            if (onComplete) onComplete({ total: allImages.length })
        }
    } catch (e) {
        console.error('Scan error:', e)
        scanProgress.running = false
    }
}

function addFolderToScan(folderPath, store) {
    const folders = store.get('scanFolders')
    if (!folders.includes(folderPath)) {
        folders.push(folderPath)
        store.set('scanFolders', folders)
    }
    return folders
}

function removeFolderFromScan(folderPath, store) {
    const folders = store.get('scanFolders').filter(f => f !== folderPath)
    store.set('scanFolders', folders)
    return folders
}

export { startScan, addFolderToScan, removeFolderFromScan, isImageFile, IMAGE_EXTENSIONS, scanDirectory, SKIP_DIRS }
