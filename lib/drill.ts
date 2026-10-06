// Square geometry plus the adaptive picker and per-square stats.
//
// The picker, stats update and requeue rules are a straight port of the
// Sprint drill in mental-math-trainer (components/MentalMathTrainer.jsx),
// with the 64 ordered times-table facts swapped for the 64 board squares.

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type Square = string; // "e4"
export type Orientation = "white" | "black";

export const ALL_SQUARES: Square[] = [];
for (const f of FILES) for (const r of RANKS) ALL_SQUARES.push(`${f}${r}`);

export const fileIndex = (sq: Square) => sq.charCodeAt(0) - 97; // a=0
export const rankIndex = (sq: Square) => Number(sq[1]) - 1; // 1=0
export const isDark = (sq: Square) => (fileIndex(sq) + rankIndex(sq)) % 2 === 0; // a1 is dark

// Rows top-to-bottom as seen from the given side.
export function boardRows(orientation: Orientation): Square[][] {
  const ranks = orientation === "white" ? [...RANKS].reverse() : [...RANKS];
  const files = orientation === "white" ? [...FILES] : [...FILES].reverse();
  return ranks.map((r) => files.map((f) => `${f}${r}`));
}

export const rand = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

// ---- stats ----
export type SquareStat = { seen: number; wrong: number; ewma: number | null };
export type StatMap = Record<Square, SquareStat>;
export type Retry = { key: Square; due: number };

export function recordAttempt(stats: StatMap, sq: Square, correct: boolean, elapsed: number): StatMap {
  const s = stats[sq] || { seen: 0, wrong: 0, ewma: null };
  return {
    ...stats,
    [sq]: {
      seen: s.seen + 1,
      wrong: s.wrong + (correct ? 0 : 1),
      ewma: s.ewma == null ? elapsed : 0.6 * s.ewma + 0.4 * elapsed,
    },
  };
}

export function globalEwma(stats: StatMap): number | null {
  const es = Object.values(stats).map((s) => s.ewma).filter((x): x is number => x != null);
  return es.length ? es.reduce((s, x) => s + x, 0) / es.length : null;
}

// Weighted-sample weight per square: misses, slowness vs. your global
// average, and under-coverage all push a square up; unseen squares start high.
export function squareWeights(stats: StatMap): number[] {
  const avg = globalEwma(stats);
  const seens = ALL_SQUARES.map((k) => stats[k]?.seen || 0);
  const maxSeen = Math.max(...seens);
  return ALL_SQUARES.map((k, i) => {
    const s = stats[k];
    let w: number;
    if (!s) w = 3 + maxSeen * 0.5;
    else {
      w = 1 + 5 * (s.wrong / s.seen);
      if (avg && s.ewma != null && s.ewma > avg) w += Math.min(2.5, ((s.ewma - avg) / avg) * 3);
    }
    if (maxSeen > 0) w += ((maxSeen - seens[i]) / maxSeen) * 2;
    return w;
  });
}

// Picks the next square. Due requeues win; otherwise a weighted draw that
// avoids repeating the previous square. Mutates `retries` (removes the one used).
export function pickSquare(
  stats: StatMap,
  retries: Retry[],
  count: number,
  last: Square | null,
): { square: Square; review: boolean } {
  const dueIdx = retries.findIndex((r) => r.due <= count);
  if (dueIdx !== -1) {
    const square = retries[dueIdx].key;
    retries.splice(dueIdx, 1);
    return { square, review: true };
  }
  const weights = squareWeights(stats);
  const total = weights.reduce((s, x) => s + x, 0);
  let square = ALL_SQUARES[0];
  for (let tries = 0; tries < 4; tries++) {
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < weights.length - 1; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    square = ALL_SQUARES[idx];
    if (square !== last) break;
  }
  const s = stats[square];
  return { square, review: !!s && s.seen > 0 && s.wrong / s.seen > 0.25 };
}

// Miss → back twice (2–4 and 7–10 picks later). Correct but slow (over 1.6x
// the round average, with a floor) → back once, 4–7 later.
export function scheduleRetries(
  retries: Retry[],
  sq: Square,
  correct: boolean,
  elapsed: number,
  count: number,
  roundAvg: number | null,
  slowFloor: number,
) {
  if (!correct) {
    retries.push({ key: sq, due: count + rand(2, 4) });
    retries.push({ key: sq, due: count + rand(7, 10) });
  } else if (elapsed > Math.max(slowFloor, (roundAvg || slowFloor) * 1.6)) {
    retries.push({ key: sq, due: count + rand(4, 7) });
  }
}

export function weakSpots(stats: StatMap, n = 3) {
  const avg = globalEwma(stats);
  return Object.entries(stats)
    .filter(([, s]) => s.seen > 0 && (s.wrong > 0 || (avg && s.ewma != null && s.ewma > avg * 1.3)))
    .map(([k, s]) => ({ k, s, score: (s.wrong / s.seen) * 5 + (s.ewma || 0) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, n);
}
