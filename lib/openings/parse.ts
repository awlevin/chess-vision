// Turns imported games into the opening data every view uses: the first
// MAX_PLY moves, as SAN and UCI, plus the position key after each one.
import type { Game } from "@/lib/games";
import { FastPosition, START_KEY, toUci } from "@/lib/chess/fast";
import { pgnMoves } from "@/lib/chess/pgn";

/** How deep we read each game. Deep enough to see most players leave book. */
export const MAX_PLY = 24;

export interface ParsedGame {
  game: Game;
  /** SAN of the first plies (at most MAX_PLY). */
  sans: string[];
  ucis: string[];
  /** keys[i] is the position after i plies; keys[0] is the start. */
  keys: string[];
  /** 1 for a win, 0.5 for a draw, 0 for a loss, from the player's side. */
  points: number;
}

const cache = new Map<string, ParsedGame | null>();

/** Standard chess from the normal starting position: the only games openings can use. */
export const isStandard = (g: Game) => g.variant === "chess" && !g.initialFen;

export function parseGame(game: Game): ParsedGame | null {
  const hit = cache.get(game.id);
  if (hit !== undefined && (hit === null || hit.game.pgn === game.pgn)) {
    if (hit && hit.game !== game) hit.game = game;
    return hit;
  }
  let parsed: ParsedGame | null = null;
  if (isStandard(game)) {
    const pos = FastPosition.start();
    const sans: string[] = [], ucis: string[] = [], keys: string[] = [START_KEY];
    for (const san of pgnMoves(game.pgn, MAX_PLY)) {
      const m = pos.play(san);
      if (!m) break;
      sans.push(san.replace(/[?!]+$/, ""));
      ucis.push(toUci(m));
      keys.push(pos.key());
    }
    if (sans.length > 0) {
      parsed = { game, sans, ucis, keys, points: game.outcome === "win" ? 1 : game.outcome === "draw" ? 0.5 : 0 };
    }
  }
  cache.set(game.id, parsed);
  return parsed;
}

/**
 * Parses games in slices so a big import never blocks the page for long.
 * Already-parsed games come from the cache, so revisits are instant.
 */
export async function parseGames(games: Game[], onProgress?: (done: number) => void, signal?: { cancelled: boolean }): Promise<ParsedGame[]> {
  const out: ParsedGame[] = [];
  let sliceStart = performance.now();
  for (let i = 0; i < games.length; i++) {
    const p = parseGame(games[i]);
    if (p) out.push(p);
    if (performance.now() - sliceStart > 12) {
      onProgress?.(i + 1);
      await new Promise((r) => setTimeout(r, 0));
      if (signal?.cancelled) return out;
      sliceStart = performance.now();
    }
  }
  onProgress?.(games.length);
  return out;
}
