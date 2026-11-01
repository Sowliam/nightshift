import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopScreenSource {
  id: string;
  name: string;
  thumbnailUrl: string;
  appIconUrl?: string;
  displayId?: string;
  isWindow: boolean;
}

export interface NightshiftDesktopApi {
  isElectron: boolean;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  quit: () => Promise<void>;
  getVersion: () => Promise<string>;
  getScreenSources: () => Promise<DesktopScreenSource[]>;
  setGlobalPttKey: (key: string, enabled: boolean) => Promise<boolean>;
  onGlobalPttChange: (callback: (data: any) => void) => () => void;
  startRecordingKey: () => Promise<boolean>;
  stopRecordingKey: () => Promise<boolean>;
  onKeyRecorded: (callback: (key: string) => void) => () => void;
  getPttDebugLog?: () => Promise<string>;
  logPtt?: (msg: string) => void;
  measurePing?: (targetHost: string, port?: number) => Promise<number>;
}

const api: NightshiftDesktopApi = {
  isElectron: true,
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  quit: () => ipcRenderer.invoke('app-quit'),
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  setGlobalPttKey: (key: string, enabled: boolean) => ipcRenderer.invoke('set-global-ptt-key', key, enabled),
  onGlobalPttChange: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('global-ptt-change', handler);
    return () => {
      ipcRenderer.removeListener('global-ptt-change', handler);
    };
  },
  startRecordingKey: () => ipcRenderer.invoke('start-recording-key'),
  stopRecordingKey: () => ipcRenderer.invoke('stop-recording-key'),
  onKeyRecorded: (callback: (key: string) => void) => {
    const handler = (_event: any, key: string) => callback(key);
    ipcRenderer.on('key-recorded', handler);
    return () => {
      ipcRenderer.removeListener('key-recorded', handler);
    };
  },
  getPttDebugLog: () => ipcRenderer.invoke('get-ptt-debug-log'),
  logPtt: (msg: string) => ipcRenderer.send('ptt-renderer-log', msg),
  measurePing: (targetHost: string, port?: number) => ipcRenderer.invoke('measure-ping', targetHost, port),
};

contextBridge.exposeInMainWorld('nightshift', api);
