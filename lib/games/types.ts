// The shared contract between the Chess.com import (lib/games, /account) and
// every feature that analyses a player's games (openings, and later others).
// Features consume `Game`, never raw Chess.com JSON, so the import can change
// (or gain other sources, e.g. Lichess) without touching them.

export type Color = "white" | "black";
export type Outcome = "win" | "loss" | "draw";
export type TimeClass = "bullet" | "blitz" | "rapid" | "daily";

export interface Game {
  /** Stable id (the Chess.com game uuid). */
  id: string;
  source: "chess.com";
  /** Link to the game on the source site. */
  url: string;
  /** Unix seconds when the game ended. */
  endTime: number;
  timeClass: TimeClass;
  /** Raw time control, e.g. "600", "180+2", "1/86400". */
  timeControl: string;
  rated: boolean;
  /** "chess" for standard games; variants such as "chess960" are kept but flagged. */
  variant: string;
  /** The linked player's colour in this game. */
  color: Color;
  /** Result from the linked player's point of view. */
  outcome: Outcome;
  /** The source's raw result code for the linked player (win, resigned, timeout, agreed, ...). */
  resultCode: string;
  player: { username: string; rating: number };
  opponent: { username: string; rating: number };
  /** ECO code from the PGN header, when present (e.g. "B01"). */
  eco?: string;
  /** Opening name as the source labels it (e.g. "Scandinavian Defense Mieses Kotroc Variation"). */
  openingName?: string;
  /** Full PGN, including clock comments. */
  pgn: string;
  /** Starting FEN when the game did not start from the standard position. */
  initialFen?: string;
  /** Accuracy scores when the source has analysed the game. */
  accuracy?: { player: number; opponent: number };
}

export interface LinkedAccount {
  source: "chess.com";
  /** Lower-cased username as the API expects it. */
  username: string;
  /** Display-cased username from the profile. */
  displayName: string;
  avatar?: string;
  linkedAt: number;
}

export type SyncState =
  | { status: "idle" }
  | { status: "syncing"; done: number; total: number }
  | { status: "error"; message: string };

export interface GamesState {
  /** null until storage has been read; then the account or none. */
  account: LinkedAccount | null;
  /** True once the linked account and any cached games have been loaded. */
  ready: boolean;
  /** Every imported game for the linked account, oldest first. */
  games: Game[];
  sync: SyncState;
  /** Unix ms of the last completed sync, if any. */
  lastSyncedAt: number | null;
}
