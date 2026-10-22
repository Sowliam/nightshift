"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    isElectron: true,
    minimize: () => electron_1.ipcRenderer.invoke('window-minimize'),
    maximize: () => electron_1.ipcRenderer.invoke('window-maximize'),
    close: () => electron_1.ipcRenderer.invoke('window-close'),
    getVersion: () => electron_1.ipcRenderer.invoke('get-app-version'),
    getScreenSources: () => electron_1.ipcRenderer.invoke('get-screen-sources'),
};
electron_1.contextBridge.exposeInMainWorld('nightshift', api);
//# sourceMappingURL=preload.js.map