import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { app, nativeImage } from 'electron'
import { updateThumbnailPath, updateImageDimensions } from './database.js'

let sharp = null
async function getSharp() {
    if (!sharp) {
        const mod = await import('sharp')
        sharp = mod.default || mod
    }
    return sharp
}

const THUMB_SIZE = 300
let thumbDir = null

function getThumbDir() {
    if (!thumbDir) {
        thumbDir = path.join(app.getPath('userData'), 'thumbnails')
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })
    }
    return thumbDir
}

function getThumbnailPath(filepath, modified) {
    // Add 'v3' salt to force regeneration with lower quality
    const hash = crypto.createHash('md5').update(filepath + modified + 'v3').digest('hex')
    return path.join(getThumbDir(), `${hash}.jpg`)
}

async function generateThumbnail(filepath, modified) {
    const thumbPath = getThumbnailPath(filepath, modified)

    if (fs.existsSync(thumbPath)) return thumbPath

    try {
        const s = await getSharp()
        const image = s(filepath, { failOn: 'none' })
        const metadata = await image.metadata()

        await image
            .rotate() // auto-rotate based on EXIF
            .resize({ width: THUMB_SIZE, withoutEnlargement: true }) // Preserve aspect ratio
            .jpeg({ quality: 60, progressive: true }) // Lower quality for faster loading
            .toFile(thumbPath)

        updateThumbnailPath(filepath, thumbPath)
        if (metadata.width && metadata.height) {
            updateImageDimensions(filepath, metadata.width, metadata.height)
        }

        return thumbPath
    } catch (e) {
        console.error(`Thumbnail error for ${filepath}:`, e.message)
        try {
            // Fallback: Use nativeImage
            const img = nativeImage.createFromPath(filepath)
            if (!img.isEmpty()) {
                const resized = img.resize({ width: THUMB_SIZE })
                const buffer = resized.toJPEG(60)
                await fs.promises.writeFile(thumbPath, buffer)
                updateThumbnailPath(filepath, thumbPath)
                return thumbPath
            }
        } catch (fbErr) {
            console.error('Fallback thumbnail failed:', fbErr.message)
        }
        return null
    }
}

// Queue-based batch thumbnail generation
const queue = []
let processing = false
const CONCURRENCY = 8

async function processQueue() {
    if (processing) return
    processing = true

    while (queue.length > 0) {
        const batch = queue.splice(0, CONCURRENCY)
        await Promise.allSettled(
            batch.map(({ filepath, modified, resolve }) =>
                generateThumbnail(filepath, modified).then(resolve)
            )
        )
    }

    processing = false
}

function queueThumbnail(filepath, modified) {
    return new Promise((resolve) => {
        queue.push({ filepath, modified, resolve })
        processQueue()
    })
}

async function generateBatch(images) {
    return Promise.allSettled(
        images.map(img => generateThumbnail(img.filepath, img.modified))
    )
}

export { generateThumbnail, queueThumbnail, generateBatch, getThumbnailPath }
