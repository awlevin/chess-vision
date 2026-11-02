import type { Color, TimeClass } from "@/lib/games";
import type { ParsedGame } from "./parse";

/** Results from the player's side. */
export interface Stats {
  n: number;
  w: number;
  d: number;
  l: number;
  /** w + d/2. */
  points: number;
}

export const emptyStats = (): Stats => ({ n: 0, w: 0, d: 0, l: 0, points: 0 });

export function addGame(s: Stats, g: ParsedGame): void {
  s.n++;
  s.points += g.points;
  if (g.points === 1) s.w++;
  else if (g.points === 0) s.l++;
  else s.d++;
}

export const score = (s: Stats) => (s.n ? s.points / s.n : 0);

/**
 * Score pulled towards `prior` as if we had also seen `k` games at the prior.
 * Keeps a 3-game streak from looking like a 100% opening.
 */
export const shrunkScore = (s: Stats, prior: number, k = 6) => (s.points + prior * k) / (s.n + k);

/**
 * Among the moves played in one position, finds when the most-played move
 * clearly scores worse than an alternative: a raw gap of 15+ points and
 * still 6+ after shrinking both towards the position's score, with at least
 * `minGames` games each.
 */
export function betterChoice<T extends { stats: Stats }>(moves: T[], minGames = 4): { usual: T; better: T; worst: boolean } | null {
  const ranked = moves.filter((m) => m.stats.n >= minGames).sort((a, z) => z.stats.n - a.stats.n);
  if (ranked.length < 2) return null;
  const total = emptyStats();
  for (const m of moves) {
    total.n += m.stats.n;
    total.points += m.stats.points;
  }
  const prior = score(total);
  const [usual, ...others] = ranked;
  const better = others.reduce((a, m) => (shrunkScore(m.stats, prior) > shrunkScore(a.stats, prior) ? m : a));
  // With a tie there is no "usual" move to call out.
  if (better.stats.n >= usual.stats.n) return null;
  if (score(better.stats) - score(usual.stats) < 0.15) return null;
  if (shrunkScore(better.stats, prior) - shrunkScore(usual.stats, prior) < 0.06) return null;
  const worst = others.every((m) => score(m.stats) > score(usual.stats));
  return { usual, better, worst };
}

export const opposite =(c: Color): Color => (c === "white" ? "black" : "white");

// ---- filters shared by the report and the explorer ----

export type Period = "30" | "90" | "365" | "all";

export interface Filters {
  timeClass: TimeClass | "all";
  period: Period;
  ratedOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = { timeClass: "all", period: "all", ratedOnly: false };

export const PERIODS: { value: Period; label: string }[] = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
  { value: "all", label: "All time" },
];

export const TIME_CLASSES: { value: Filters["timeClass"]; label: string }[] = [
  { value: "all", label: "All time controls" },
  { value: "bullet", label: "Bullet" },
  { value: "blitz", label: "Blitz" },
  { value: "rapid", label: "Rapid" },
  { value: "daily", label: "Daily" },
];

export function applyFilters(games: ParsedGame[], f: Filters, nowMs = Date.now()): ParsedGame[] {
  const since = f.period === "all" ? -Infinity : nowMs / 1000 - Number(f.period) * 86400;
  return games.filter(
    ({ game }) =>
      (f.timeClass === "all" || game.timeClass === f.timeClass) &&
      (!f.ratedOnly || game.rated) &&
      game.endTime >= since,
  );
}

export function isFilters(v: unknown): v is Filters {
  if (!v || typeof v !== "object") return false;
  const f = v as Filters;
  return TIME_CLASSES.some((t) => t.value === f.timeClass) && PERIODS.some((p) => p.value === f.period) && typeof f.ratedOnly === "boolean";
}
