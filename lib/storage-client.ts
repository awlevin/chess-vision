// Installs the window.storage async key-value API the drill expects.
//
// In cloud mode it is backed by the authenticated /api/storage routes, and
// on first load a key the server lacks is seeded once from this browser's
// localStorage, so stats from a signed-out session carry over. Otherwise it
// is backed by localStorage directly.

import { CLOUD } from "./cloud";

type StorageRecord = { key: string; value: string };

interface KVStorage {
  get(key: string): Promise<StorageRecord | null>;
  set(key: string, value: string): Promise<StorageRecord>;
  delete(key: string): Promise<void>;
  list(): Promise<{ keys: string[] }>;
}

declare global {
  interface Window {
    storage?: KVStorage & { __cvInstalled?: boolean };
  }
}

const LOCAL_PREFIX = "cv:";

function endpoint(key: string) {
  return `/api/storage/${encodeURIComponent(key)}`;
}

function localGet(key: string): string | null {
  try {
    return window.localStorage.getItem(LOCAL_PREFIX + key);
  } catch {
    return null;
  }
}

const localStorageBackend: KVStorage = {
  async get(key) {
    const value = localGet(key);
    return value == null ? null : { key, value };
  },
  async set(key, value) {
    window.localStorage.setItem(LOCAL_PREFIX + key, value);
    return { key, value };
  },
  async delete(key) {
    window.localStorage.removeItem(LOCAL_PREFIX + key);
  },
  async list() {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(LOCAL_PREFIX)) keys.push(k.slice(LOCAL_PREFIX.length));
    }
    return { keys };
  },
};

const cloudBackend: KVStorage = {
  async get(key) {
    const res = await fetch(endpoint(key));
    if (res.status === 404) {
      const local = localGet(key);
      if (local != null) {
        await this.set(key, local);
        return { key, value: local };
      }
      return null;
    }
    if (!res.ok) throw new Error(`storage.get(${key}) failed: ${res.status}`);
    return res.json();
  },

  async set(key, value) {
    const res = await fetch(endpoint(key), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error(`storage.set(${key}) failed: ${res.status}`);
    return res.json();
  },

  async delete(key) {
    const res = await fetch(endpoint(key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`storage.delete(${key}) failed: ${res.status}`);
    }
  },

  async list() {
    const res = await fetch("/api/storage");
    if (!res.ok) throw new Error(`storage.list() failed: ${res.status}`);
    return res.json();
  },
};

export function installStorage() {
  if (typeof window === "undefined") return;
  if (window.storage?.__cvInstalled) return;
  window.storage = { ...(CLOUD ? cloudBackend : localStorageBackend), __cvInstalled: true };
}
