import { app, BrowserWindow, ipcMain, desktopCapturer, session } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.ELECTRON_DEV === 'true' || !app.isPackaged;

// Discord-grade hardware acceleration & color fidelity for screen sharing
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force-color-profile', 'srgb');
// Ensure Web Audio, WebRTC, and microphone inputs never get suspended or blocked by Autoplay policies in Desktop mode
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Discord/TeamSpeak grade flags: never throttle timers, Web Audio, or WebRTC when window is minimized or behind other apps
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

async function createWindow() {
  const iconPath = path.join(__dirname, '../public/logo.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0A0908',
    icon: iconPath,
    frame: false, // Custom sleek titlebar
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false, // CRITICAL: Never throttle audio DSP or WebRTC when minimized
    },
    show: false,
  });

  // Explicitly allow microphone and display media captures in Electron
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'videoCapture', 'desktopCapture', 'display-capture', 'notifications'];
    if (allowed.includes(permission)) {
      callback(true);
      return;
    }
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Window control handlers
  ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window-close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // Desktop Screen and Window capture sources handler
  ipcMain.handle('get-screen-sources', async () => {
    try {
      let screens: Electron.DesktopCapturerSource[] = [];
      let windows: Electron.DesktopCapturerSource[] = [];

      // 1. Fetch screens
      try {
        screens = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: false,
        });
      } catch (screenErr) {
        console.warn('Direct screen capture enumeration notice:', screenErr);
      }

      // 2. Fetch application windows with app icons
      try {
        windows = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        });
      } catch (winErr) {
        console.warn('Window capture with icons failed, retrying without icons:', winErr);
        try {
          windows = await desktopCapturer.getSources({
            types: ['window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: false,
          });
        } catch (winFallbackErr) {
          console.warn('Window capture enumeration notice:', winFallbackErr);
        }
      }

      // 3. If either screens or windows is empty, attempt unified query as fallback
      if (screens.length === 0 || windows.length === 0) {
        try {
          const combined = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: true,
          });
          if (screens.length === 0) {
            screens = combined.filter((s) => !s.id.startsWith('window:'));
          }
          if (windows.length === 0) {
            windows = combined.filter((s) => s.id.startsWith('window:'));
          }
        } catch (combinedErr) {
          console.warn('Combined desktop capture fallback notice:', combinedErr);
        }
      }

      const allSources = [...screens, ...windows];

      return allSources.map((s) => {
        let thumbnailUrl = '';
        try {
          thumbnailUrl = s.thumbnail ? s.thumbnail.toDataURL() : '';
        } catch {}

        let appIconUrl = '';
        try {
          appIconUrl = s.appIcon ? s.appIcon.toDataURL() : '';
        } catch {}

        const isWindow = s.id.startsWith('window:');
        const defaultName = isWindow ? 'Application Window' : 'Entire Screen';

        return {
          id: s.id,
          name: s.name && s.name.trim().length > 0 ? s.name.trim() : defaultName,
          thumbnailUrl,
          appIconUrl,
          displayId: s.display_id,
          isWindow,
        };
      });
    } catch (err) {
      console.error('Failed to get desktop capturer sources:', err);
      return [];
    }
  });

  // Enable system audio loopback capture for screen sharing in Electron
  if (session.defaultSession && (session.defaultSession as any).setDisplayMediaRequestHandler) {
    (session.defaultSession as any).setDisplayMediaRequestHandler((_request: any, callback: any) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        if (sources && sources.length > 0) {
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          callback({});
        }
      }).catch(() => {
        callback({});
      });
    });
  }

  // Allow F5 and Ctrl+R to reload the window, and F12 / Ctrl+Shift+I to toggle DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) {
      mainWindow?.webContents.reloadIgnoringCache();
    }
    if (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  if (isDev) {
    try {
      await mainWindow.webContents.session.clearCache();
    } catch {}
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
