import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { app, BrowserWindow, Menu, dialog, shell, ipcMain, protocol } from 'electron'
import { clipboard, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { setupMenu } from './menu.js'
import { setupIpcHandlers } from './ipc-handlers.js'
import { initDatabase } from './database.js'
import { initWatcher } from './watcher.js'

app.name = 'Gallery'

console.log('Desktop App: Starting...');

let mainWindow = null
let store

async function loadStore() {
  console.log('Desktop App: Loading store...');
  try {
    const { default: ElectronStore } = await import('electron-store')
    store = new ElectronStore({
      defaults: {
        scanFolders: [
          path.join(app.getPath('home'), 'Pictures'),
          path.join(app.getPath('home'), 'Desktop'),
          path.join(app.getPath('home'), 'Downloads'),
          path.join(app.getPath('home'), 'Documents')
        ],
        thumbnailSize: 200,
        sortBy: 'modified',
        sortOrder: 'desc',
        windowBounds: { width: 1400, height: 900 }
      }
    })
    console.log('Desktop App: Store loaded');
    return store
  } catch (err) {
    console.error('Desktop App: Failed to load store', err);
    throw err;
  }
}

function createWindow() {
  console.log('Desktop App: Creating window...');
  const bounds = store.get('windowBounds')
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e1e',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    show: false
  })

  const indexHtml = path.join(__dirname, '..', 'renderer', 'index.html');
  console.log('Desktop App: Loading file:', indexHtml);
  mainWindow.loadFile(indexHtml)

  mainWindow.once('ready-to-show', () => {
    console.log('Desktop App: Window ready to show');
    mainWindow.show()
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.on('resize', () => {
    const [width, height] = mainWindow.getSize()
    store.set('windowBounds', { width, height })
  })

  mainWindow.on('closed', () => {
    console.log('Desktop App: Window closed');
    mainWindow = null
  })

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer]: ${message} (${sourceId}:${line})`);
  });
}

async function init() {
  console.log('Desktop App: Init...');
  try {
    protocol.registerFileProtocol('gallery', (request, callback) => {
      const url = request.url.substr(10)
      callback({ path: decodeURI(url) })
    })

    await loadStore()

    initDatabase()
    createWindow()
    setupIpcHandlers(mainWindow, store)
    setupMenu(mainWindow, store)

    // Start watcher after window is ready
    mainWindow.once('ready-to-show', () => {
      const folders = store.get('scanFolders')
      initWatcher(folders, mainWindow)
    })
  } catch (err) {
    console.error('Desktop App: Init failed', err);
  }
}

app.whenReady().then(init)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

// Security: prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event) => event.preventDefault())
})

export const getMainWindow = () => mainWindow;
export const getStore = () => store;
