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
  getVersion: () => Promise<string>;
  getScreenSources: () => Promise<DesktopScreenSource[]>;
  setGlobalPttKey: (key: string, enabled: boolean) => Promise<boolean>;
  onGlobalPttChange: (callback: (isDown: boolean) => void) => () => void;
}

const api: NightshiftDesktopApi = {
  isElectron: true,
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  setGlobalPttKey: (key: string, enabled: boolean) => ipcRenderer.invoke('set-global-ptt-key', key, enabled),
  onGlobalPttChange: (callback: (isDown: boolean) => void) => {
    const handler = (_event: any, isDown: boolean) => callback(isDown);
    ipcRenderer.on('global-ptt-change', handler);
    return () => {
      ipcRenderer.removeListener('global-ptt-change', handler);
    };
  },
};

contextBridge.exposeInMainWorld('nightshift', api);
