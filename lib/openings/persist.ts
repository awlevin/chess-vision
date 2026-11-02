// Small JSON values kept in window.storage (synced per user in cloud mode,
// localStorage otherwise). Every key starts with "op-".
//
// Each key has one in-memory copy shared by every component that uses it,
// so a change on one page shows everywhere at once; writes are debounced and
// flushed when the page is hidden.
"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { installStorage } from "@/lib/storage-client";

export const STORAGE_KEYS = {
  filters: "op-filters-v1",
  engine: "op-engine-v1",
  cards: (color: "white" | "black") => `op-cards-${color}-v1`,
  repertoire: (color: "white" | "black") => `op-rep-${color}-v1`,
} as const;

interface Entry {
  value: unknown;
  loaded: boolean;
  snapshot: { value: unknown; loaded: boolean };
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  dirty: boolean;
  started: boolean;
  /** Changes made before the stored value was read, applied on top of it. */
  pending: ((current: unknown) => unknown)[];
}

const entries = new Map<string, Entry>();
const WRITE_DELAY = 400;

function entry(key: string): Entry {
  let e = entries.get(key);
  if (!e) {
    e = { value: undefined, loaded: false, snapshot: { value: undefined, loaded: false }, listeners: new Set(), timer: null, dirty: false, started: false, pending: [] };
    entries.set(key, e);
  }
  return e;
}

function emit(e: Entry) {
  e.snapshot = { value: e.value, loaded: e.loaded };
  e.listeners.forEach((l) => l());
}

function flush(key: string) {
  const e = entries.get(key);
  if (!e || !e.dirty) return;
  if (e.timer) clearTimeout(e.timer);
  e.timer = null;
  e.dirty = false;
  window.storage?.set(key, JSON.stringify(e.value)).catch(() => {
    // Keep it in memory; the next change retries.
    e.dirty = true;
  });
}

let flushHooked = false;
function hookFlush() {
  if (flushHooked || typeof window === "undefined") return;
  flushHooked = true;
  const all = () => entries.forEach((_, k) => flush(k));
  window.addEventListener("pagehide", all);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") all();
  });
}

function load(key: string) {
  const e = entry(key);
  if (e.started) return;
  e.started = true;
  installStorage();
  hookFlush();
  const finish = () => {
    e.loaded = true;
    if (e.pending.length) {
      for (const update of e.pending) e.value = update(e.value);
      e.pending = [];
      markDirty(key, e);
    } else emit(e);
  };
  const storage = window.storage;
  if (!storage) return finish();
  storage
    .get(key)
    .then((rec) => {
      if (rec?.value != null) {
        try {
          e.value = JSON.parse(rec.value);
        } catch {
          e.value = undefined;
        }
      }
    })
    .catch(() => {})
    .finally(finish);
}

function markDirty(key: string, e: Entry) {
  e.dirty = true;
  emit(e);
  if (e.timer) clearTimeout(e.timer);
  e.timer = setTimeout(() => flush(key), WRITE_DELAY);
}

const SERVER_SNAPSHOT = { value: undefined, loaded: false };

/**
 * A persisted value. `fallback` must be a stable reference (a module-level
 * constant). `loaded` turns true once storage has been read.
 */
export function usePersistent<T>(
  key: string,
  fallback: T,
  isValid: (v: unknown) => v is T,
): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const subscribe = useCallback(
    (cb: () => void) => {
      const en = entry(key);
      en.listeners.add(cb);
      return () => en.listeners.delete(cb);
    },
    [key],
  );
  const snap = useSyncExternalStore(subscribe, () => entry(key).snapshot, () => SERVER_SNAPSHOT);
  useEffect(() => load(key), [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const update = (current: unknown) => {
        const prev = isValid(current) ? current : fallback;
        return typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      };
      const en = entry(key);
      if (!en.loaded) {
        // Apply once the stored value is in, so an early change (say, adopting
        // a move straight after the page opens) can't wipe what was saved.
        en.pending.push(update);
        load(key);
        return;
      }
      en.value = update(en.value);
      markDirty(key, en);
    },
    [key, fallback, isValid],
  );

  const value = isValid(snap.value) ? snap.value : fallback;
  return [value, set, snap.loaded];
}
