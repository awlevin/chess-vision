// The Vision drills: the registry of drills and pieces, the per-drill stats
// keys, and the small set of viewer preferences.
import type { Orientation, Piece, Square } from "@/lib/drill";

export const ROUND_LEN = 20;
/** Seconds. A correct answer slower than this (and 1.6x the round average) is requeued. */
export const SLOW_FLOOR = 2;
/** How long a correct answer glows before the next prompt appears. */
export const FLASH_MS = 280;

export type Mode = "find" | "line" | "name" | "tour";
/** `piece` is set only for the tour drill, which keeps stats per piece. */
export type DrillConfig = { mode: Mode; orientation: Orientation; piece: Piece | null; storageKey: string };
export type Attempt = { sq: Square; correct: boolean; time: number; given: Square | null };
/** One finished round, as stored in `history`. Keep this shape: it is persisted. */
export type RoundSummary = { avg: number; acc: number; total: number };
export type Phase = "ready" | "solve" | "flash" | "wrongpause" | "roundend";
/** Which edge labels the board shows: files (a–h) along the bottom, ranks (1–8) up the left. */
export type Labels = { files: boolean; ranks: boolean };

export const DRILLS: { mode: Mode; title: string; sub: string; units: string }[] = [
  { mode: "find", title: "Find the square", sub: "Tap the square that's named", units: "squares" },
  { mode: "line", title: "Name the file or rank", sub: "A line lights up. Name it", units: "lines" },
  { mode: "name", title: "Name the square", sub: "A knight lands. Name its square", units: "squares" },
  { mode: "tour", title: "Follow the piece", sub: "Name each square it hops to", units: "moves" },
];
export const drillFor = (mode: Mode) => DRILLS.find((d) => d.mode === mode)!;

export const PIECES: { piece: Piece; name: string; code: "wN" | "wB" | "wR" | "wQ" }[] = [
  { piece: "knight", name: "Knight", code: "wN" },
  { piece: "bishop", name: "Bishop", code: "wB" },
  { piece: "rook", name: "Rook", code: "wR" },
  { piece: "queen", name: "Queen", code: "wQ" },
];
export const pieceFor = (piece: Piece) => PIECES.find((p) => p.piece === piece)!;
export const titleFor = (mode: Mode, piece: Piece | null) =>
  mode === "tour" && piece ? `Follow the ${pieceFor(piece).name.toLowerCase()}` : drillFor(mode).title;

export const MODES = DRILLS.map((d) => d.mode);
export const SIDES: readonly Orientation[] = ["white", "black"];

// Each mode and side keeps its own stats: finding e4 as Black is a different
// skill from finding it as White. These keys are what users' stats are saved
// under, so they must not change.
export const CONFIGS: DrillConfig[] = MODES.flatMap((mode) =>
  (mode === "tour" ? PIECES.map((p) => p.piece) : [null]).flatMap((piece) =>
    SIDES.map((orientation) => ({
      mode,
      orientation,
      piece,
      storageKey: `cv-${mode}${piece ? `-${piece}` : ""}-${orientation}-v1`,
    })),
  ),
);

// ---- viewer preferences (this browser only) ----
export type Prefs = { mode: Mode; side: Orientation; piece: Piece; labels: Labels; sound: boolean };
const PREFS_KEY = "cv:prefs";
export const DEFAULT_PREFS: Prefs = {
  mode: "find",
  side: "white",
  piece: "knight",
  labels: { files: false, ranks: false },
  sound: true,
};

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;

export function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}");
    // Older prefs stored one activeId like "find-black", and one `coords`
    // switch for both edges.
    const [oldMode, oldSide] = typeof p.activeId === "string" ? p.activeId.split("-") : [];
    return {
      mode: oneOf(p.mode ?? oldMode, MODES, DEFAULT_PREFS.mode),
      side: oneOf(p.side ?? oldSide, SIDES, DEFAULT_PREFS.side),
      piece: oneOf(p.piece, PIECES.map((x) => x.piece), DEFAULT_PREFS.piece),
      labels: { files: !!(p.labels?.files ?? p.coords), ranks: !!(p.labels?.ranks ?? p.coords) },
      sound: p.sound !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}
