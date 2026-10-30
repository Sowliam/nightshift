import { DesktopScreenSource } from '@nightshift/shared';

export interface NightshiftDesktopApi {
  isElectron: boolean;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  getVersion: () => Promise<string>;
  getScreenSources: () => Promise<DesktopScreenSource[]>;
  setGlobalPttKey?: (key: string, enabled: boolean) => Promise<boolean>;
  onGlobalPttChange?: (callback: (data: any) => void) => () => void;
  startRecordingKey?: () => Promise<boolean>;
  stopRecordingKey?: () => Promise<boolean>;
  onKeyRecorded?: (callback: (key: string) => void) => () => void;
  getPttDebugLog?: () => Promise<string>;
  logPtt?: (msg: string) => void;
}

declare global {
  interface Window {
    nightshift?: NightshiftDesktopApi;
  }
}
