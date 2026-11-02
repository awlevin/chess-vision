// Converts one game from the Chess.com published-data API
// (https://api.chess.com/pub/player/{user}/games/{yyyy}/{mm}) into our `Game`.
import type { Game, Outcome, TimeClass } from "./types";

/** The subset of a Chess.com archive game we read. */
export interface ChessComGame {
  uuid: string;
  url: string;
  pgn?: string;
  end_time: number;
  time_class: string;
  time_control: string;
  rated: boolean;
  rules: string;
  initial_setup?: string;
  eco?: string;
  accuracies?: { white: number; black: number };
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

const STANDARD_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const DRAW_CODES = new Set([
  "agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient",
]);
const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "daily"];

function header(pgn: string, name: string): string | undefined {
  const m = pgn.match(new RegExp(`^\\[${name} "([^"]*)"\\]`, "m"));
  return m ? m[1] : undefined;
}

/** "https://www.chess.com/openings/Scandinavian-Defense-Mieses-Kotroc-Variation-3.Nc3" → readable name. */
function openingNameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const slug = url.split("/openings/")[1];
  if (!slug) return undefined;
  // Drop a trailing move list such as "...-3.Nc3-Nf6" and turn dashes into spaces.
  const name = decodeURIComponent(slug).replace(/-\d+\..*$/, "").replace(/-/g, " ").trim();
  return name || undefined;
}

/**
 * Returns null for games that cannot be attributed to `username` or have no
 * moves to analyse (e.g. aborted games without a PGN).
 */
export function normalizeChessComGame(raw: ChessComGame, username: string): Game | null {
  const me = username.toLowerCase();
  const color = raw.white.username.toLowerCase() === me ? "white"
    : raw.black.username.toLowerCase() === me ? "black" : null;
  if (!color || !raw.pgn) return null;
  const player = raw[color];
  const opponent = raw[color === "white" ? "black" : "white"];

  const outcome: Outcome = player.result === "win" ? "win"
    : DRAW_CODES.has(player.result) ? "draw" : "loss";
  const timeClass = (TIME_CLASSES as string[]).includes(raw.time_class)
    ? (raw.time_class as TimeClass) : "daily";

  return {
    id: raw.uuid,
    source: "chess.com",
    url: raw.url,
    endTime: raw.end_time,
    timeClass,
    timeControl: raw.time_control,
    rated: raw.rated,
    variant: raw.rules,
    color,
    outcome,
    resultCode: player.result,
    player: { username: player.username, rating: player.rating },
    opponent: { username: opponent.username, rating: opponent.rating },
    eco: header(raw.pgn, "ECO"),
    openingName: openingNameFromUrl(header(raw.pgn, "ECOUrl") ?? raw.eco),
    pgn: raw.pgn,
    initialFen: raw.initial_setup && raw.initial_setup !== STANDARD_START ? raw.initial_setup : undefined,
    accuracy: raw.accuracies
      ? { player: raw.accuracies[color], opponent: raw.accuracies[color === "white" ? "black" : "white"] }
      : undefined,
  };
}
