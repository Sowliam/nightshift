export interface SoundboardItem {
  id: string;
  name: string;
  category: string;
  volume: number; // 0 to 100
  hotkey: string | null;
  duration: number; // in seconds
  createdAt: number;
  isFavorite?: boolean;
  audioUrl?: string;
  artworkUrl?: string;
  artist?: string;
  source?: 'local' | 'cloud';
}

export interface Playlist {
  id: string;
  name: string;
  soundIds: string[];
  createdAt: number;
}

interface StoredSoundRecord extends SoundboardItem {
  audioBufferData: ArrayBuffer;
}

const DB_NAME = 'nightshift_soundboard_db';
const DB_VERSION = 2;
const STORE_NAME = 'sound_records';
const PLAYLISTS_STORE_NAME = 'playlists';

class SoundboardStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      let isSettled = false;
      const timeout = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.dbPromise = null;
          reject(new Error('IndexedDB open request timed out'));
        }
      }, 4000);

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('category', 'category', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
          if (!db.objectStoreNames.contains(PLAYLISTS_STORE_NAME)) {
            const pStore = db.createObjectStore(PLAYLISTS_STORE_NAME, { keyPath: 'id' });
            pStore.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };

        request.onsuccess = () => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timeout);
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };

        request.onblocked = () => {
          console.warn('Soundboard IndexedDB upgrade blocked by older connection');
        };

        request.onerror = () => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timeout);
          this.dbPromise = null;
          reject(new Error(`Failed to open Soundboard database: ${request.error?.message}`));
        };
      } catch (err: any) {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeout);
        this.dbPromise = null;
        reject(err);
      }
    });

    return this.dbPromise;
  }

  async getAllItems(): Promise<SoundboardItem[]> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        return [];
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const records: StoredSoundRecord[] = req.result || [];
          // Strip large ArrayBuffer from metadata list for performance
          const items: SoundboardItem[] = records.map(({ audioBufferData, ...meta }) => meta);
          resolve(items);
        };

        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Error reading soundboard items from IndexedDB:', err);
      return [];
    }
  }

  async getAudioData(id: string): Promise<ArrayBuffer | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);

        req.onsuccess = () => {
          const record: StoredSoundRecord | undefined = req.result;
          resolve(record?.audioBufferData || null);
        };

        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`Error reading audio data for sound ${id}:`, err);
      return null;
    }
  }

  async saveSound(item: SoundboardItem, audioData: ArrayBuffer): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredSoundRecord = {
        ...item,
        audioBufferData: audioData,
      };
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async updateItem(id: string, updates: Partial<SoundboardItem>): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const record: StoredSoundRecord | undefined = getReq.result;
        if (!record) {
          return resolve();
        }
        const updatedRecord: StoredSoundRecord = {
          ...record,
          ...updates,
          id, // ensure ID is preserved
        };
        const putReq = store.put(updatedRecord);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  }

  async deleteItem(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(PLAYLISTS_STORE_NAME)) {
        return [];
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PLAYLISTS_STORE_NAME, 'readonly');
        const store = tx.objectStore(PLAYLISTS_STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          resolve(req.result || []);
        };

        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Error reading playlists from IndexedDB:', err);
      return [];
    }
  }

  async savePlaylist(playlist: Playlist): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLAYLISTS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PLAYLISTS_STORE_NAME);
      const req = store.put(playlist);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async deletePlaylist(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLAYLISTS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PLAYLISTS_STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export const soundboardStorage = new SoundboardStorage();
