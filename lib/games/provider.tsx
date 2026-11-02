"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GamesStore } from "./store";
import type { GamesState } from "./types";

export interface GamesApi extends GamesState {
  /**
   * Look up a Chess.com username, link it, and import its games. Rejects with
   * a readable message if the user doesn't exist (or Chess.com can't be
   * reached). Resolves once the import finishes; import failures don't
   * reject, they show in `sync`.
   */
  link(username: string): Promise<void>;
  /** Forget the linked account and its cached games on this device. */
  unlink(): Promise<void>;
  /** Fetch anything new since the last sync. Never rejects; failures show in `sync`. */
  refresh(): Promise<void>;
}

const GamesContext = createContext<GamesApi | null>(null);

/**
 * Holds the one games store for the app. Rendered once, in the root layout
 * (via AppProviders), so every page shares the same games and sync.
 *
 * `scope` names whose storage is in use: "local" in local mode, the Clerk
 * user id in cloud mode, null when signed out, and undefined while that is
 * not known yet (nothing loads until it is).
 */
export function GamesProvider({ scope, children }: { scope: string | null | undefined; children: React.ReactNode }) {
  const [store] = useState(() => new GamesStore());
  useEffect(() => {
    if (scope === undefined) return;
    store.start(scope);
    return () => store.stop();
  }, [store, scope]);

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getServerState);
  const api = useMemo<GamesApi>(
    () => ({ ...state, link: store.link, unlink: store.unlink, refresh: store.refresh }),
    [state, store],
  );
  return <GamesContext value={api}>{children}</GamesContext>;
}

/**
 * The linked Chess.com account and its imported games. The object changes
 * identity when any field changes, but `games` keeps its identity until the
 * games themselves change, so it is safe to memoise on.
 */
export function useGames(): GamesApi {
  const api = useContext(GamesContext);
  if (!api) throw new Error("useGames() must be used inside <GamesProvider> (the root layout renders it).");
  return api;
}
