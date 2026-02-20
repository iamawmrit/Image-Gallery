import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

let db = null

function initDatabase() {
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'gallery.db')
    console.log('Database: Initializing at', dbPath);

    try {
        db = new Database(dbPath, { verbose: console.log }) // Enable verbose logging
        db.pragma('journal_mode = WAL')
        db.pragma('synchronous = NORMAL')
        db.pragma('cache_size = 10000')
        db.pragma('temp_store = MEMORY')

        db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filepath TEXT UNIQUE NOT NULL,
      filename TEXT NOT NULL,
      extension TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      created INTEGER DEFAULT 0,
      modified INTEGER DEFAULT 0,
      thumbnail_path TEXT DEFAULT '',
      exif_json TEXT DEFAULT '{}',
      folder TEXT NOT NULL,
      indexed_at INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_images_folder ON images(folder);
    CREATE INDEX IF NOT EXISTS idx_images_modified ON images(modified);
    CREATE INDEX IF NOT EXISTS idx_images_created ON images(created);
    CREATE INDEX IF NOT EXISTS idx_images_extension ON images(extension);
    CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename);
    CREATE INDEX IF NOT EXISTS idx_images_size ON images(size);

    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      parent_path TEXT DEFAULT '',
      image_count INTEGER DEFAULT 0,
      last_scanned INTEGER DEFAULT 0
    );
  `)
    } catch (err) {
        console.error('Database: Init failed', err)
        throw err
    }

    return db
}

function getDb() {
    return db
}

function getImages({ page = 0, limit = 200, sortBy = 'modified', sortOrder = 'desc', folder = null, extension = null, search = null, dateFrom = null, dateTo = null } = {}) {
    console.log('Database: getImages called', { page, limit, sortBy, folder });
    let where = []
    let params = []

    if (folder) {
        where.push('folder = ?')
        params.push(folder)
    }
    if (extension) {
        where.push('extension = ?')
        params.push(extension.toLowerCase())
    }
    if (search) {
        where.push('filename LIKE ?')
        params.push(`%${search}%`)
    }
    if (dateFrom) {
        where.push('modified >= ?')
        params.push(dateFrom)
    }
    if (dateTo) {
        where.push('modified <= ?')
        params.push(dateTo)
    }

    const validSorts = { modified: 'modified', created: 'created', name: 'filename', size: 'size', type: 'extension' }
    const sortCol = validSorts[sortBy] || 'modified'
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC'

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const offset = page * limit

    const rows = db.prepare(`
    SELECT * FROM images ${whereClause}
    ORDER BY ${sortCol} ${order}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

    const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM images ${whereClause}
  `).get(...params)

    return { images: rows, total: countRow.total, page, limit }
}

function getImage(filepath) {
    return db.prepare('SELECT * FROM images WHERE filepath = ?').get(filepath)
}

function getFolders() {
    // Get unique folders from images table
    const rows = db.prepare(`
    SELECT folder, COUNT(*) as count FROM images GROUP BY folder ORDER BY folder
  `).all()
    return rows
}

function searchImages(query, limit = 100) {
    return db.prepare(`
    SELECT * FROM images WHERE filename LIKE ? ORDER BY modified DESC LIMIT ?
  `).all(`%${query}%`, limit)
}

function getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM images').get()
    const totalSize = db.prepare('SELECT SUM(size) as total FROM images').get()
    const byType = db.prepare('SELECT extension, COUNT(*) as count FROM images GROUP BY extension ORDER BY count DESC').all()
    const byFolder = db.prepare('SELECT folder, COUNT(*) as count FROM images GROUP BY folder ORDER BY count DESC LIMIT 20').all()
    return {
        total: total.count,
        totalSize: totalSize.total || 0,
        byType,
        byFolder
    }
}

function updateImageDimensions(filepath, width, height) {
    db.prepare('UPDATE images SET width = ?, height = ? WHERE filepath = ?').run(width, height, filepath)
}

function updateThumbnailPath(filepath, thumbnailPath) {
    db.prepare('UPDATE images SET thumbnail_path = ? WHERE filepath = ?').run(thumbnailPath, filepath)
}

function updateExif(filepath, exifJson) {
    db.prepare('UPDATE images SET exif_json = ? WHERE filepath = ?').run(exifJson, filepath)
}

function deleteImage(filepath) {
    db.prepare('DELETE FROM images WHERE filepath = ?').run(filepath)
}

function imageExists(filepath) {
    const row = db.prepare('SELECT id FROM images WHERE filepath = ?').get(filepath)
    return !!row
}

export {
    initDatabase, getDb, getImages, getImage, getFolders,
    searchImages, getStats, updateImageDimensions, updateThumbnailPath,
    updateExif, deleteImage, imageExists
}
