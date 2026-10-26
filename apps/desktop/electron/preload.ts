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
}

const api: NightshiftDesktopApi = {
  isElectron: true,
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
};

contextBridge.exposeInMainWorld('nightshift', api);
