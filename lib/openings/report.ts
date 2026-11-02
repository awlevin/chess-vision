// The openings report: named openings per colour, leaks, and where the
// player leaves known theory. Pure functions over parsed games and the book.
import type { Color, Outcome } from "@/lib/games";
import type { Book, BookEntry } from "./book";
import type { ParsedGame } from "./parse";
import { formatLine, moveLabel, pct, plural, withArticle } from "./format";
import { addGame, betterChoice, emptyStats, score, shrunkScore, type Stats } from "./stats";

/** Fewest games before an opening can be called a leak. */
export const MIN_OPENING_GAMES = 8;
/** Fewest games at a position before comparing your moves there. */
export const MIN_POSITION_GAMES = 10;
/** Fewest games with each move being compared. */
export const MIN_MOVE_GAMES = 4;
/** How far into the game we look for move-choice leaks. */
export const LEAK_DEPTH = 16;

export interface Classified {
  /** Deepest named position the game reached, and at which ply. */
  named: BookEntry | null;
  namedPly: number;
  /** Index of the first move that left known theory, or null if it never did (within the moves read). */
  exitMove: number | null;
  /** Who left first; "book-ended" when the last move was the end of every named line through it. */
  exitBy: "you" | "opponent" | "book-ended" | null;
}

const classified = new WeakMap<ParsedGame, Classified>();

export function classify(g: ParsedGame, book: Book): Classified {
  const hit = classified.get(g);
  if (hit) return hit;
  let namedPly = -1;
  let exitMove: number | null = null;
  for (let i = 1; i < g.keys.length; i++) {
    if (book.named.has(g.keys[i])) namedPly = i;
    if (exitMove === null && !book.theory.has(g.keys[i])) exitMove = i - 1;
  }
  const mine = (move: number) => (move % 2 === 0) === (g.game.color === "white");
  const out: Classified = {
    named: namedPly > 0 ? book.named.get(g.keys[namedPly])! : null,
    namedPly,
    exitMove,
    exitBy: exitMove === null ? null : !book.continues.has(g.keys[exitMove]) ? "book-ended" : mine(exitMove) ? "you" : "opponent",
  };
  classified.set(g, out);
  return out;
}

export interface OpeningRow {
  /** "Scandinavian Defense" or "Scandinavian Defense: Mieses-Kotroc Variation". */
  name: string;
  family: string;
  variation: string | null;
  eco: string;
  stats: Stats;
  /** Your most common moves to the first position with this name. */
  line: string[];
  /** Up to the last 10 results, oldest first. */
  recent: Outcome[];
  /** Score over the last 10 games minus the score before them, once there are 15+ games. */
  trend: number | null;
  lastPlayed: number;
  /** Variations, for a family row. */
  variations: OpeningRow[];
}

export interface Leak {
  id: string;
  kind: "opening" | "move";
  color: Color;
  title: string;
  detail: string;
  /** The games the leak is about. */
  stats: Stats;
  /** Moves to the opening or position. */
  line: string[];
  /** Roughly the points it costs: games × the score gap. */
  severity: number;
  /** For move leaks: the position, what you usually play there and what scores better. */
  positionKey?: string;
  played?: { san: string; uci: string; stats: Stats };
  better?: { san: string; uci: string; stats: Stats };
}

export interface TheoryExit {
  /** The position where you left theory (before your move). */
  key: string;
  ply: number;
  line: string[];
  san: string;
  uci: string;
  stats: Stats;
  /** The name of the opening up to that point. */
  opening: BookEntry | null;
}

export interface ColorReport {
  color: Color;
  stats: Stats;
  families: OpeningRow[];
  leaks: Leak[];
  exits: TheoryExit[];
  theory: { youLeft: number; opponentLeft: number; bookEnded: number; stayed: number; avgExitMove: number | null };
}

export interface Report {
  white: ColorReport;
  black: ColorReport;
}

// ---- helpers ----

class Counter<T extends string> {
  private m = new Map<T, number>();
  add(k: T) { this.m.set(k, (this.m.get(k) ?? 0) + 1); }
  top(): T | null {
    let best: T | null = null, n = 0;
    for (const [k, c] of this.m) if (c > n) { best = k; n = c; }
    return best;
  }
}

const resultOf = (p: number): Outcome => (p === 1 ? "win" : p === 0 ? "loss" : "draw");

interface RowBuilder {
  name: string;
  family: string;
  variation: string | null;
  eco: string;
  games: ParsedGame[];
  lines: Counter<string>;
  children: Map<string, RowBuilder>;
}

function finishRow(b: RowBuilder): OpeningRow {
  const stats = emptyStats();
  b.games.forEach((g) => addGame(stats, g));
  const pts = b.games.map((g) => g.points);
  const last = pts.slice(-10);
  const before = pts.slice(0, -10);
  const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const line = b.lines.top();
  return {
    name: b.name,
    family: b.family,
    variation: b.variation,
    eco: b.eco,
    stats,
    line: line ? line.split(" ") : [],
    recent: last.map(resultOf),
    trend: pts.length >= 15 ? avg(last) - avg(before) : null,
    lastPlayed: b.games.length ? b.games[b.games.length - 1].game.endTime : 0,
    variations: [...b.children.values()].map(finishRow).sort((a, z) => z.stats.n - a.stats.n),
  };
}

/** First ply at which a game reaches a position named within `family` (or exactly `name`). */
function firstNamed(g: ParsedGame, book: Book, test: (e: BookEntry) => boolean): number {
  for (let i = 1; i < g.keys.length; i++) {
    const e = book.named.get(g.keys[i]);
    if (e && test(e)) return i;
  }
  return -1;
}

const capitalise = (c: Color) => (c === "white" ? "White" : "Black");

// ---- the report ----

function colorReport(all: ParsedGame[], book: Book, color: Color): ColorReport {
  const games = all.filter((g) => g.game.color === color);
  const stats = emptyStats();
  games.forEach((g) => addGame(stats, g));
  const baseline = score(stats);

  // Named openings, by family then variation.
  const families = new Map<string, RowBuilder>();
  const theory = { youLeft: 0, opponentLeft: 0, bookEnded: 0, stayed: 0, avgExitMove: null as number | null };
  let exitMoveSum = 0;
  const exits = new Map<string, { key: string; ply: number; san: string; uci: string; games: ParsedGame[]; paths: Counter<string>; opening: BookEntry | null }>();

  for (const g of games) {
    const c = classify(g, book);
    if (c.named) {
      const { family, variation, name, eco } = c.named;
      let fam = families.get(family);
      if (!fam) families.set(family, (fam = { name: family, family, variation: null, eco, games: [], lines: new Counter(), children: new Map() }));
      fam.games.push(g);
      const fPly = firstNamed(g, book, (e) => e.family === family);
      if (fPly > 0) fam.lines.add(g.sans.slice(0, fPly).join(" "));
      if (fPly > 0 && book.named.get(g.keys[fPly])!.eco < fam.eco) fam.eco = book.named.get(g.keys[fPly])!.eco;
      if (variation) {
        let v = fam.children.get(name);
        if (!v) fam.children.set(name, (v = { name, family, variation, eco, games: [], lines: new Counter(), children: new Map() }));
        v.games.push(g);
        const vPly = firstNamed(g, book, (e) => e.name === name);
        if (vPly > 0) v.lines.add(g.sans.slice(0, vPly).join(" "));
      }
    }

    if (c.exitBy === "you") {
      theory.youLeft++;
      const m = c.exitMove!;
      exitMoveSum += Math.floor(m / 2) + 1;
      const id = `${g.keys[m]}|${g.ucis[m]}`;
      let e = exits.get(id);
      if (!e) {
        const named = firstNamedBefore(g, book, m);
        exits.set(id, (e = { key: g.keys[m], ply: m, san: g.sans[m], uci: g.ucis[m], games: [], paths: new Counter(), opening: named }));
      }
      e.games.push(g);
      e.paths.add(g.sans.slice(0, m).join(" "));
    } else if (c.exitBy === "opponent") theory.opponentLeft++;
    else if (c.exitBy === "book-ended") theory.bookEnded++;
    else theory.stayed++;
  }
  if (theory.youLeft) theory.avgExitMove = exitMoveSum / theory.youLeft;

  const familyRows = [...families.values()].map(finishRow).sort((a, z) => z.stats.n - a.stats.n);

  const exitRows: TheoryExit[] = [...exits.values()]
    .map((e) => {
      const s = emptyStats();
      e.games.forEach((g) => addGame(s, g));
      const path = e.paths.top();
      return { key: e.key, ply: e.ply, line: path ? path.split(" ") : [], san: e.san, uci: e.uci, stats: s, opening: e.opening };
    })
    .sort((a, z) => z.stats.n - a.stats.n || a.ply - z.ply)
    .slice(0, 8);

  return {
    color,
    stats,
    families: familyRows,
    leaks: [...openingLeaks(familyRows, baseline, color), ...moveLeaks(games, color)]
      .sort((a, z) => z.severity - a.severity)
      .slice(0, 8),
    exits: exitRows,
    theory,
  };
}

function firstNamedBefore(g: ParsedGame, book: Book, ply: number): BookEntry | null {
  for (let i = ply; i >= 1; i--) {
    const e = book.named.get(g.keys[i]);
    if (e) return e;
  }
  return null;
}

function openingLeaks(families: OpeningRow[], baseline: number, color: Color): Leak[] {
  const isLeak = (r: OpeningRow, base: number) =>
    r.stats.n >= MIN_OPENING_GAMES && score(r.stats) <= base - 0.1 && shrunkScore(r.stats, base) <= base - 0.05;
  const make = (r: OpeningRow): Leak => {
    const s = score(r.stats);
    const where = r.variation ? `${withArticle(r.family)}, ${r.variation}` : withArticle(r.family);
    const line = r.line.length ? ` (${formatLine(r.line)})` : "";
    return {
      id: `opening:${color}:${r.name}`,
      kind: "opening",
      color,
      title: `In ${where}${line} you score ${pct(s)} in ${plural(r.stats.n, "game")}.`,
      detail: `That's ${Math.round((baseline - s) * 100)} points below your ${pct(baseline)} average as ${capitalise(color)}.`,
      stats: r.stats,
      line: r.line,
      severity: r.stats.n * (baseline - s),
    };
  };
  const out: Leak[] = [];
  for (const f of families) {
    const famLeak = isLeak(f, baseline);
    if (famLeak) out.push(make(f));
    for (const v of f.variations) {
      // A variation of a leaking family only adds something if it is clearly worse still.
      if (isLeak(v, baseline) && (!famLeak || score(v.stats) <= score(f.stats) - 0.1)) out.push(make(v));
    }
  }
  return out;
}

interface PositionAgg {
  key: string;
  ply: number;
  total: Stats;
  moves: Map<string, { san: string; uci: string; stats: Stats }>;
  paths: Counter<string>;
}

/** Positions where it's your move, merged across transpositions. */
export function myPositions(games: ParsedGame[], color: Color, depth = LEAK_DEPTH): Map<string, PositionAgg> {
  const out = new Map<string, PositionAgg>();
  const first = color === "white" ? 0 : 1;
  for (const g of games) {
    if (g.game.color !== color) continue;
    for (let i = first; i < Math.min(depth, g.sans.length); i += 2) {
      const key = g.keys[i];
      let p = out.get(key);
      if (!p) out.set(key, (p = { key, ply: i, total: emptyStats(), moves: new Map(), paths: new Counter() }));
      addGame(p.total, g);
      let m = p.moves.get(g.ucis[i]);
      if (!m) p.moves.set(g.ucis[i], (m = { san: g.sans[i], uci: g.ucis[i], stats: emptyStats() }));
      addGame(m.stats, g);
      p.paths.add(g.sans.slice(0, i).join(" "));
    }
  }
  return out;
}

function moveLeaks(games: ParsedGame[], color: Color): Leak[] {
  const out: Leak[] = [];
  for (const p of myPositions(games, color).values()) {
    if (p.total.n < MIN_POSITION_GAMES) continue;
    const choice = betterChoice([...p.moves.values()], MIN_MOVE_GAMES);
    if (!choice) continue;
    const { usual, better, worst } = choice;
    const gap = score(better.stats) - score(usual.stats);
    const path = p.paths.top();
    const line = path ? path.split(" ") : [];
    const at = line.length ? `After ${formatLine(line)}` : "From the starting position";
    const u = moveLabel(usual.san, p.ply), b = moveLabel(better.san, p.ply);
    out.push({
      id: `move:${color}:${p.key}`,
      kind: "move",
      color,
      title: worst
        ? `${at} you play ${u} most often and score worst with it: ${pct(score(usual.stats))} in ${plural(usual.stats.n, "game")}.`
        : `${at} you usually play ${u} and score ${pct(score(usual.stats))} in ${plural(usual.stats.n, "game")}.`,
      detail: `With ${b} you score ${pct(score(better.stats))} in ${plural(better.stats.n, "game")}.`,
      stats: usual.stats,
      line,
      severity: usual.stats.n * gap,
      positionKey: p.key,
      played: usual,
      better,
    });
  }
  return out;
}

export function buildReport(games: ParsedGame[], book: Book): Report {
  return { white: colorReport(games, book, "white"), black: colorReport(games, book, "black") };
}
