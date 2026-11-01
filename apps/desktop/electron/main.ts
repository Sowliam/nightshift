import { app, BrowserWindow, ipcMain, desktopCapturer, session, powerSaveBlocker, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { uIOhook, UiohookKey, UiohookKeyboardEvent, UiohookMouseEvent } from 'uiohook-napi';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const isDev = process.env.ELECTRON_DEV === 'true' || !app.isPackaged;

// Global Push-to-Talk state
let globalPttEnabled = false;
let globalPttKeyCode: number | null = UiohookKey.Space;
let globalPttMouseButton: number | null = null;
let isGlobalPttDown = false;
let isRecordingGlobalKey = false;
let globalPttSeq = 0;

// Persistent file logger for PTT diagnostics across games and background execution
const pttLogPath = path.join(app.getPath('userData'), 'ptt_debug.log');
function pttLog(msg: string) {
  try {
    const line = `[${new Date().toISOString()}] [Electron Main] ${msg}\r\n`;
    fs.appendFileSync(pttLogPath, line);
  } catch {}
}

// Dynamic key name -> keycode mapping
const keyNameToCode: Record<string, number> = {};
const codeToKeyName: Record<number, string> = {};

for (const [name, code] of Object.entries(UiohookKey)) {
  if (typeof code === 'number') {
    keyNameToCode[name.toLowerCase()] = code;
    if (!codeToKeyName[code]) {
      codeToKeyName[code] = name;
    }
  }
}

// Aliases for user friendly matching
keyNameToCode['space'] = UiohookKey.Space;
keyNameToCode['spacebar'] = UiohookKey.Space;
keyNameToCode['ctrl'] = UiohookKey.Ctrl;
keyNameToCode['control'] = UiohookKey.Ctrl;
keyNameToCode['ctrlleft'] = UiohookKey.Ctrl;
keyNameToCode['ctrlright'] = UiohookKey.CtrlRight;
keyNameToCode['caps'] = UiohookKey.CapsLock;
keyNameToCode['capslock'] = UiohookKey.CapsLock;
keyNameToCode['shift'] = UiohookKey.Shift;
keyNameToCode['shiftleft'] = UiohookKey.Shift;
keyNameToCode['shiftright'] = UiohookKey.ShiftRight;
keyNameToCode['alt'] = UiohookKey.Alt;
keyNameToCode['altleft'] = UiohookKey.Alt;
keyNameToCode['altright'] = UiohookKey.AltRight;
keyNameToCode['meta'] = UiohookKey.Meta;
keyNameToCode['tab'] = UiohookKey.Tab;
keyNameToCode['backquote'] = UiohookKey.Backquote;
keyNameToCode['~'] = UiohookKey.Backquote;
keyNameToCode['`'] = UiohookKey.Backquote;

// Friendly reverse names
codeToKeyName[UiohookKey.Space] = 'Space';
codeToKeyName[UiohookKey.CapsLock] = 'CapsLock';
codeToKeyName[UiohookKey.Ctrl] = 'Ctrl';
codeToKeyName[UiohookKey.CtrlRight] = 'Ctrl';
codeToKeyName[UiohookKey.Shift] = 'Shift';
codeToKeyName[UiohookKey.ShiftRight] = 'Shift';
codeToKeyName[UiohookKey.Alt] = 'Alt';
codeToKeyName[UiohookKey.AltRight] = 'Alt';
codeToKeyName[UiohookKey.Tab] = 'Tab';

// Win32 Virtual Key Code maps for kernel-level GetAsyncKeyState helper
const vkToName: Record<number, string> = {
  2: 'Mouse 2',
  4: 'Mouse 3',
  5: 'Mouse 4',
  6: 'Mouse 5',
  8: 'Backspace',
  9: 'Tab',
  13: 'Enter',
  16: 'Shift',
  17: 'Ctrl',
  18: 'Alt',
  20: 'CapsLock',
  32: 'Space',
  33: 'PageUp',
  34: 'PageDown',
  35: 'End',
  36: 'Home',
  37: 'ArrowLeft',
  38: 'ArrowUp',
  39: 'ArrowRight',
  40: 'ArrowDown',
  45: 'Insert',
  46: 'Delete',
  186: ';',
  187: '=',
  188: ',',
  189: '-',
  190: '.',
  191: '/',
  192: '~',
  219: '[',
  220: '\\',
  221: ']',
  222: "'",
};
for (let i = 0; i <= 9; i++) {
  vkToName[48 + i] = String(i);
  vkToName[96 + i] = `Numpad${i}`;
}
for (let i = 0; i < 26; i++) {
  vkToName[65 + i] = String.fromCharCode(65 + i);
}
for (let i = 1; i <= 12; i++) {
  vkToName[111 + i] = `F${i}`;
}

const nameToVk: Record<string, number> = {};
for (const [vkStr, name] of Object.entries(vkToName)) {
  const vk = Number(vkStr);
  nameToVk[name.toLowerCase()] = vk;
}
nameToVk['space'] = 32;
nameToVk['spacebar'] = 32;
nameToVk['caps'] = 20;
nameToVk['capslock'] = 20;
nameToVk['ctrl'] = 17;
nameToVk['control'] = 17;
nameToVk['ctrlleft'] = 17;
nameToVk['ctrlright'] = 17;
nameToVk['shift'] = 16;
nameToVk['shiftleft'] = 16;
nameToVk['shiftright'] = 16;
nameToVk['alt'] = 18;
nameToVk['altleft'] = 18;
nameToVk['altright'] = 18;
nameToVk['tab'] = 9;
nameToVk['backquote'] = 192;
nameToVk['~'] = 192;
nameToVk['`'] = 192;
nameToVk['mouse2'] = 2;
nameToVk['mouse3'] = 4;
nameToVk['mouse4'] = 5;
nameToVk['mouse5'] = 6;
nameToVk['rightclick'] = 2;
nameToVk['middleclick'] = 4;

function resolveWinVk(keyStr: string): number {
  if (!keyStr) return 32; // Default VK_SPACE
  const clean = keyStr.trim().toLowerCase().replace(/\s+/g, '');
  if (nameToVk[clean] !== undefined) return nameToVk[clean];
  const stripped = clean.replace(/^key/, '').replace(/^digit/, '');
  if (nameToVk[stripped] !== undefined) return nameToVk[stripped];
  if (clean.length === 1) {
    const code = clean.toUpperCase().charCodeAt(0);
    if ((code >= 65 && code <= 90) || (code >= 48 && code <= 57)) return code;
  }
  return 32;
}

let pttHelperProcess: ChildProcess | null = null;
let globalPttKeyString = 'Space';

function initNativePttHelper() {
  if (process.platform !== 'win32') return;

  try {
    const helperPaths = [
      path.join(__dirname, 'ptt-helper.exe'),
      path.join(__dirname, '../electron/ptt-helper.exe'),
      path.join(process.resourcesPath || '', 'ptt-helper.exe'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist-electron', 'ptt-helper.exe'),
    ];
    const helperPath = helperPaths.find((p) => fs.existsSync(p));

    if (!helperPath) {
      pttLog('[PTT Helper] Native Win32 helper binary not found in candidate paths');
      console.warn('[PTT Helper] Native Win32 helper binary not found in candidate paths');
      return;
    }

    pttLog(`[PTT Helper] Spawning native helper from: ${helperPath}`);
    console.log('[PTT Helper] Spawning native helper from:', helperPath);
    pttHelperProcess = spawn(helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    pttHelperProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf8');
      const lines = text.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith('PTT:')) {
          const parts = line.split(':');
          const isDown = parts[1] === '1';
          const timestamp = parts.length > 2 ? parseInt(parts[2], 10) : Date.now();

          if (isDown !== isGlobalPttDown) {
            isGlobalPttDown = isDown;
            const seq = ++globalPttSeq;
            pttLog(`Native helper state -> ${isDown ? 'PRESSED' : 'RELEASED'} (seq: ${seq}, ts: ${timestamp})`);
            console.log(`[Main PTT] Native helper state -> ${isDown ? 'PRESSED' : 'RELEASED'} (seq: ${seq}, ts: ${timestamp})`);
            mainWindow?.webContents.send('global-ptt-change', { isDown, seq, timestamp });
          }
        } else if (line.startsWith('RECORDED:')) {
          const parts = line.split(':');
          const vk = parseInt(parts[1], 10);
          const detectedName = vkToName[vk] || `Key${vk}`;
          pttLog(`Native helper recorded key: vk=${vk} (${detectedName})`);
          mainWindow?.webContents.send('key-recorded', detectedName);
        } else {
          pttLog(`Native helper stdout: ${line}`);
        }
      }
    });

    pttHelperProcess.stderr?.on('data', (data: Buffer) => {
      const errText = data.toString('utf8').trim();
      pttLog(`[PTT Helper STDERR] ${errText}`);
      console.warn('[PTT Helper STDERR]:', errText);
    });

    pttHelperProcess.on('error', (err) => {
      pttLog(`[PTT Helper] Native helper process error: ${err}`);
      console.error('[PTT Helper] Native helper process error:', err);
      if (isGlobalPttDown) {
        isGlobalPttDown = false;
        const seq = ++globalPttSeq;
        mainWindow?.webContents.send('global-ptt-change', { isDown: false, seq, timestamp: Date.now() });
      }
    });

    pttHelperProcess.on('exit', (code) => {
      pttLog(`[PTT Helper] Process exited with code ${code}`);
      console.warn(`[PTT Helper] Process exited with code ${code}`);
      pttHelperProcess = null;
      if (isGlobalPttDown) {
        isGlobalPttDown = false;
        const seq = ++globalPttSeq;
        mainWindow?.webContents.send('global-ptt-change', { isDown: false, seq, timestamp: Date.now() });
      }
    });

    // Deferred initial state synchronization to ensure the helper reader thread is up
    setTimeout(() => {
      if (pttHelperProcess && pttHelperProcess.stdin) {
        const vk = resolveWinVk(globalPttKeyString || 'Space');
        pttLog(`Syncing initial helper config: vk=${vk}, enabled=${globalPttEnabled}`);
        pttHelperProcess.stdin.write(`SET_KEY:${vk}\nENABLE:${globalPttEnabled}\n`);
      }
    }, 150);

    pttLog('[PTT Helper] Raw Input sink active. PTT is heard inside games without administrator.');
    console.log('[PTT Helper] Raw Input sink active. PTT is heard inside games without administrator.');
  } catch (err) {
    pttLog(`[PTT Helper] Failed to initialize native helper: ${err}`);
    console.warn('[PTT Helper] Failed to initialize native helper:', err);
  }
}

function resolvePttKey(keyStr: string) {
  if (!keyStr) {
    globalPttKeyCode = UiohookKey.Space;
    globalPttMouseButton = null;
    return;
  }
  const clean = keyStr.trim().toLowerCase().replace(/\s+/g, '');

  // Mouse button support: e.g. "mouse2", "mouse3", "mouse4", "mouse5"
  if (clean.startsWith('mouse')) {
    const num = parseInt(clean.replace('mouse', '').replace('button', ''), 10);
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
  console.log(`[PTT Hook] Configured for Keycode ${globalPttKeyCode} (from: "${keyStr}")`);
}

function isKeyMatch(eventKeycode: number, targetKeycode: number | null): boolean {
  if (targetKeycode === null) return false;
  if (eventKeycode === targetKeycode) return true;

  // Left & Right Ctrl
  if (
    (targetKeycode === UiohookKey.Ctrl || targetKeycode === UiohookKey.CtrlRight) &&
    (eventKeycode === UiohookKey.Ctrl || eventKeycode === UiohookKey.CtrlRight)
  ) return true;

  // Left & Right Shift
  if (
    (targetKeycode === UiohookKey.Shift || targetKeycode === UiohookKey.ShiftRight) &&
    (eventKeycode === UiohookKey.Shift || eventKeycode === UiohookKey.ShiftRight)
  ) return true;

  // Left & Right Alt
  if (
    (targetKeycode === UiohookKey.Alt || targetKeycode === UiohookKey.AltRight) &&
    (eventKeycode === UiohookKey.Alt || eventKeycode === UiohookKey.AltRight)
  ) return true;

  // Meta / Win / Cmd
  if (
    (targetKeycode === UiohookKey.Meta || targetKeycode === UiohookKey.MetaRight) &&
    (eventKeycode === UiohookKey.Meta || eventKeycode === UiohookKey.MetaRight)
  ) return true;

  return false;
}

function initGlobalPttHook() {
  try {
    uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
      // Key recording mode
      if (isRecordingGlobalKey) {
        if (e.keycode === UiohookKey.Escape) {
          isRecordingGlobalKey = false;
          mainWindow?.webContents.send('key-recorded', 'ESCAPE');
          return;
        }
        const detectedName = codeToKeyName[e.keycode] || `Key${e.keycode}`;
        isRecordingGlobalKey = false;
        mainWindow?.webContents.send('key-recorded', detectedName);
        return;
      }

      if (!globalPttEnabled || globalPttKeyCode === null) return;
      if (pttHelperProcess !== null) return; // Dedicated native Win32 helper is primary driver
      if (isKeyMatch(e.keycode, globalPttKeyCode) && !isGlobalPttDown) {
        isGlobalPttDown = true;
        mainWindow?.webContents.send('global-ptt-change', { isDown: true, seq: Date.now(), timestamp: Date.now() });
      }
    });

    uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
      if (isRecordingGlobalKey) return;
      if (!globalPttEnabled || globalPttKeyCode === null) return;
      if (pttHelperProcess !== null) return; // Dedicated native Win32 helper is primary driver
      if (isKeyMatch(e.keycode, globalPttKeyCode) && isGlobalPttDown) {
        isGlobalPttDown = false;
        mainWindow?.webContents.send('global-ptt-change', { isDown: false, seq: Date.now(), timestamp: Date.now() });
      }
    });

    uIOhook.on('mousedown', (e: UiohookMouseEvent) => {
      // Key recording mode: ignore Left Click (button 1 in uIOhook) per user instruction
      if (isRecordingGlobalKey) {
        if (e.button === 1) return; // Ignore Left Click
        isRecordingGlobalKey = false;
        const mouseName = `Mouse ${e.button}`;
        mainWindow?.webContents.send('key-recorded', mouseName);
        return;
      }

      if (!globalPttEnabled || globalPttMouseButton === null) return;
      if (pttHelperProcess !== null) return; // Dedicated native Win32 helper is primary driver
      if (e.button === globalPttMouseButton && !isGlobalPttDown) {
        isGlobalPttDown = true;
        mainWindow?.webContents.send('global-ptt-change', { isDown: true, seq: Date.now(), timestamp: Date.now() });
      }
    });

    uIOhook.on('mouseup', (e: UiohookMouseEvent) => {
      if (isRecordingGlobalKey) return;
      if (!globalPttEnabled || globalPttMouseButton === null) return;
      if (pttHelperProcess !== null) return; // Dedicated native Win32 helper is primary driver
      if (e.button === globalPttMouseButton && isGlobalPttDown) {
        isGlobalPttDown = false;
        mainWindow?.webContents.send('global-ptt-change', { isDown: false, seq: Date.now(), timestamp: Date.now() });
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
app.commandLine.appendSwitch('disable-background-media-suspend');
// Disable Chromium native window occlusion to prevent renderer freezing when a fullscreen game covers the screen
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer');

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
      additionalArguments: [
        '--disable-features=CalculateNativeWinOcclusion',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
    show: false,
  });

  // Force disable background throttling on webContents directly
  mainWindow.webContents.setBackgroundThrottling(false);

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
    // Hide to system tray on Close (X) button like Discord/TeamSpeak
    mainWindow?.hide();
  });

  ipcMain.handle('app-quit', () => {
    isQuitting = true;
    app.quit();
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
    globalPttKeyString = key;
    resolvePttKey(key);
    const vk = resolveWinVk(key);
    pttLog(`[IPC set-global-ptt-key] key="${key}", enabled=${globalPttEnabled}, resolvedVk=${vk}`);

    if (pttHelperProcess && pttHelperProcess.stdin) {
      pttHelperProcess.stdin.write(`SET_KEY:${vk}\nENABLE:${globalPttEnabled}\n`);
    }

    if (!globalPttEnabled && isGlobalPttDown) {
      isGlobalPttDown = false;
      const seq = ++globalPttSeq;
      pttLog(`Force-releasing PTT state on disable (seq: ${seq})`);
      mainWindow?.webContents.send('global-ptt-change', { isDown: false, seq, timestamp: Date.now() });
    }
    return true;
  });

  // Renderer PTT diagnostic logger
  ipcMain.on('ptt-renderer-log', (_event, msg: string) => {
    pttLog(`[Renderer] ${msg}`);
  });

  // Global key/mouse recording handlers
  ipcMain.handle('start-recording-key', () => {
    isRecordingGlobalKey = true;
    pttLog('start-recording-key invoked');
    if (pttHelperProcess && pttHelperProcess.stdin) {
      pttHelperProcess.stdin.write('START_RECORD\n');
    }
    return true;
  });

  ipcMain.handle('stop-recording-key', () => {
    isRecordingGlobalKey = false;
    pttLog('stop-recording-key invoked');
    if (pttHelperProcess && pttHelperProcess.stdin) {
      pttHelperProcess.stdin.write('STOP_RECORD\n');
    }
    return true;
  });

  // PTT debug log reader for in-app diagnostics
  ipcMain.handle('get-ptt-debug-log', () => {
    try {
      if (fs.existsSync(pttLogPath)) {
        return fs.readFileSync(pttLogPath, 'utf8');
      }
    } catch {}
    return '';
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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      // Hide window to system tray instead of closing or taskbar minimize
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  if (tray) return;

  const candidateIcons = [
    path.join(__dirname, '../public/logo.png'),
    path.join(__dirname, '../dist/logo.png'),
    path.join(process.resourcesPath || '', 'public/logo.png'),
    path.join(__dirname, 'logo.png'),
  ];
  const iconPath = candidateIcons.find((p) => fs.existsSync(p)) || '';
  let trayIcon: Electron.NativeImage;
  try {
    if (iconPath) {
      trayIcon = nativeImage.createFromPath(iconPath);
      if (!trayIcon.isEmpty()) {
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
      } else {
        trayIcon = nativeImage.createEmpty();
      }
    } else {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('NIGHTSHIFT Voice & Gaming');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open NIGHTSHIFT',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit NIGHTSHIFT',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  try {
    const blockerId = powerSaveBlocker.start('prevent-app-suspension');
    pttLog(`powerSaveBlocker started (prevent-app-suspension, id: ${blockerId})`);
  } catch (err) {
    pttLog(`Failed to start powerSaveBlocker: ${err}`);
  }
  createWindow();
  createTray();
  initGlobalPttHook();
  initNativePttHelper();
});

app.on('before-quit', () => {
  isQuitting = true;
  try {
    if (pttHelperProcess) {
      pttHelperProcess.stdin?.write('QUIT\n');
      pttHelperProcess.kill();
    }
    uIOhook.stop();
  } catch {}
});

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
