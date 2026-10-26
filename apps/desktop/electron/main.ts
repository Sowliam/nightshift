import { app, BrowserWindow, ipcMain, desktopCapturer, session } from 'electron';
import path from 'path';
import { uIOhook, UiohookKey, UiohookKeyboardEvent, UiohookMouseEvent } from 'uiohook-napi';

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.ELECTRON_DEV === 'true' || !app.isPackaged;

// Global Push-to-Talk state
let globalPttEnabled = false;
let globalPttKeyCode: number | null = UiohookKey.Space;
let globalPttMouseButton: number | null = null;
let isGlobalPttDown = false;

// Dynamic key name -> keycode mapping
const keyNameToCode: Record<string, number> = {};
for (const [name, code] of Object.entries(UiohookKey)) {
  keyNameToCode[name.toLowerCase()] = code as number;
}
keyNameToCode['space'] = UiohookKey.Space;
keyNameToCode['spacebar'] = UiohookKey.Space;
keyNameToCode['ctrl'] = UiohookKey.Ctrl;
keyNameToCode['control'] = UiohookKey.Ctrl;
keyNameToCode['caps'] = UiohookKey.CapsLock;
keyNameToCode['capslock'] = UiohookKey.CapsLock;
keyNameToCode['shift'] = UiohookKey.Shift;
keyNameToCode['alt'] = UiohookKey.Alt;
keyNameToCode['meta'] = UiohookKey.Meta;

function resolvePttKey(keyStr: string) {
  if (!keyStr) {
    globalPttKeyCode = UiohookKey.Space;
    globalPttMouseButton = null;
    return;
  }
  const clean = keyStr.trim().toLowerCase();

  // Mouse button support: e.g. "mouse3", "mouse4", "mouse5"
  if (clean.startsWith('mouse')) {
    const num = parseInt(clean.replace('mouse', ''), 10);
    if (!isNaN(num)) {
      globalPttMouseButton = num;
      globalPttKeyCode = null;
      return;
    }
  }

  globalPttMouseButton = null;
  let lookup = clean;
  if (lookup.startsWith('key')) lookup = lookup.replace('key', '');
  if (lookup.startsWith('digit')) lookup = lookup.replace('digit', '');

  if (keyNameToCode[lookup] !== undefined) {
    globalPttKeyCode = keyNameToCode[lookup];
  } else if (keyNameToCode[clean] !== undefined) {
    globalPttKeyCode = keyNameToCode[clean];
  } else {
    globalPttKeyCode = UiohookKey.Space;
  }
}

function initGlobalPttHook() {
  try {
    uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
      if (!globalPttEnabled || globalPttKeyCode === null) return;
      if (e.keycode === globalPttKeyCode && !isGlobalPttDown) {
        isGlobalPttDown = true;
        mainWindow?.webContents.send('global-ptt-change', true);
      }
    });

    uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
      if (!globalPttEnabled || globalPttKeyCode === null) return;
      if (e.keycode === globalPttKeyCode && isGlobalPttDown) {
        isGlobalPttDown = false;
        mainWindow?.webContents.send('global-ptt-change', false);
      }
    });

    uIOhook.on('mousedown', (e: UiohookMouseEvent) => {
      if (!globalPttEnabled || globalPttMouseButton === null) return;
      if (e.button === globalPttMouseButton && !isGlobalPttDown) {
        isGlobalPttDown = true;
        mainWindow?.webContents.send('global-ptt-change', true);
      }
    });

    uIOhook.on('mouseup', (e: UiohookMouseEvent) => {
      if (!globalPttEnabled || globalPttMouseButton === null) return;
      if (e.button === globalPttMouseButton && isGlobalPttDown) {
        isGlobalPttDown = false;
        mainWindow?.webContents.send('global-ptt-change', false);
      }
    });

    uIOhook.start();
  } catch (err) {
    console.warn('Failed to start uIOhook for global PTT:', err);
  }
}

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
// Disable unstable Chromium Windows.Graphics.Capture session on Windows to eliminate ProcessFrame failed (-2147467259)
app.commandLine.appendSwitch('disable-features', 'WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer');

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
      let allSources: Electron.DesktopCapturerSource[] = [];

      // Primary: Query both screen and window sources in unified call
      try {
        allSources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        });
      } catch (iconErr) {
        console.warn('desktopCapturer with icons failed, retrying without icons:', iconErr);
      }

      // Fallback: If failed or returned no windows, query without window icons for maximum compatibility
      const hasWindows = allSources.some((s) => s.id.startsWith('window:'));
      if (allSources.length === 0 || !hasWindows) {
        try {
          const fallback = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: false,
          });
          if (fallback.length > 0) {
            allSources = fallback;
          }
        } catch (fallbackErr) {
          console.warn('Fallback desktopCapturer enumeration notice:', fallbackErr);
        }
      }

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

  // Global Push-to-Talk IPC configuration handler
  ipcMain.handle('set-global-ptt-key', (_event, key: string, enabled: boolean) => {
    globalPttEnabled = !!enabled;
    resolvePttKey(key);
    if (!globalPttEnabled && isGlobalPttDown) {
      isGlobalPttDown = false;
      mainWindow?.webContents.send('global-ptt-change', false);
    }
    return true;
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

app.whenReady().then(() => {
  createWindow();
  initGlobalPttHook();
});

app.on('before-quit', () => {
  try {
    uIOhook.stop();
  } catch {}
});

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
