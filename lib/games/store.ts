// The games store: the linked account, the imported games, and the sync
// that keeps them current. One instance lives for the whole app (see
// provider.tsx), so moving between pages never reloads or refetches.
//
// Where things live:
// - The linked account is a small JSON value in window.storage under
//   ACCOUNT_STORAGE_KEY. In cloud mode that is the signed-in user's Neon row,
//   so the link follows them to every device.
// - Games are cached per device in IndexedDB (cache.ts), one record per
//   username and month. A device that knows the account but has no games
//   imports them on its own.
//
// Sync (runSync): fetch the archive list, then fetch, one request at a time
// and newest first, every month that is not cached or was still in progress
// when it was cached (which always includes the current month). Each month
// is saved as soon as it arrives, so a failure part way keeps everything
// fetched so far and the next sync picks up the rest.
import type { Game, GamesState, LinkedAccount, SyncState } from "./types";
import { normalizeChessComGame, type ChessComGame } from "./normalize";
import { openGamesCache, type GamesCache, type MetaRecord } from "./cache";
import {
  ChessComError,
  fetchArchives,
  fetchMonth,
  fetchProfile,
  isAbortError,
  parseUsername,
  type ChessComProfile,
} from "./chesscom";

/** window.storage key holding the LinkedAccount JSON. */
export const ACCOUNT_STORAGE_KEY = "games-account-v1";
/** Games refresh on their own when the last sync is older than this. */
export const STALE_AFTER_MS = 60 * 60 * 1000;
/**
 * A month is final once it was fetched at least this long after it ended.
 * The slack covers games that finish just before midnight and reach the
 * archive late, and any time-zone skew in how Chess.com files them.
 */
const SETTLED_AFTER_MS = 12 * 60 * 60 * 1000;
/** After a failed sync, wait this long before retrying on our own. */
const AUTO_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
/** While syncing, publish new games at most this often so features don't recompute per month. */
const PUBLISH_INTERVAL_MS = 1500;
/** How often a visible page checks whether its games have gone stale. */
const STALE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const IDLE: SyncState = { status: "idle" };
export const INITIAL_STATE: GamesState = {
  account: null,
  ready: false,
  games: [],
  sync: IDLE,
  lastSyncedAt: null,
};

type Message = { type: "account-changed" } | { type: "synced"; username: string };

interface MonthGames {
  fetchedAt: number;
  games: Game[];
  /** Cheap fingerprint, so re-fetching an unchanged month doesn't hand features a new array. */
  sig: string;
}

/** "2026/10" → Unix ms of the first instant of November 2026, UTC. */
function monthEnd(month: string): number {
  const [y, m] = month.split("/").map(Number);
  return Date.UTC(y, m, 1);
}

function isSettled(month: string, fetchedAt: number): boolean {
  return fetchedAt >= monthEnd(month) + SETTLED_AFTER_MS;
}

function normalizeMonth(raw: ChessComGame[], username: string): MonthGames["games"] {
  const out: Game[] = [];
  for (const g of raw) {
    try {
      const game = normalizeChessComGame(g, username);
      if (game) out.push(game);
    } catch {
      // One malformed game must not hide the rest.
    }
  }
  return out;
}

function signature(games: Game[]): string {
  return games.map((g) => `${g.id}${g.accuracy ? "*" : ""}`).join(",");
}

function flatten(months: Map<string, MonthGames>): Game[] {
  const byId = new Map<string, Game>();
  for (const m of months.values()) for (const g of m.games) byId.set(g.id, g);
  return [...byId.values()].sort((a, b) => a.endTime - b.endTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function displayNameFrom(profile: ChessComProfile, username: string): string {
  const fromUrl = profile.url?.split("/").filter(Boolean).pop();
  return fromUrl && fromUrl.toLowerCase() === username ? decodeURIComponent(fromUrl) : profile.username || username;
}

function parseAccount(value: string | undefined | null): LinkedAccount | null {
  if (!value) return null;
  try {
    const a = JSON.parse(value);
    if (a && a.source === "chess.com" && typeof a.username === "string" && a.username) {
      return { ...a, displayName: typeof a.displayName === "string" ? a.displayName : a.username };
    }
  } catch {
    // Treat unreadable values as "not linked".
  }
  return null;
}

function storage() {
  if (typeof window === "undefined" || !window.storage) {
    throw new Error("window.storage is not installed; render inside <AppProviders>.");
  }
  return window.storage;
}

let cachePromise: Promise<GamesCache> | null = null;
function gamesCache(): Promise<GamesCache> {
  cachePromise ??= openGamesCache();
  return cachePromise;
}

export class GamesStore {
  private state: GamesState = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private months = new Map<string, MonthGames>();
  /** Bumped whenever the account or scope changes; async work started under an older value is dropped. */
  private gen = 0;
  private task: { promise: Promise<void>; abort: AbortController; gen: number } | null = null;
  private lastFailureAt = 0;
  private lastPublishAt = 0;
  private dirty = false;
  private scope: string | null | undefined = undefined;
  private detach: (() => void) | null = null;
  private channel: BroadcastChannel | null = null;

  // ---- React binding (useSyncExternalStore) ----
  getState = (): GamesState => this.state;
  getServerState = (): GamesState => INITIAL_STATE;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private set(patch: Partial<GamesState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ---- Lifecycle ----

  /**
   * Starts loading for a storage scope: "local", or the signed-in user's id in
   * cloud mode (null when signed out). A new scope starts from a clean state.
   */
  start(scope: string | null) {
    this.stop();
    if (scope !== this.scope) {
      this.months.clear();
      this.state = INITIAL_STATE;
      this.set({});
    }
    this.scope = scope;

    const onVisible = () => { if (document.visibilityState === "visible") this.autoSync(); };
    const onOnline = () => this.autoSync();
    const timer = window.setInterval(onVisible, STALE_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("games-sync");
      this.channel.onmessage = (e: MessageEvent<Message>) => this.onMessage(e.data);
    }
    this.detach = () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      this.channel?.close();
      this.channel = null;
    };
    void this.load();
  }

  stop() {
    this.gen++;
    this.cancelTask();
    this.detach?.();
    this.detach = null;
  }

  private broadcast(msg: Message) {
    try {
      this.channel?.postMessage(msg);
    } catch {
      // A closed channel just means no other tab hears about it.
    }
  }

  private onMessage(msg: Message) {
    if (msg.type === "account-changed") {
      // Another tab linked or unlinked: start over from storage.
      this.gen++;
      this.cancelTask();
      void this.load();
    } else if (msg.type === "synced" && msg.username === this.state.account?.username && !this.task) {
      void this.reloadFromCache(msg.username, this.gen);
    }
  }

  private cancelTask(): Promise<void> {
    const t = this.task;
    this.task = null;
    if (!t) return Promise.resolve();
    t.abort.abort();
    return t.promise;
  }

  // ---- Loading ----

  private async load() {
    const gen = this.gen;
    if (this.scope === null) {
      this.months.clear();
      this.set({ account: null, games: [], lastSyncedAt: null, ready: true, sync: IDLE });
      return;
    }
    let account: LinkedAccount | null;
    try {
      account = parseAccount((await storage().get(ACCOUNT_STORAGE_KEY))?.value);
    } catch (e) {
      console.error(e);
      if (gen === this.gen) {
        this.set({
          ready: true,
          sync: { status: "error", message: "Couldn't load your linked Chess.com account. Reload the page to try again." },
        });
      }
      return;
    }
    if (gen !== this.gen) return;
    if (!account) {
      this.months.clear();
      this.set({ account: null, games: [], lastSyncedAt: null, ready: true, sync: IDLE });
      return;
    }
    if (account.username !== this.state.account?.username) {
      this.months.clear();
      this.dirty = true;
    }
    const meta = await this.readCache(account.username, gen);
    if (gen !== this.gen) return;
    this.set({
      account,
      ready: true,
      sync: IDLE,
      lastSyncedAt: meta?.lastSyncedAt ?? null,
      ...this.takeGames(),
    });
    this.autoSync();
  }

  /** Loads cached months into memory. Returns the cache's meta record. */
  private async readCache(username: string, gen: number): Promise<MetaRecord | null> {
    try {
      const cache = await gamesCache();
      const [meta, records] = await Promise.all([cache.getMeta(username), cache.loadMonths(username)]);
      if (gen !== this.gen) return meta;
      const next = new Map<string, MonthGames>();
      for (const r of records) {
        const have = this.months.get(r.month);
        if (have && have.fetchedAt === r.fetchedAt) {
          next.set(r.month, have);
        } else {
          const games = normalizeMonth(r.games, username);
          next.set(r.month, { fetchedAt: r.fetchedAt, games, sig: signature(games) });
        }
      }
      if (next.size !== this.months.size || [...next].some(([m, v]) => this.months.get(m)?.sig !== v.sig)) {
        this.dirty = true;
      }
      this.months = next;
      return meta;
    } catch (e) {
      console.error("Couldn't read cached games", e);
      return null;
    }
  }

  private async reloadFromCache(username: string, gen: number) {
    const meta = await this.readCache(username, gen);
    if (gen !== this.gen) return;
    this.set({ lastSyncedAt: meta?.lastSyncedAt ?? this.state.lastSyncedAt, ...this.takeGames() });
  }

  /** A `games` patch if the in-memory months changed since the last publish. */
  private takeGames(): Partial<GamesState> {
    if (!this.dirty) return {};
    this.dirty = false;
    this.lastPublishAt = Date.now();
    return { games: flatten(this.months) };
  }

  // ---- Public actions ----

  link = async (input: string): Promise<void> => {
    const username = parseUsername(input);
    const profile = await fetchProfile(username);
    const prev = this.state.account;
    const account: LinkedAccount = {
      source: "chess.com",
      username,
      displayName: displayNameFrom(profile, username),
      avatar: profile.avatar || undefined,
      name: profile.name?.trim() || undefined,
      linkedAt: prev?.username === username ? prev.linkedAt : Date.now(),
    };
    try {
      await storage().set(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
    } catch (e) {
      console.error(e);
      throw new Error("Couldn't save your linked account. Check your connection and try again.");
    }

    const gen = ++this.gen;
    await this.cancelTask();
    if (prev && prev.username !== username) {
      this.months.clear();
      this.dirty = true;
      gamesCache().then((c) => c.clearUser(prev.username)).catch(console.error);
    }
    const meta = await this.readCache(username, gen);
    if (gen !== this.gen) return;
    this.set({
      account,
      ready: true,
      sync: IDLE,
      lastSyncedAt: prev?.username === username ? this.state.lastSyncedAt : meta?.lastSyncedAt ?? null,
      ...this.takeGames(),
    });
    this.broadcast({ type: "account-changed" });
    await this.sync(true);
  };

  unlink = async (): Promise<void> => {
    const prev = this.state.account;
    try {
      await storage().delete(ACCOUNT_STORAGE_KEY);
    } catch (e) {
      console.error(e);
      throw new Error("Couldn't unlink right now. Check your connection and try again.");
    }
    this.gen++;
    const stopped = this.cancelTask();
    this.months.clear();
    this.dirty = false;
    this.set({ account: null, games: [], lastSyncedAt: null, ready: true, sync: IDLE });
    this.broadcast({ type: "account-changed" });
    if (prev) {
      await stopped;
      await gamesCache().then((c) => c.clearUser(prev.username)).catch(console.error);
    }
  };

  refresh = (): Promise<void> => this.sync(true);

  // ---- Sync ----

  private autoSync() {
    const { account, ready, sync, lastSyncedAt } = this.state;
    if (!ready || !account || sync.status === "syncing" || this.task) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (lastSyncedAt && Date.now() - lastSyncedAt < STALE_AFTER_MS) return;
    if (Date.now() - this.lastFailureAt < AUTO_RETRY_COOLDOWN_MS) return;
    void this.sync(false);
  }

  /** Starts a sync, or joins the one already running. Never rejects; failures land in `sync`. */
  private sync(manual: boolean): Promise<void> {
    const account = this.state.account;
    if (!account || !this.state.ready) return Promise.resolve();
    if (this.task && this.task.gen === this.gen) return this.task.promise;

    const gen = this.gen;
    const abort = new AbortController();
    const run = () => this.runSync(account.username, gen, abort.signal, manual);
    // Serialise syncs of one account across tabs, so two tabs never fetch the same months.
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const promise: Promise<void> = (locks
      ? locks.request(`games-sync:${account.username}`, { signal: abort.signal }, () => run())
      : run()
    )
      .then(() => undefined)
      .catch((e) => { if (!isAbortError(e)) console.error(e); })
      .finally(() => { if (this.task?.promise === promise) this.task = null; });
    this.task = { promise, abort, gen };
    return promise;
  }

  private async runSync(username: string, gen: number, signal: AbortSignal, manual: boolean) {
    const live = () => gen === this.gen && !signal.aborted;
    const update = (patch: Partial<GamesState>) => { if (live()) this.set(patch); };
    update({ sync: { status: "syncing", done: 0, total: 0 } });

    let total = 0;
    let fetched = 0;
    let skipped = 0;
    let saveFailed = false;
    const failures: ChessComError[] = [];
    const cache = await gamesCache();
    try {
      // Another tab may have synced while we waited for the lock.
      const meta = await cache.getMeta(username);
      if (!live()) return;
      if (meta && Object.entries(meta.months).some(([m, at]) => this.months.get(m)?.fetchedAt !== at)) {
        await this.readCache(username, gen);
        update(this.takeGames());
      }
      if (!manual && meta?.lastSyncedAt && Date.now() - meta.lastSyncedAt < STALE_AFTER_MS) {
        update({ sync: IDLE, lastSyncedAt: meta.lastSyncedAt });
        return;
      }

      const archives = await fetchArchives(username, { signal });
      if (!live()) return;
      const known = meta?.months ?? {};
      const listed = new Set(archives);
      const gone = Object.keys(known).filter((m) => !listed.has(m));
      if (gone.length) {
        await cache.deleteMonths(username, gone);
        for (const m of gone) this.months.delete(m);
        this.dirty = true;
      }
      const todo = archives.filter((m) => !(m in known) || !isSettled(m, known[m])).reverse();
      total = todo.length;
      update({ sync: { status: "syncing", done: 0, total } });

      let streak = 0;
      for (let i = 0; i < todo.length; i++) {
        const month = todo[i];
        try {
          const raw = await fetchMonth(username, month, { signal });
          if (!live()) return;
          const fetchedAt = Date.now();
          const games = normalizeMonth(raw, username);
          const sig = signature(games);
          if (this.months.get(month)?.sig !== sig) this.dirty = true;
          this.months.set(month, { fetchedAt, games, sig });
          try {
            await cache.putMonth({ username, month, fetchedAt, games: raw });
          } catch (e) {
            console.error(`Couldn't cache ${month}`, e);
            saveFailed = true;
          }
          fetched++;
          streak = 0;
        } catch (e) {
          if (isAbortError(e) || !live()) return;
          failures.push(asChessComError(e));
          streak++;
          const kind = failures[failures.length - 1].kind;
          // Stop early when carrying on would only hit the same wall.
          if (kind === "rate-limited" || kind === "network" || streak >= 2) {
            skipped = todo.length - i - 1;
            break;
          }
        }
        // The first games show at once; after that, at most every PUBLISH_INTERVAL_MS.
        const publish = this.dirty && (this.state.games.length === 0 || Date.now() - this.lastPublishAt >= PUBLISH_INTERVAL_MS);
        update({ sync: { status: "syncing", done: i + 1, total }, ...(publish ? this.takeGames() : {}) });
      }

      if (!live()) return;
      if (failures.length === 0) {
        const now = Date.now();
        try {
          await cache.setLastSynced(username, now);
        } catch (e) {
          console.error(e);
          saveFailed = true;
        }
        update({
          ...this.takeGames(),
          lastSyncedAt: now,
          sync: saveFailed
            ? { status: "error", message: "Your games were imported but couldn't be saved on this device, so they will be fetched again next visit." }
            : IDLE,
        });
      } else {
        this.lastFailureAt = Date.now();
        const missed = failures.length + skipped;
        const reason = failures[failures.length - 1].message;
        update({
          ...this.takeGames(),
          sync: { status: "error", message: `${missed} of ${total} months couldn't be imported. ${reason}${this.keptNote()}` },
        });
      }
      if (fetched > 0) this.broadcast({ type: "synced", username });
    } catch (e) {
      if (isAbortError(e) || !live()) return;
      this.lastFailureAt = Date.now();
      update({
        ...this.takeGames(),
        sync: { status: "error", message: `${asChessComError(e).message}${this.keptNote()}` },
      });
    }
  }

  private keptNote(): string {
    return this.months.size > 0 ? " Games already imported are kept." : "";
  }
}

function asChessComError(e: unknown): ChessComError {
  if (e instanceof ChessComError) return e;
  console.error(e);
  return new ChessComError("Something went wrong while importing your games.", "bad-response");
}
