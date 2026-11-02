// The explorer's move tree: every game of one colour merged move by move
// from the starting position, capped at EXPLORER_DEPTH plies.
import type { Color } from "@/lib/games";
import { START_KEY } from "@/lib/chess/fast";
import type { ParsedGame } from "./parse";
import { addGame, emptyStats, type Stats } from "./stats";

export const EXPLORER_DEPTH = 16;

export interface TreeNode {
  /** Plies from the start; the root is 0. */
  ply: number;
  /** The move that led here (null at the root). */
  san: string | null;
  uci: string | null;
  /** Position key (FEN without the move counters). */
  key: string;
  stats: Stats;
  /** Most-played first. */
  children: TreeNode[];
  /** Games that reached this node, newest first. */
  games: ParsedGame[];
  parent: TreeNode | null;
}

export function buildTree(games: ParsedGame[], color: Color, depth = EXPLORER_DEPTH): TreeNode {
  const root: TreeNode = { ply: 0, san: null, uci: null, key: START_KEY, stats: emptyStats(), children: [], games: [], parent: null };
  const index = new Map<TreeNode, Map<string, TreeNode>>();
  for (const g of games) {
    if (g.game.color !== color) continue;
    let node = root;
    addGame(node.stats, g);
    node.games.push(g);
    const plies = Math.min(depth, g.sans.length);
    for (let i = 0; i < plies; i++) {
      let kids = index.get(node);
      if (!kids) index.set(node, (kids = new Map()));
      let child = kids.get(g.ucis[i]);
      if (!child) {
        child = { ply: i + 1, san: g.sans[i], uci: g.ucis[i], key: g.keys[i + 1], stats: emptyStats(), children: [], games: [], parent: node };
        kids.set(g.ucis[i], child);
        node.children.push(child);
      }
      node = child;
      addGame(node.stats, g);
      node.games.push(g);
    }
  }
  const finish = (n: TreeNode) => {
    n.children.sort((a, b) => b.stats.n - a.stats.n || b.stats.points / b.stats.n - a.stats.points / a.stats.n);
    // Games arrive oldest first.
    n.games.reverse();
    n.children.forEach(finish);
  };
  finish(root);
  return root;
}

/** Follows a list of UCI moves from the root as far as the tree goes. */
export function walk(root: TreeNode, ucis: string[]): TreeNode {
  let node = root;
  for (const u of ucis) {
    const next = node.children.find((c) => c.uci === u);
    if (!next) break;
    node = next;
  }
  return node;
}

/** The moves from the root to `node`. */
export function pathTo(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  for (let n: TreeNode | null = node; n && n.parent; n = n.parent) out.push(n);
  return out.reverse();
}
