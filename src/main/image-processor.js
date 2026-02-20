import fs from 'fs'
import path from 'path'

let sharp = null
async function getSharp() {
    if (!sharp) {
        const mod = await import('sharp')
        sharp = mod.default || mod
    }
    return sharp
}

async function readImageAsBase64(filepath) {
    const data = await fs.promises.readFile(filepath)
    const ext = path.extname(filepath).toLowerCase().slice(1)
    const mimeMap = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
        tiff: 'image/tiff', tif: 'image/tiff', svg: 'image/svg+xml',
        heic: 'image/heic', heif: 'image/heif', avif: 'image/avif'
    }
    const mime = mimeMap[ext] || 'image/jpeg'

    // For HEIC/HEIF, convert to JPEG first
    if (['heic', 'heif'].includes(ext)) {
        const s = await getSharp()
        const jpegBuffer = await s(data).jpeg({ quality: 95 }).toBuffer()
        return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`
    }

    return `data:${mime};base64,${data.toString('base64')}`
}

async function saveImage(filepath, dataUrl) {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    await fs.promises.writeFile(filepath, buffer)
    return filepath
}

async function saveImageAs(dataUrl, destPath, format = 'jpeg', quality = 95) {
    const s = await getSharp()
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    let pipeline = s(buffer)

    switch (format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
            pipeline = pipeline.jpeg({ quality })
            break
        case 'png':
            pipeline = pipeline.png({ compressionLevel: 6 })
            break
        case 'webp':
            pipeline = pipeline.webp({ quality })
            break
        case 'tiff':
        case 'tif':
            pipeline = pipeline.tiff({ quality })
            break
        default:
            pipeline = pipeline.jpeg({ quality })
    }

    await pipeline.toFile(destPath)
    return destPath
}

async function exportImage(dataUrl, destPath, options = {}) {
    const { format = 'jpeg', quality = 90, width, height } = options
    const s = await getSharp()
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    let pipeline = s(buffer)

    if (width || height) {
        pipeline = pipeline.resize(width || null, height || null, {
            fit: 'inside',
            withoutEnlargement: true
        })
    }

    switch (format.toLowerCase()) {
        case 'jpeg': case 'jpg': pipeline = pipeline.jpeg({ quality }); break
        case 'png': pipeline = pipeline.png(); break
        case 'webp': pipeline = pipeline.webp({ quality }); break
        case 'tiff': case 'tif': pipeline = pipeline.tiff({ quality }); break
        default: pipeline = pipeline.jpeg({ quality })
    }

    await pipeline.toFile(destPath)
    return destPath
}

async function cropImage(filepath, cropData, outputPath) {
    const { left, top, width, height, outputWidth, outputHeight } = cropData
    const s = await getSharp()

    let pipeline = s(filepath).extract({
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height)
    })

    if (outputWidth && outputHeight) {
        pipeline = pipeline.resize(outputWidth, outputHeight, { fit: 'fill' })
    }

    const ext = path.extname(outputPath || filepath).toLowerCase().slice(1)
    if (['jpg', 'jpeg'].includes(ext)) pipeline = pipeline.jpeg({ quality: 95 })
    else if (ext === 'png') pipeline = pipeline.png()
    else if (ext === 'webp') pipeline = pipeline.webp({ quality: 95 })
    else pipeline = pipeline.jpeg({ quality: 95 })

    const dest = outputPath || filepath
    await pipeline.toFile(dest + '.tmp')
    await fs.promises.rename(dest + '.tmp', dest)
    return dest
}

async function getImageMetadata(filepath) {
    try {
        const s = await getSharp()
        const meta = await s(filepath, { failOn: 'none' }).metadata()
        return {
            width: meta.width,
            height: meta.height,
            format: meta.format,
            space: meta.space,
            channels: meta.channels,
            depth: meta.depth,
            density: meta.density,
            hasAlpha: meta.hasAlpha,
            orientation: meta.orientation
        }
    } catch (e) {
        return null
    }
}

export { readImageAsBase64, saveImage, saveImageAs, exportImage, cropImage, getImageMetadata }
