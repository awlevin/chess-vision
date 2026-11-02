// The repertoire the trainer drills, built from the positions you actually
// reach. Positions are merged by key, so transpositions share one card.
//
// A card is a position where it's your move, that you've reached in at least
// MIN_REACH games, and that you can get to by playing your repertoire moves
// against moves your opponents have played. Its move is the one you've
// played most there (games from the last year count double), unless you've
// adopted another one.
import type { Color } from "@/lib/games";
import { FastPosition, START_KEY, fenFromKey, toUci } from "@/lib/chess/fast";
import type { ParsedGame } from "./parse";
import type { CardState, CardStates } from "./srs";
import { addGame, betterChoice, emptyStats, score, shrunkScore, type Stats } from "./stats";

export const REP_DEPTH = 16;
export const MIN_REACH = 3;
const RECENT_S = 365 * 86400;

export interface RepMove {
  san: string;
  uci: string;
  /** Key of the position it leads to. */
  to: string;
  /** Games with this move from this position. */
  n: number;
  /** n, with games from the last year counted twice. */
  weight: number;
  stats: Stats;
}

export interface RepNode {
  key: string;
  ply: number;
  mine: boolean;
  n: number;
  moves: RepMove[];
  paths: Map<string, number>;
}

export interface Graph {
  color: Color;
  nodes: Map<string, RepNode>;
}

export interface Override {
  uci: string;
  san: string;
}
export type Overrides = Record<string, Override>;

export const NO_OVERRIDES: Overrides = {};

export function isOverrides(v: unknown): v is Overrides {
  return !!v && typeof v === "object" && Object.values(v).every((o) => o && typeof o.uci === "string" && typeof o.san === "string");
}

export interface Card {
  key: string;
  ply: number;
  fen: string;
  /** Your most common moves to this position. */
  line: string[];
  /** Games that reached it. */
  n: number;
  /** The move you're drilled on. */
  move: RepMove;
  /** The move you've played most. */
  usual: RepMove;
  adopted: boolean;
  /** Every move you've played here, most played first. */
  played: RepMove[];
  /** A clearly better-scoring move you've played here, if there is one. */
  suggestion: RepMove | null;
}

export interface Repertoire {
  color: Color;
  graph: Graph;
  cards: Map<string, Card>;
  /** Cards by how early and how often they come up. */
  order: Card[];
}

export function buildGraph(games: ParsedGame[], color: Color, nowMs = Date.now()): Graph {
  const nodes = new Map<string, RepNode>();
  const recentSince = nowMs / 1000 - RECENT_S;
  const edgeIndex = new Map<string, RepMove>();
  for (const g of games) {
    if (g.game.color !== color) continue;
    const w = g.game.endTime >= recentSince ? 2 : 1;
    const plies = Math.min(REP_DEPTH, g.sans.length);
    for (let i = 0; i <= plies; i++) {
      const key = g.keys[i];
      let node = nodes.get(key);
      if (!node) {
        const mine = (i % 2 === 0) === (color === "white");
        nodes.set(key, (node = { key, ply: i, mine, n: 0, moves: [], paths: new Map() }));
      }
      node.n++;
      if (i === plies) break;
      const path = g.sans.slice(0, i).join(" ");
      node.paths.set(path, (node.paths.get(path) ?? 0) + 1);
      const id = `${key}|${g.ucis[i]}`;
      let e = edgeIndex.get(id);
      if (!e) {
        edgeIndex.set(id, (e = { san: g.sans[i], uci: g.ucis[i], to: g.keys[i + 1], n: 0, weight: 0, stats: emptyStats() }));
        node.moves.push(e);
      }
      e.n++;
      e.weight += w;
      addGame(e.stats, g);
    }
  }
  for (const node of nodes.values()) node.moves.sort((a, z) => z.weight - a.weight || score(z.stats) - score(a.stats));
  return { color, nodes };
}

function topPath(paths: Map<string, number>): string[] {
  let best = "", n = -1;
  for (const [p, c] of paths) if (c > n) { best = p; n = c; }
  return best ? best.split(" ") : [];
}

export function buildRepertoire(graph: Graph, overrides: Overrides): Repertoire {
  const cards = new Map<string, Card>();
  const seen = new Set<string>();
  const queue = [START_KEY];
  while (queue.length) {
    const key = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = graph.nodes.get(key);
    if (!node) continue;
    if (!node.mine) {
      for (const e of node.moves) queue.push(e.to);
      continue;
    }
    if (node.n < MIN_REACH || node.moves.length === 0 || node.ply >= REP_DEPTH) continue;
    const fen = fenFromKey(key, node.ply);
    const usual = node.moves[0];
    let move = usual;
    const o = overrides[key];
    if (o) {
      const known = node.moves.find((m) => m.uci === o.uci);
      if (known) move = known;
      else {
        const pos = FastPosition.fromFen(fen);
        const played = pos.play(o.san);
        if (played && toUci(played) === o.uci) move = { san: o.san, uci: o.uci, to: pos.key(), n: 0, weight: 0, stats: emptyStats() };
      }
    }
    const choice = betterChoice(node.moves);
    cards.set(key, {
      key,
      ply: node.ply,
      fen,
      line: topPath(node.paths),
      n: node.n,
      move,
      usual,
      adopted: move !== usual,
      played: [...node.moves].sort((a, z) => z.n - a.n),
      suggestion: choice && choice.usual === usual ? choice.better : null,
    });
    queue.push(move.to);
  }
  const order = [...cards.values()].sort((a, z) => a.ply - z.ply || z.n - a.n);
  return { color: graph.color, graph, cards, order };
}

/**
 * Keys of every position from which, following your repertoire and moves
 * your opponents have played, you can reach a card that passes `isTarget`.
 */
export function targetsBelow(rep: Repertoire, isTarget: (card: Card) => boolean): Set<string> {
  const memo = new Map<string, boolean>();
  const visit = (key: string): boolean => {
    const known = memo.get(key);
    if (known !== undefined) return known;
    memo.set(key, false); // guards against repetitions
    const card = rep.cards.get(key);
    let found = false;
    if (card) {
      // Visit the child even when this card is a target, so every node gets an answer.
      const deeper = visit(card.move.to);
      found = isTarget(card) || deeper;
    } else {
      const node = rep.graph.nodes.get(key);
      if (node && !node.mine) for (const e of node.moves) if (visit(e.to)) found = true;
    }
    memo.set(key, found);
    return found;
  };
  visit(START_KEY);
  return new Set([...memo].filter(([, v]) => v).map(([k]) => k));
}

/**
 * Picks the opponent's reply at `key`, weighted by how often opponents
 * played each move against you, among replies that lead to a target.
 * Returns null when no reply does.
 */
export function pickReply(rep: Repertoire, key: string, below: Set<string>, random = Math.random): RepMove | null {
  const node = rep.graph.nodes.get(key);
  if (!node || node.mine) return null;
  const options = node.moves.filter((m) => below.has(m.to));
  const total = options.reduce((a, m) => a + m.n, 0);
  let r = random() * total;
  for (const m of options) {
    r -= m.n;
    if (r < 0) return m;
  }
  return options[options.length - 1] ?? null;
}

/**
 * How much a position is costing you: drill misses, plus the points your
 * games lose after your move there (shrunk, so small samples count less),
 * plus one if a clearly better move exists.
 */
export function leakScore(card: Card, state: CardState | undefined, baseline: number): number {
  const s = card.move.stats;
  const lost = s.n * Math.max(0, baseline - shrunkScore(s, baseline)) / 3;
  return (state?.lapses ?? 0) + lost + (card.suggestion && !card.adopted ? 1 : 0);
}

/** The positions "Fix my leaks" drills: the worst ones, worst first. */
export function leakCards(rep: Repertoire, states: CardStates, baseline: number, max = 10): Card[] {
  return rep.order
    .map((c) => ({ c, s: leakScore(c, states[c.key], baseline) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, z) => z.s - a.s)
    .slice(0, max)
    .map((x) => x.c);
}

/**
 * For drilling one line: true for the position the line reaches and for
 * positions whose usual path starts with it. `sans` is SAN from the start.
 */
export function onLine(sans: string[]): (card: Card) => boolean {
  const pos = FastPosition.start();
  for (const san of sans) if (!pos.play(san)) break;
  const end = pos.key();
  return (card) => card.key === end || (card.line.length >= sans.length && sans.every((m, i) => card.line[i] === m));
}
