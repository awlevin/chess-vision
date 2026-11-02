// The bundled opening book: every named line in the Lichess chess-openings
// dataset (CC0), indexed by position so transpositions are recognised.
//
// book-data.json is ~50 KB gzipped and loaded on demand. Building the index
// replays ~9k unique book plies with the fast replayer (a few ms).
import { Chess } from "chess.js";
import { FastPosition, START_KEY } from "@/lib/chess/fast";

export interface BookEntry {
  eco: string;
  /** Full name, e.g. "Scandinavian Defense: Mieses-Kotroc Variation". */
  name: string;
  /** "Scandinavian Defense". */
  family: string;
  /** "Mieses-Kotroc Variation", or null for the family's main position. */
  variation: string | null;
  /** The book's SAN line to this position. */
  line: string[];
}

export interface Book {
  /** Position key → the named opening at exactly that position. */
  named: Map<string, BookEntry>;
  /** Every position on any named line ("known theory"). */
  theory: Set<string>;
  /** How many named lines pass through each theory position: a rough measure of how main a line is. */
  lines: Map<string, number>;
  /** Theory positions some named line continues from. Elsewhere the book has simply run out. */
  continues: Set<string>;
  /** Number of named lines. */
  size: number;
}

type Row = [eco: string, name: string, sans: string];

export function splitName(name: string): { family: string; variation: string | null } {
  const i = name.indexOf(": ");
  return i < 0 ? { family: name, variation: null } : { family: name.slice(0, i), variation: name.slice(i + 2) };
}

export function buildBook(rows: Row[]): Book {
  const named = new Map<string, BookEntry>();
  const theory = new Set<string>([START_KEY]);
  const lines = new Map<string, number>();
  const continues = new Set<string>();
  // Book lines share long prefixes; replay each distinct prefix once.
  const prefixKeys = new Map<string, string>([["", START_KEY]]);
  for (const [eco, name, sans] of rows) {
    const moves = sans.split(" ");
    let prefix = "";
    let pos: FastPosition | null = null;
    let key = START_KEY;
    lines.set(key, (lines.get(key) ?? 0) + 1);
    for (let i = 0; i < moves.length; i++) {
      continues.add(key);
      const next = prefix ? `${prefix} ${moves[i]}` : moves[i];
      const known = prefixKeys.get(next);
      if (known) {
        key = known;
        pos = null;
      } else {
        pos ??= FastPosition.fromFen(`${key} 0 1`);
        if (!pos.play(moves[i])) break;
        key = pos.key();
        prefixKeys.set(next, key);
        theory.add(key);
      }
      lines.set(key, (lines.get(key) ?? 0) + 1);
      prefix = next;
    }
    // Several lines can name one position (transpositions); keep the shortest line's name.
    const existing = named.get(key);
    if (!existing || existing.line.length > moves.length) {
      named.set(key, { eco, name, ...splitName(name), line: moves });
    }
  }
  return { named, theory, lines, continues, size: rows.length };
}

let loading: Promise<Book> | null = null;

/** Loads and indexes the book once per page load. */
export function loadBook(): Promise<Book> {
  loading ??= import("./book-data.json").then((m) => buildBook((m.default ?? m) as unknown as Row[]));
  return loading;
}

/** Legal moves from `fen` that stay on a named book line, as SAN, most-branching lines first. */
export function bookMoves(book: Book, fen: string): string[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }
  const out: { san: string; weight: number }[] = [];
  for (const san of chess.moves()) {
    const pos = FastPosition.fromFen(fen);
    if (!pos.play(san)) continue;
    const key = pos.key();
    if (book.theory.has(key)) out.push({ san, weight: book.lines.get(key) ?? 0 });
  }
  return out.sort((a, z) => z.weight - a.weight).map((m) => m.san);
}

/** The deepest named opening along a sequence of position keys (index into keys), or -1. */
export function deepestNamed(book: Book, keys: string[], upTo = keys.length - 1): number {
  for (let i = Math.min(upTo, keys.length - 1); i >= 1; i--) if (book.named.has(keys[i])) return i;
  return -1;
}
