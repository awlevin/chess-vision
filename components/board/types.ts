export type BoardColor = "white" | "black";

/** Colour then piece letter, as in "wP" or "bK". */
export type PieceCode = `${"w" | "b"}${"P" | "N" | "B" | "R" | "Q" | "K"}`;

/** Accent for arrows and square markers. */
export type Tone = "info" | "good" | "bad" | "warn";

export interface BoardArrow {
  from: string;
  to: string;
  tone?: Tone;
  /** 0–1: thickness and opacity, e.g. how often a move was played. Default 1. */
  weight?: number;
  /** Accessible description, e.g. "e4, 120 games". */
  label?: string;
}

export interface BoardMarker {
  square: string;
  tone: Tone;
}

export type PromotionPiece = "q" | "r" | "b" | "n";

/** A legal move the user made on the board. */
export interface BoardMove {
  from: string;
  to: string;
  promotion?: PromotionPiece;
  san: string;
  /** "e2e4", "e7e8q". */
  uci: string;
  /** Position after the move. */
  fen: string;
}
