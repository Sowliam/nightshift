"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
let mainWindow = null;
const isDev = process.env.ELECTRON_DEV === 'true' || !electron_1.app.isPackaged;
async function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#17191C',
        frame: false, // Custom sleek titlebar
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
        },
        show: false,
    });
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    // Window control handlers
    electron_1.ipcMain.handle('window-minimize', () => {
        mainWindow?.minimize();
    });
    electron_1.ipcMain.handle('window-maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        }
        else {
            mainWindow?.maximize();
        }
    });
    electron_1.ipcMain.handle('window-close', () => {
        mainWindow?.close();
    });
    electron_1.ipcMain.handle('get-app-version', () => {
        return electron_1.app.getVersion();
    });
    // Desktop Screen and Window capture sources handler
    electron_1.ipcMain.handle('get-screen-sources', async () => {
        try {
            const sources = await electron_1.desktopCapturer.getSources({
                types: ['window', 'screen'],
                thumbnailSize: { width: 320, height: 180 },
                fetchWindowIcons: false,
            });
            return sources.map((s) => ({
                id: s.id,
                name: s.name,
                thumbnailUrl: s.thumbnail.toDataURL(),
                displayId: s.display_id,
                isWindow: s.id.startsWith('window:'),
            }));
        }
        catch (err) {
            console.error('Failed to get desktop capturer sources:', err);
            return [];
        }
    });
    if (isDev) {
        const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
        await mainWindow.loadURL(devUrl);
        // Optionally open dev tools during development
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        await mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
//# sourceMappingURL=main.js.map