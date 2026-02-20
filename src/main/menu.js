import { app, Menu, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function setupMenu(mainWindow, store) {
    app.setAboutPanelOptions({
        applicationName: 'Gallery',
        applicationVersion: '1.0.0',
        copyright: 'Copyright (c) 2026 awmrit.com',
        version: '1.0.0',
        credits: 'Made by awmrit.com',
        authors: ['awmrit.com'],
        website: 'https://awmrit.com',
        iconPath: path.join(__dirname, '../../assets/icon.png')
    })

    const template = [
        {
            label: 'Gallery',
            submenu: [
                { label: 'About Gallery', role: 'about' },
                { type: 'separator' },
                {
                    label: 'Add Folder...',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openDirectory'],
                            title: 'Add Folder to Gallery'
                        })
                        if (!result.canceled && result.filePaths.length > 0) {
                            mainWindow.webContents.send('menu:add-folder', result.filePaths[0])
                        }
                    }
                },
                {
                    label: 'Preferences...',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => mainWindow.webContents.send('menu:preferences')
                },
                { type: 'separator' },
                { label: 'Hide Gallery', accelerator: 'CmdOrCtrl+H', role: 'hide' },
                { label: 'Hide Others', accelerator: 'CmdOrCtrl+Alt+H', role: 'hideOthers' },
                { label: 'Show All', role: 'unhide' },
                { type: 'separator' },
                { label: 'Quit Gallery', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
            ]
        },
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Image...',
                    accelerator: 'CmdOrCtrl+Shift+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile'],
                            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'heic', 'heif', 'webp', 'avif', 'svg', 'raw', 'cr2', 'nef', 'arw'] }]
                        })
                        if (!result.canceled && result.filePaths.length > 0) {
                            mainWindow.webContents.send('menu:open-image', result.filePaths[0])
                        }
                    }
                },
                { type: 'separator' },
                { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu:save') },
                { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('menu:save-as') },
                { label: 'Export...', accelerator: 'CmdOrCtrl+E', click: () => mainWindow.webContents.send('menu:export') },
                { type: 'separator' },
                { label: 'Show in Finder', accelerator: 'CmdOrCtrl+Shift+F', click: () => mainWindow.webContents.send('menu:show-in-finder') },
                { label: 'Move to Trash', accelerator: 'CmdOrCtrl+Delete', click: () => mainWindow.webContents.send('menu:delete') },
                { type: 'separator' },
                { label: 'Close Window', accelerator: 'CmdOrCtrl+W', role: 'close' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.send('menu:undo') },
                { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => mainWindow.webContents.send('menu:redo') },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
                { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => mainWindow.webContents.send('menu:select-all') },
                { type: 'separator' },
                { label: 'Edit Image', accelerator: 'CmdOrCtrl+E', click: () => mainWindow.webContents.send('menu:edit-image') }
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
                { type: 'separator' },
                { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => mainWindow.webContents.send('menu:zoom-in') },
                { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow.webContents.send('menu:zoom-out') },
                { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => mainWindow.webContents.send('menu:zoom-actual') },
                { label: 'Fit to Window', accelerator: 'CmdOrCtrl+1', click: () => mainWindow.webContents.send('menu:zoom-fit') },
                { type: 'separator' },
                { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow.webContents.send('menu:toggle-sidebar') },
                { label: 'Toggle Fullscreen', accelerator: 'Ctrl+CmdOrCtrl+F', role: 'togglefullscreen' },
                { type: 'separator' },
                {
                    label: 'Sort By',
                    submenu: [
                        { label: 'Date Modified', click: () => mainWindow.webContents.send('menu:sort', 'modified') },
                        { label: 'Date Created', click: () => mainWindow.webContents.send('menu:sort', 'created') },
                        { label: 'Name', click: () => mainWindow.webContents.send('menu:sort', 'name') },
                        { label: 'Size', click: () => mainWindow.webContents.send('menu:sort', 'size') },
                        { label: 'Type', click: () => mainWindow.webContents.send('menu:sort', 'type') }
                    ]
                },
                {
                    label: 'Thumbnail Size',
                    submenu: [
                        { label: 'Small', click: () => mainWindow.webContents.send('menu:thumb-size', 120) },
                        { label: 'Medium', click: () => mainWindow.webContents.send('menu:thumb-size', 200) },
                        { label: 'Large', click: () => mainWindow.webContents.send('menu:thumb-size', 300) }
                    ]
                }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
                { label: 'Zoom', role: 'zoom' },
                { type: 'separator' },
                { label: 'Bring All to Front', role: 'front' }
            ]
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'GitHub Repository',
                    click: async () => {
                        await shell.openExternal('https://github.com/iamawmrit/Gallery')
                    }
                }
            ]
        }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}

export { setupMenu }
