import { DesktopScreenSource } from '@nightshift/shared';

export interface NightshiftDesktopApi {
  isElectron: boolean;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  getVersion: () => Promise<string>;
  getScreenSources: () => Promise<DesktopScreenSource[]>;
}

declare global {
  interface Window {
    nightshift?: NightshiftDesktopApi;
  }
}
