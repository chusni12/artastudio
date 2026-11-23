/**
 * ArtaStudio - Local Storage & Embedded Database Engine
 * 
 * Menggunakan IndexedDB (di browser) dengan fallback SQLite/JSON DB di backend lokal:
 * - Menyimpan daftar repositori Git kustom
 * - Menyimpan riwayat percakapan chat AI per workspace
 * - Menyimpan konfigurasi API Secrets & Engine
 * - Menyimpan preferensi UI (lebar panel, viewport, rute terakhir)
 */

const DB_NAME = 'ArtaStudio_LocalDB';
const DB_VERSION = 1;

export interface WorkspaceRecord {
  id: string;
  name: string;
  repoUrl: string;
  defaultPath: string;
  framework: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionRecord {
  sessionId: string;
  projectId: string;
  messages: any[];
  updatedAt: string;
}

export interface AppSettingsRecord {
  key: string;
  value: any;
  updatedAt: string;
}

class LocalDatabaseManager {
  private db: IDBDatabase | null = null;
  private isSupported: boolean = typeof window !== 'undefined' && 'indexedDB' in window;

  constructor() {
    if (this.isSupported) {
      this.initDB();
    }
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported) {
        return reject(new Error('IndexedDB tidak didukung di lingkungan ini'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Store Repositori & Workspace
        if (!db.objectStoreNames.contains('workspaces')) {
          const wsStore = db.createObjectStore('workspaces', { keyPath: 'id' });
          wsStore.createIndex('name', 'name', { unique: false });
          wsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 2. Store Riwayat Chat AI
        if (!db.objectStoreNames.contains('chat_sessions')) {
          const chatStore = db.createObjectStore('chat_sessions', { keyPath: 'sessionId' });
          chatStore.createIndex('projectId', 'projectId', { unique: false });
          chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 3. Store Pengaturan & Secrets Aplikasi
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return await this.initDB();
  }

  // ================= WORKSPACES OPERATIONS =================
  public async saveWorkspace(ws: WorkspaceRecord): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workspaces', 'readwrite');
      const store = tx.objectStore('workspaces');
      store.put({ ...ws, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getAllWorkspaces(): Promise<WorkspaceRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workspaces', 'readonly');
      const store = tx.objectStore('workspaces');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  public async deleteWorkspace(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workspaces', 'readwrite');
      const store = tx.objectStore('workspaces');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ================= CHAT SESSIONS OPERATIONS =================
  public async saveChatSession(sessionId: string, projectId: string, messages: any[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chat_sessions', 'readwrite');
      const store = tx.objectStore('chat_sessions');
      store.put({
        sessionId,
        projectId,
        messages,
        updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getChatSession(sessionId: string): Promise<ChatSessionRecord | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chat_sessions', 'readonly');
      const store = tx.objectStore('chat_sessions');
      const request = store.get(sessionId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // ================= APP SETTINGS OPERATIONS =================
  public async setSetting(key: string, value: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key, value, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getSetting<T>(key: string, defaultValue?: T): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result && request.result.value !== undefined) {
            resolve(request.result.value);
          } else {
            resolve(defaultValue !== undefined ? defaultValue : null);
          }
        };
        request.onerror = () => resolve(defaultValue !== undefined ? defaultValue : null);
      });
    } catch {
      return defaultValue !== undefined ? defaultValue : null;
    }
  }
}

export const localDB = new LocalDatabaseManager();
