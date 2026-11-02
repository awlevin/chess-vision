import { Chess } from "chess.js";
import { FIXTURE_MONTHS, FIXTURE_USER } from "./chesscom-mock";

// Ground truth computed straight from the raw fixture with chess.js, with no
// app code involved, so the openings tests check the app against an
// independent reading of the same games.

type Raw = {
  pgn: string; rules: string; initial_setup?: string;
  white: { username: string; result: string }; black: { username: string; result: string };
};
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const DRAWS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);

export interface FixtureGame { color: "white" | "black"; score: number; sans: string[] }

export const FIXTURE_GAMES: FixtureGame[] = Object.values(FIXTURE_MONTHS).flat().flatMap((g) => {
  const raw = g as Raw;
  if (raw.rules !== "chess" || (raw.initial_setup && raw.initial_setup !== START)) return [];
  const color = raw.white.username.toLowerCase() === FIXTURE_USER ? "white" : "black";
  const res = raw[color].result;
  const chess = new Chess();
  chess.loadPgn(raw.pgn);
  return [{ color, score: res === "win" ? 1 : DRAWS.has(res) ? 0.5 : 0, sans: chess.history() }];
});

/** Games, and the player's score, after a given move prefix (SAN) as a given colour. */
export function lineStats(color: "white" | "black", prefix: string[]) {
  const games = FIXTURE_GAMES.filter((g) => g.color === color && prefix.every((m, i) => g.sans[i] === m));
  const points = games.reduce((s, g) => s + g.score, 0);
  return { games: games.length, points, pct: games.length ? Math.round((100 * points) / games.length) : 0 };
}

/** Position key: piece placement, side to move, castling, en passant. */
export const epd = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** Every move the player made from this position in the fixture, with counts. */
export function playerMovesFrom(fen: string): Map<string, number> {
  return movesFrom(fen, "player");
}

/** Every move made from this position in the fixture by the player or their opponents. */
export function movesFrom(fen: string, by: "player" | "opponent"): Map<string, number> {
  const want = epd(fen);
  const out = new Map<string, number>();
  for (const g of FIXTURE_GAMES) {
    const chess = new Chess();
    for (let i = 0; i < Math.min(g.sans.length, 30); i++) {
      const mover = chess.turn() === "w" ? "white" : "black";
      if ((mover === g.color) === (by === "player") && epd(chess.fen()) === want) {
        out.set(g.sans[i], (out.get(g.sans[i]) ?? 0) + 1);
      }
      chess.move(g.sans[i]);
    }
  }
  return out;
}
