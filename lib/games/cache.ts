// Per-device cache of imported games, in IndexedDB.
//
// A heavy account is ~1,500 games and ~5 MB of JSON, far past what
// localStorage holds, so games live here rather than in window.storage. The
// games are public and cheap to re-fetch, so this cache never syncs between
// devices; only the linked account does (see store.ts).
//
// Layout (database "games-cache", version 1):
//   months  key [username, month]  { username, month: "yyyy/mm", fetchedAt, games: raw Chess.com JSON[] }
//   meta    key username           { username, lastSyncedAt, months: { "yyyy/mm": fetchedAt } }
//
// Games are stored as raw Chess.com JSON and normalized on load, so a fix to
// the normalizer (or a new field in `Game`) applies without re-downloading.
// `meta.months` mirrors which months are cached, so a sync can plan without
// reading every game. Each month write updates both stores in one transaction.
import type { ChessComGame } from "./normalize";

export interface MonthRecord {
  username: string;
  month: string;
  fetchedAt: number;
  games: ChessComGame[];
}

export interface MetaRecord {
  username: string;
  lastSyncedAt: number | null;
  months: Record<string, number>;
}

export interface GamesCache {
  /** False when IndexedDB is unavailable and games last only for this page session. */
  readonly persistent: boolean;
  getMeta(username: string): Promise<MetaRecord | null>;
  loadMonths(username: string): Promise<MonthRecord[]>;
  putMonth(record: MonthRecord): Promise<void>;
  deleteMonths(username: string, months: string[]): Promise<void>;
  setLastSynced(username: string, at: number): Promise<void>;
  clearUser(username: string): Promise<void>;
}

const DB_NAME = "games-cache";
const DB_VERSION = 1;
const MONTHS = "months";
const META = "meta";

function emptyMeta(username: string): MetaRecord {
  return { username, lastSyncedAt: null, months: {} };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(MONTHS)) {
        const months = db.createObjectStore(MONTHS, { keyPath: ["username", "month"] });
        months.createIndex("username", "username");
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "username" });
    };
    r.onsuccess = () => {
      const db = r.result;
      // Let a newer version of the app (in another tab) upgrade the schema.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("The games cache is open in an older tab."));
  });
}

class IdbCache implements GamesCache {
  readonly persistent = true;
  private dbp: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = openDb().then((db) => {
        db.addEventListener("close", () => { this.dbp = null; });
        return db;
      });
      this.dbp.catch(() => { this.dbp = null; });
    }
    return this.dbp;
  }

  async getMeta(username: string) {
    const db = await this.db();
    return (await req(db.transaction(META).objectStore(META).get(username))) ?? null;
  }

  async loadMonths(username: string) {
    const db = await this.db();
    const index = db.transaction(MONTHS).objectStore(MONTHS).index("username");
    return (await req(index.getAll(username))) as MonthRecord[];
  }

  async putMonth(record: MonthRecord) {
    const db = await this.db();
    const tx = db.transaction([MONTHS, META], "readwrite");
    const meta = tx.objectStore(META);
    tx.objectStore(MONTHS).put(record);
    const current: MetaRecord = (await req(meta.get(record.username))) ?? emptyMeta(record.username);
    meta.put({ ...current, months: { ...current.months, [record.month]: record.fetchedAt } });
    await done(tx);
  }

  async deleteMonths(username: string, months: string[]) {
    if (!months.length) return;
    const db = await this.db();
    const tx = db.transaction([MONTHS, META], "readwrite");
    const store = tx.objectStore(MONTHS);
    for (const m of months) store.delete([username, m]);
    const meta = tx.objectStore(META);
    const current: MetaRecord | undefined = await req(meta.get(username));
    if (current) {
      const rest = { ...current.months };
      for (const m of months) delete rest[m];
      meta.put({ ...current, months: rest });
    }
    await done(tx);
  }

  async setLastSynced(username: string, at: number) {
    const db = await this.db();
    const tx = db.transaction(META, "readwrite");
    const meta = tx.objectStore(META);
    const current: MetaRecord = (await req(meta.get(username))) ?? emptyMeta(username);
    meta.put({ ...current, lastSyncedAt: at });
    await done(tx);
  }

  async clearUser(username: string) {
    const db = await this.db();
    const tx = db.transaction([MONTHS, META], "readwrite");
    tx.objectStore(MONTHS).delete(IDBKeyRange.bound([username, ""], [username, "￿"]));
    tx.objectStore(META).delete(username);
    await done(tx);
  }
}

/** Used when IndexedDB is missing or refuses to open (e.g. some private modes). */
class MemoryCache implements GamesCache {
  readonly persistent = false;
  private months = new Map<string, Map<string, MonthRecord>>();
  private meta = new Map<string, MetaRecord>();

  async getMeta(username: string) {
    const m = this.meta.get(username);
    return m ? { ...m, months: { ...m.months } } : null;
  }
  async loadMonths(username: string) {
    return [...(this.months.get(username)?.values() ?? [])];
  }
  async putMonth(record: MonthRecord) {
    const user = this.months.get(record.username) ?? new Map();
    user.set(record.month, record);
    this.months.set(record.username, user);
    const meta = this.meta.get(record.username) ?? emptyMeta(record.username);
    this.meta.set(record.username, { ...meta, months: { ...meta.months, [record.month]: record.fetchedAt } });
  }
  async deleteMonths(username: string, months: string[]) {
    const meta = this.meta.get(username);
    for (const m of months) {
      this.months.get(username)?.delete(m);
      if (meta) delete meta.months[m];
    }
  }
  async setLastSynced(username: string, at: number) {
    this.meta.set(username, { ...(this.meta.get(username) ?? emptyMeta(username)), lastSyncedAt: at });
  }
  async clearUser(username: string) {
    this.months.delete(username);
    this.meta.delete(username);
  }
}

/** Opens IndexedDB, falling back to an in-memory cache if it can't. */
export async function openGamesCache(): Promise<GamesCache> {
  if (typeof indexedDB === "undefined") return new MemoryCache();
  const cache = new IdbCache();
  try {
    await cache.getMeta("");
    return cache;
  } catch (e) {
    console.warn("IndexedDB is unavailable; imported games will not be kept between visits.", e);
    return new MemoryCache();
  }
}
