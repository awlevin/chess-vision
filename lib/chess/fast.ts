// A small, fast SAN replayer for bulk analysis.
//
// chess.js validates every move by generating all legal moves, which costs
// ~90µs a move: 1,500 games × 24 plies would block the page for seconds.
// Recorded games and the opening book are already legal, so this replays
// SAN by finding the one piece that can make the move (checking pins only
// when SAN is ambiguous) and produces the same FEN as chess.js, including
// its rule of only printing an en passant square when the capture is legal.
// Use chess.js wherever a move might be illegal (the interactive board).

const WHITE_CASTLE_K = 1, WHITE_CASTLE_Q = 2, BLACK_CASTLE_K = 4, BLACK_CASTLE_Q = 8;
const FILES = "abcdefgh";
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SAN_RE = /^([NBRQK])?([a-h])?([1-8])?x?([a-h])([1-8])(?:=?([NBRQ]))?$/;

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Square index 0..63 (a1 = 0, h8 = 63) to "e4". */
export const squareName = (i: number) => FILES[i & 7] + ((i >> 3) + 1);
/** "e4" to its index. */
export const squareIndex = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);

export interface FastMove {
  from: number;
  to: number;
  /** Lower-case promotion piece, e.g. "q". */
  promotion?: string;
}

/** A move in long algebraic (UCI) form, e.g. "e2e4", "e7e8q". */
export const toUci = (m: FastMove) => squareName(m.from) + squareName(m.to) + (m.promotion ?? "");

const isWhite = (p: string) => p !== "" && p < "a";

export class FastPosition {
  board: string[];
  white: boolean; // side to move
  castling: number;
  ep: number; // the square a double push skipped, or -1
  halfmove: number;
  fullmove: number;

  private constructor(board: string[], white: boolean, castling: number, ep: number, halfmove: number, fullmove: number) {
    this.board = board;
    this.white = white;
    this.castling = castling;
    this.ep = ep;
    this.halfmove = halfmove;
    this.fullmove = fullmove;
  }

  static start(): FastPosition {
    return FastPosition.fromFen(START_FEN);
  }

  static fromFen(fen: string): FastPosition {
    const [placement, turn = "w", castle = "-", ep = "-", half = "0", full = "1"] = fen.trim().split(/\s+/);
    const board: string[] = new Array(64).fill("");
    const rows = placement.split("/");
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r] ?? "") {
        if (ch >= "1" && ch <= "8") f += Number(ch);
        else board[(7 - r) * 8 + f++] = ch;
      }
    }
    let castling = 0;
    if (castle.includes("K")) castling |= WHITE_CASTLE_K;
    if (castle.includes("Q")) castling |= WHITE_CASTLE_Q;
    if (castle.includes("k")) castling |= BLACK_CASTLE_K;
    if (castle.includes("q")) castling |= BLACK_CASTLE_Q;
    return new FastPosition(board, turn === "w", castling, ep === "-" ? -1 : squareIndex(ep), Number(half) || 0, Number(full) || 1);
  }

  clone(): FastPosition {
    return new FastPosition(this.board.slice(), this.white, this.castling, this.ep, this.halfmove, this.fullmove);
  }

  /** True if `sq` is attacked by the given side. */
  attacked(sq: number, byWhite: boolean): boolean {
    const b = this.board;
    const f0 = sq & 7, r0 = sq >> 3;
    const own = (p: string, t: string) => p === (byWhite ? t : t.toLowerCase());
    // Pawns attack diagonally forward, so look one rank behind `sq` from the attacker's side.
    const pr = byWhite ? r0 - 1 : r0 + 1;
    if (pr >= 0 && pr < 8) {
      if (f0 > 0 && own(b[pr * 8 + f0 - 1], "P")) return true;
      if (f0 < 7 && own(b[pr * 8 + f0 + 1], "P")) return true;
    }
    for (const [df, dr] of KNIGHT) {
      const f = f0 + df, r = r0 + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8 && own(b[r * 8 + f], "N")) return true;
    }
    for (const [df, dr] of KING) {
      const f = f0 + df, r = r0 + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8 && own(b[r * 8 + f], "K")) return true;
    }
    for (const [dirs, a, c] of [[DIAG, "B", "Q"], [ORTHO, "R", "Q"]] as const) {
      for (const [df, dr] of dirs) {
        let f = f0 + df, r = r0 + dr;
        while (f >= 0 && f < 8 && r >= 0 && r < 8) {
          const p = b[r * 8 + f];
          if (p !== "") {
            if (own(p, a) || own(p, c)) return true;
            break;
          }
          f += df; r += dr;
        }
      }
    }
    return false;
  }

  private kingSquare(white: boolean): number {
    return this.board.indexOf(white ? "K" : "k");
  }

  private reaches(from: number, to: number, type: string): boolean {
    const df = (to & 7) - (from & 7), dr = (to >> 3) - (from >> 3);
    const adf = Math.abs(df), adr = Math.abs(dr);
    if (type === "N") return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
    if (type === "K") return adf <= 1 && adr <= 1 && (adf | adr) !== 0;
    const diag = adf === adr && adf !== 0, ortho = (df === 0) !== (dr === 0);
    if (type === "B" ? !diag : type === "R" ? !ortho : !(diag || ortho)) return false;
    const step = Math.sign(dr) * 8 + Math.sign(df);
    for (let s = from + step; s !== to; s += step) if (this.board[s] !== "") return false;
    return true;
  }

  /** Applies a move the caller knows is legal; no checks. */
  private apply(m: FastMove): void {
    const b = this.board;
    const piece = b[m.from];
    const captured = b[m.to];
    const pawn = piece === "P" || piece === "p";
    const dir = this.white ? 8 : -8;
    if (pawn && m.to === this.ep && captured === "") b[m.to - dir] = "";
    if ((piece === "K" || piece === "k") && Math.abs(m.to - m.from) === 2) {
      // Castling: move the rook too.
      const rank = m.from & ~7;
      const kingSide = m.to > m.from;
      const rookFrom = rank + (kingSide ? 7 : 0), rookTo = rank + (kingSide ? 5 : 3);
      b[rookTo] = b[rookFrom];
      b[rookFrom] = "";
    }
    b[m.to] = m.promotion ? (this.white ? m.promotion.toUpperCase() : m.promotion) : piece;
    b[m.from] = "";

    if (piece === "K") this.castling &= ~(WHITE_CASTLE_K | WHITE_CASTLE_Q);
    if (piece === "k") this.castling &= ~(BLACK_CASTLE_K | BLACK_CASTLE_Q);
    for (const sq of [m.from, m.to]) {
      if (sq === 0) this.castling &= ~WHITE_CASTLE_Q;
      else if (sq === 7) this.castling &= ~WHITE_CASTLE_K;
      else if (sq === 56) this.castling &= ~BLACK_CASTLE_Q;
      else if (sq === 63) this.castling &= ~BLACK_CASTLE_K;
    }
    this.ep = pawn && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;
    this.halfmove = pawn || captured !== "" ? 0 : this.halfmove + 1;
    if (!this.white) this.fullmove++;
    this.white = !this.white;
  }

  private leavesKingSafe(m: FastMove): boolean {
    const next = this.clone();
    next.apply(m);
    return !next.attacked(next.kingSquare(this.white), !this.white);
  }

  /**
   * Plays a SAN move ("Nf3", "exd5", "O-O", "e8=Q+") and returns it, or
   * null if no piece can make it (the position is left unchanged).
   */
  play(san: string): FastMove | null {
    const s = san.replace(/[+#?!]+$/, "").replace(/e\.p\.$/, "").trim();
    const rank = this.white ? 0 : 56;
    if (s === "O-O" || s === "0-0" || s === "O-O-O" || s === "0-0-0") {
      const k = this.white ? "K" : "k";
      if (this.board[rank + 4] !== k) return null;
      const m = { from: rank + 4, to: rank + (s.length > 3 ? 2 : 6) };
      this.apply(m);
      return m;
    }
    const match = SAN_RE.exec(s);
    if (!match) return null;
    const [, type, fromFile, fromRank, toFile, toRank, promo] = match;
    const to = (toRank.charCodeAt(0) - 49) * 8 + (toFile.charCodeAt(0) - 97);
    const b = this.board;
    if (b[to] !== "" && isWhite(b[to]) === this.white) return null;

    if (!type) {
      const pawn = this.white ? "P" : "p";
      const dir = this.white ? 8 : -8;
      let from = -1;
      if (fromFile && fromFile !== toFile) {
        from = to - dir + (fromFile.charCodeAt(0) - 97) - (to & 7);
        if (b[to] === "" && to !== this.ep) return null;
      } else if (b[to] === "") {
        if (b[to - dir] === pawn) from = to - dir;
        else if (b[to - dir] === "" && b[to - 2 * dir] === pawn && (to >> 3) === (this.white ? 3 : 4)) from = to - 2 * dir;
      }
      if (from < 0 || from > 63 || b[from] !== pawn) return null;
      const m: FastMove = { from, to };
      const lastRank = this.white ? 7 : 0;
      if ((to >> 3) === lastRank) m.promotion = (promo ?? "Q").toLowerCase();
      this.apply(m);
      return m;
    }

    const piece = this.white ? type : type.toLowerCase();
    const candidates: number[] = [];
    for (let sq = 0; sq < 64; sq++) {
      if (b[sq] !== piece) continue;
      if (fromFile && FILES[sq & 7] !== fromFile) continue;
      if (fromRank && (sq >> 3) + 1 !== Number(fromRank)) continue;
      if (this.reaches(sq, to, type)) candidates.push(sq);
    }
    const legal = candidates.length > 1 ? candidates.filter((from) => this.leavesKingSafe({ from, to })) : candidates;
    if (legal.length !== 1) return null;
    const m = { from: legal[0], to };
    this.apply(m);
    return m;
  }

  private placement(): string {
    let out = "";
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 8 + f];
        if (p === "") empty++;
        else {
          if (empty) out += empty;
          empty = 0;
          out += p;
        }
      }
      if (empty) out += empty;
      if (r) out += "/";
    }
    return out;
  }

  /** The en passant square chess.js would print: only when a capture is legal. */
  private legalEp(): string {
    if (this.ep < 0) return "-";
    const pawn = this.white ? "P" : "p";
    const pushed = this.ep + (this.white ? -8 : 8);
    for (const df of [-1, 1]) {
      const f = (pushed & 7) + df;
      if (f < 0 || f > 7) continue;
      const from = (pushed & ~7) + f;
      if (this.board[from] === pawn && this.leavesKingSafe({ from, to: this.ep })) return squareName(this.ep);
    }
    return "-";
  }

  /** The first four FEN fields: identifies a position for transpositions. */
  key(): string {
    let c = "";
    if (this.castling & WHITE_CASTLE_K) c += "K";
    if (this.castling & WHITE_CASTLE_Q) c += "Q";
    if (this.castling & BLACK_CASTLE_K) c += "k";
    if (this.castling & BLACK_CASTLE_Q) c += "q";
    return `${this.placement()} ${this.white ? "w" : "b"} ${c || "-"} ${this.legalEp()}`;
  }

  fen(): string {
    return `${this.key()} ${this.halfmove} ${this.fullmove}`;
  }
}

/** A full FEN from a position key and the ply count (halfmove clock unknown, so 0). */
export const fenFromKey = (key: string, ply: number) => `${key} 0 ${Math.floor(ply / 2) + 1}`;

export const START_KEY = START_FEN.split(" ").slice(0, 4).join(" ");
