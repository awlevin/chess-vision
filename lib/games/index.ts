// Public entry point for a player's imported games.
//
// CONTRACT (implemented by the account/import work; consumed by features):
//   useGames() → GamesState & { link, unlink, refresh }
// Features must import only from "@/lib/games" and depend only on `Game`.
//
// This file is currently a stub so features can compile against the contract.
"use client";

import type { GamesState } from "./types";

export * from "./types";
export { normalizeChessComGame, type ChessComGame } from "./normalize";

export interface GamesApi extends GamesState {
  /** Look up a Chess.com username, link it, and import its games. Rejects with a readable message if the user doesn't exist. */
  link(username: string): Promise<void>;
  /** Forget the linked account and its cached games on this device. */
  unlink(): Promise<void>;
  /** Fetch anything new since the last sync. */
  refresh(): Promise<void>;
}

export function useGames(): GamesApi {
  return {
    account: null,
    ready: true,
    games: [],
    sync: { status: "idle" },
    lastSyncedAt: null,
    link: async () => { throw new Error("Not implemented yet"); },
    unlink: async () => {},
    refresh: async () => {},
  };
}
