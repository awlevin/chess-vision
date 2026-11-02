// Public entry point for a player's imported games.
//
// CONTRACT (implemented by the account/import work; consumed by features):
//   useGames() → GamesState & { link, unlink, refresh }
// Features must import only from "@/lib/games" and depend only on `Game`.
//
// The store behind it lives in store.ts (sync), cache.ts (IndexedDB) and
// chesscom.ts (API client). The root layout renders <GamesProvider> once,
// so the hook works on every page.
"use client";

export * from "./types";
export { normalizeChessComGame, type ChessComGame } from "./normalize";
export { GamesProvider, useGames, type GamesApi } from "./provider";
export { STALE_AFTER_MS } from "./store";
