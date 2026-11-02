"use client";

// A reusable interactive chessboard.
//
// It is controlled: it always shows `fen`, and a move the user makes is
// reported through `onMove` for the parent to accept (by passing the new
// FEN) or ignore. chess.js supplies legal moves, so only legal moves can be
// made. Moves can be made by click-click, drag-and-drop (mouse, touch and
// pen, via pointer events) or the keyboard (arrow keys to move between
// squares, Enter or Space to pick up and put down).
//
// It sits in a wooden frame with a faint grain. Pieces slide in for the last
// move; a capture's victim fades under the slider, and a castling rook slides
// too. `effect` plays a one-off brass glow on a square, or a clay flash with a
// small shake of the board. `onSwipe` reports horizontal swipes that don't
// start on a movable piece. Motion is skipped under prefers-reduced-motion.
//
// Test hooks: the root has data-fen, data-orientation and data-turn; each
// square has data-square and, when occupied, data-piece ("wP", "bK", ...),
// plus data-selected, data-target, data-last, data-marker and data-check.
// Arrows are <g data-arrow="e2e4">.
import { Chess, type Move } from "chess.js";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import styles from "./Chessboard.module.css";
import { PieceSvg } from "./pieces";
import type { BoardArrow, BoardColor, BoardMarker, BoardMove, PieceCode, PromotionPiece } from "./types";

export interface ChessboardProps {
  /** The position to show. */
  fen: string;
  /** Which side is at the bottom. Default white. */
  orientation?: BoardColor;
  /**
   * Who may move pieces: true for whichever side is to move, a colour for
   * only that side (when it is to move), false for nobody. Default false.
   * Moves are only possible when `onMove` is set.
   */
  interactive?: boolean | BoardColor;
  /** Called with each legal move the user makes. */
  onMove?: (move: BoardMove) => void;
  /** Highlights the squares of the previous move and slides the piece in. */
  lastMove?: { from: string; to: string } | null;
  arrows?: BoardArrow[];
  markers?: BoardMarker[];
  /** File letters and rank numbers along the edges. Default true. */
  coordinates?: boolean;
  /** Accessible name for the board. Default "Chessboard". */
  label?: string;
  /**
   * A one-off effect, replayed whenever `id` changes: "glow" pulses a square
   * brass (a correct move); "miss" flashes it clay and shakes the board.
   */
  effect?: BoardEffect | null;
  /** Horizontal swipes that don't start on a piece you can move. */
  onSwipe?: (direction: "left" | "right") => void;
  /** The wooden frame. Default true; off for thumbnails. */
  framed?: boolean;
  className?: string;
}

export interface BoardEffect {
  kind: "glow" | "miss";
  square: string;
  /** Change it to replay the effect. */
  id: number;
}

const FILES = "abcdefgh";
const PIECE_NAMES: Record<string, string> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
const PROMOTIONS: PromotionPiece[] = ["q", "n", "r", "b"];

function placement(fen: string): Map<string, PieceCode> {
  const out = new Map<string, PieceCode>();
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") f += Number(ch);
      else {
        const white = ch === ch.toUpperCase();
        out.set(`${FILES[f]}${8 - r}`, `${white ? "w" : "b"}${ch.toUpperCase()}` as PieceCode);
        f++;
      }
    }
  });
  return out;
}

/** The 64 squares in display order: top-left to bottom-right. */
function displaySquares(orientation: BoardColor): string[] {
  const out: string[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const file = orientation === "white" ? col : 7 - col;
      const rank = orientation === "white" ? 8 - row : row + 1;
      out.push(`${FILES[file]}${rank}`);
    }
  }
  return out;
}

function displayCoords(sq: string, orientation: BoardColor): { col: number; row: number } {
  const file = sq.charCodeAt(0) - 97, rank = Number(sq[1]);
  return orientation === "white" ? { col: file, row: 8 - rank } : { col: 7 - file, row: rank - 1 };
}

const pieceName = (p: PieceCode) => `${p[0] === "w" ? "white" : "black"} ${PIECE_NAMES[p[1]]}`;

export function Chessboard({
  fen,
  orientation = "white",
  interactive = false,
  onMove,
  lastMove = null,
  arrows = [],
  markers = [],
  coordinates = true,
  label = "Chessboard",
  effect = null,
  onSwipe,
  framed = true,
  className,
}: ChessboardProps) {
  const descId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ pointerId: number; x0: number; y0: number } | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ from: string; pointerId: number; x0: number; y0: number; active: boolean; wasSelected: boolean } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);
  const pieces = useMemo(() => placement(fen), [fen]);
  // The position before this one, to show what a move captured.
  const [history, setHistory] = useState<{ fen: string; pieces: Map<string, PieceCode>; before: Map<string, PieceCode> | null }>(
    () => ({ fen, pieces, before: null }),
  );
  if (history.fen !== fen) setHistory({ fen, pieces, before: history.pieces });
  const before = history.fen === fen ? history.before : history.pieces;
  const squares = useMemo(() => displaySquares(orientation), [orientation]);
  const turn: BoardColor = fen.split(" ")[1] === "b" ? "black" : "white";
  const usable = !!onMove && interactive !== false;
  const canMove = usable && !!chess && (interactive === true || interactive === turn);

  const legal = useMemo(() => {
    const map = new Map<string, Move[]>();
    if (!canMove || !chess) return map;
    for (const m of chess.moves({ verbose: true })) {
      const list = map.get(m.from) ?? [];
      list.push(m);
      map.set(m.from, list);
    }
    return map;
  }, [chess, canMove]);

  // Selection and promotion belong to the position they were made in.
  const [sel, setSel] = useState<{ fen: string; sq: string } | null>(null);
  const selected = sel && sel.fen === fen && legal.has(sel.sq) ? sel.sq : null;
  const [promo, setPromo] = useState<{ fen: string; from: string; to: string } | null>(null);
  const promotion = promo && promo.fen === fen ? promo : null;
  const [drag, setDrag] = useState<{ from: string; x: number; y: number } | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [focusSq, setFocusSq] = useState<string | null>(null);

  const targets = useMemo(() => new Set<string>((selected ? legal.get(selected) ?? [] : []).map((m) => m.to)), [selected, legal]);
  const checkSquare = useMemo(() => {
    if (!chess?.inCheck()) return null;
    const king = turn === "white" ? "wK" : "bK";
    for (const [sq, p] of pieces) if (p === king) return sq;
    return null;
  }, [chess, pieces, turn]);
  const markerAt = useMemo(() => new Map(markers.map((m) => [m.square, m.tone])), [markers]);

  const select = (sq: string | null) => setSel(sq ? { fen, sq } : null);

  // A wrong move nudges the whole board: 2px, side to side, then still.
  const missId = effect?.kind === "miss" ? effect.id : null;
  useEffect(() => {
    const el = rootRef.current;
    if (missId === null || !el?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: "none" },
        { transform: "translateX(-2px)" },
        { transform: "translateX(2px)" },
        { transform: "translateX(-2px)" },
        { transform: "translateX(1px)" },
        { transform: "none" },
      ],
      { duration: 280, easing: "ease-in-out" },
    );
  }, [missId]);

  function commit(m: Move, viaDrag: boolean) {
    setSel(null);
    setPromo(null);
    setDropped(viaDrag ? m.lan : null);
    onMove?.({ from: m.from, to: m.to, promotion: m.promotion as PromotionPiece | undefined, san: m.san, uci: m.lan, fen: m.after });
  }

  function attempt(from: string, to: string, viaDrag: boolean) {
    const options = (legal.get(from) ?? []).filter((m) => m.to === to);
    if (options.length === 0) return;
    if (options.length > 1) {
      setSel({ fen, sq: from });
      setPromo({ fen, from, to });
      return;
    }
    commit(options[0], viaDrag);
  }

  function squareAt(x: number, y: number): string | null {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const col = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return squares[row * 8 + col];
  }

  function moveGhost(x: number, y: number) {
    const rect = rootRef.current?.getBoundingClientRect();
    const ghost = ghostRef.current;
    if (!rect || !ghost) return;
    ghost.style.transform = `translate(${x - rect.left}px, ${y - rect.top}px) translate(-50%, -50%)`;
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (promotion || (e.pointerType === "mouse" && e.button !== 0)) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (onSwipe && !(canMove && (legal.has(sq) || (selected && targets.has(sq))))) {
      swipeRef.current = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY };
    }
    if (!canMove) return;
    if (selected && targets.has(sq)) {
      attempt(selected, sq, false);
      return;
    }
    if (legal.has(sq)) {
      dragRef.current = { from: sq, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, wasSelected: selected === sq };
      select(sq);
      try {
        rootRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointers can't always be captured; dragging still works without it.
      }
    } else select(null);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.active = true;
      const rect = rootRef.current!.getBoundingClientRect();
      setDrag({ from: d.from, x: e.clientX - rect.left, y: e.clientY - rect.top });
      return;
    }
    moveGhost(e.clientX, e.clientY);
  }

  function endSwipe(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const sw = swipeRef.current;
    if (!sw || sw.pointerId !== e.pointerId) return;
    swipeRef.current = null;
    const dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
    if (!cancelled && Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) onSwipe?.(dx < 0 ? "left" : "right");
  }

  function endDrag(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    endSwipe(e, cancelled);
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (rootRef.current?.hasPointerCapture?.(e.pointerId)) rootRef.current.releasePointerCapture(e.pointerId);
    if (cancelled) {
      setDrag(null);
      return;
    }
    if (d.active) {
      setDrag(null);
      const sq = squareAt(e.clientX, e.clientY);
      if (sq && sq !== d.from && (legal.get(d.from) ?? []).some((m) => m.to === sq)) attempt(d.from, sq, true);
      else if (sq !== d.from) select(null);
    } else if (d.wasSelected) select(null);
  }

  // Keyboard (and assistive tech) activation arrives as a click with detail 0;
  // pointer clicks were already handled on pointerdown.
  function onSquareClick(e: MouseEvent<HTMLButtonElement>, sq: string) {
    if (e.detail !== 0 || !canMove || promotion) return;
    if (selected && targets.has(sq)) attempt(selected, sq, false);
    else if (legal.has(sq)) select(selected === sq ? null : sq);
    else select(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      setPromo(null);
      select(null);
      return;
    }
    const delta = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    const current = (e.target as HTMLElement).dataset?.square;
    if (!delta || !current) return;
    e.preventDefault();
    const { col, row } = displayCoords(current, orientation);
    const nc = Math.min(7, Math.max(0, col + delta[0])), nr = Math.min(7, Math.max(0, row + delta[1]));
    const next = squares[nr * 8 + nc];
    setFocusSq(next);
    rootRef.current?.querySelector<HTMLElement>(`[data-square="${next}"]`)?.focus();
  }

  const lastUci = lastMove ? lastMove.from + lastMove.to : null;
  const moved = lastMove ? pieces.get(lastMove.to) : undefined;
  // True when the last move is what turned the previous position into this one.
  const fresh = !!lastMove && !!moved && !!before && (before.get(lastMove.from) === moved || (moved[1] !== "P" && before.get(lastMove.from)?.[1] === "P"));
  const slides = new Map<string, CSSProperties>();
  const offset = (from: string, to: string) => {
    const a = displayCoords(from, orientation), b = displayCoords(to, orientation);
    return { "--dx": `${(a.col - b.col) * 100}%`, "--dy": `${(a.row - b.row) * 100}%` } as CSSProperties;
  };
  // Slide the moved piece in (unless it was dropped there)...
  if (lastMove && moved && dropped?.slice(0, 4) !== lastUci) slides.set(lastMove.to, offset(lastMove.from, lastMove.to));
  // ...and a castling rook with it.
  if (lastMove && moved?.[1] === "K" && fresh && Math.abs(lastMove.from.charCodeAt(0) - lastMove.to.charCodeAt(0)) === 2) {
    const rank = lastMove.to[1], kingside = lastMove.to[0] === "g";
    const rookTo = `${kingside ? "f" : "d"}${rank}`;
    if (pieces.get(rookTo)?.[1] === "R") slides.set(rookTo, offset(`${kingside ? "h" : "a"}${rank}`, rookTo));
  }
  // What the move took, fading out under the piece that took it.
  const victim = lastMove && fresh ? before!.get(lastMove.to) : undefined;
  const captured = victim && moved && victim[0] !== moved[0] ? victim : undefined;
  const tabStop = focusSq ?? squares[56];

  const board = (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      aria-describedby={descId}
      className={[styles.board, canMove ? styles.movable : onSwipe ? styles.swipeable : "", framed ? "" : className ?? ""].join(" ")}
      data-fen={fen}
      data-orientation={orientation}
      data-turn={turn}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, false)}
      onPointerCancel={(e) => endDrag(e, true)}
      onKeyDown={onKeyDown}
    >
      <p id={descId} className={styles.srOnly}>
        {`${turn === "white" ? "White" : "Black"} to move. FEN: ${fen}`}
      </p>
      <span className={styles.grain} aria-hidden="true" />
      {squares.map((sq, i) => {
        const piece = pieces.get(sq);
        const row = Math.floor(i / 8), col = i % 8;
        const dark = (sq.charCodeAt(0) - 97 + Number(sq[1])) % 2 === 0;
        const last = lastMove ? (sq === lastMove.from ? "from" : sq === lastMove.to ? "to" : undefined) : undefined;
        const tone = markerAt.get(sq);
        const isTarget = targets.has(sq);
        const cls = [
          styles.square,
          dark ? styles.dark : styles.light,
          last ? styles.last : "",
          sq === selected ? styles.selected : "",
          isTarget ? (piece ? styles.capture : styles.target) : "",
          sq === checkSquare ? styles.check : "",
          tone ? styles[`mark_${tone}`] : "",
        ].join(" ");
        const content = (
          <>
            {coordinates && col === 0 && <span className={styles.rank} aria-hidden="true">{sq[1]}</span>}
            {coordinates && row === 7 && <span className={styles.file} aria-hidden="true">{sq[0]}</span>}
            {captured && sq === lastMove?.to && (
              <span key={`x-${fen}`} className={`${styles.piece} ${styles.captured}`} aria-hidden="true">
                <PieceSvg piece={captured} />
              </span>
            )}
            {piece && (
              <span
                key={`${fen}-${sq}`}
                className={[styles.piece, drag?.from === sq ? styles.lifted : "", slides.has(sq) ? styles.slide : ""].join(" ")}
                style={slides.get(sq)}
              >
                <PieceSvg piece={piece} />
              </span>
            )}
            {effect && effect.square === sq && (
              <span key={`fx-${effect.id}`} className={effect.kind === "glow" ? styles.glow : styles.flash} aria-hidden="true" />
            )}
          </>
        );
        const data = {
          "data-square": sq,
          "data-piece": piece,
          "data-selected": sq === selected ? "true" : undefined,
          "data-target": isTarget ? "true" : undefined,
          "data-last": last,
          "data-marker": tone,
          "data-check": sq === checkSquare ? "true" : undefined,
        };
        if (!usable) {
          return <div key={sq} className={cls} {...data}>{content}</div>;
        }
        return (
          <button
            key={sq}
            type="button"
            className={cls}
            {...data}
            tabIndex={sq === tabStop ? 0 : -1}
            aria-label={`${sq}${piece ? ` ${pieceName(piece)}` : ""}${sq === selected ? ", selected" : ""}${isTarget ? ", legal move" : ""}`}
            onFocus={() => setFocusSq(sq)}
            onClick={(e) => onSquareClick(e, sq)}
          >
            {content}
          </button>
        );
      })}

      {arrows.length > 0 && (
        <svg className={styles.arrows} viewBox="0 0 8 8" aria-hidden="true">
          {arrows.map((a) => {
            const f = displayCoords(a.from, orientation), t = displayCoords(a.to, orientation);
            const x1 = f.col + 0.5, y1 = f.row + 0.5, x2 = t.col + 0.5, y2 = t.row + 0.5;
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
            const w = Math.max(0.15, Math.min(1, a.weight ?? 1));
            const head = 0.34 + 0.1 * w, half = head * 0.62, stroke = 0.09 + 0.11 * w;
            const tipX = x2 - ux * 0.12, tipY = y2 - uy * 0.12;
            const bx = tipX - ux * head, by = tipY - uy * head;
            return (
              <g key={`${a.from}${a.to}`} data-arrow={`${a.from}${a.to}`} className={styles[`arrow_${a.tone ?? "info"}`]} opacity={0.5 + 0.4 * w}>
                <line x1={x1 + ux * 0.18} y1={y1 + uy * 0.18} x2={bx} y2={by} strokeWidth={stroke} strokeLinecap="round" />
                <polygon points={`${tipX},${tipY} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`} />
              </g>
            );
          })}
        </svg>
      )}

      {drag && pieces.get(drag.from) && (
        <div
          ref={ghostRef}
          className={styles.ghost}
          style={{ transform: `translate(${drag.x}px, ${drag.y}px) translate(-50%, -50%)` }}
          aria-hidden="true"
        >
          <PieceSvg piece={pieces.get(drag.from)!} />
        </div>
      )}

      {promotion && (
        <div className={styles.promotion} role="dialog" aria-label="Choose a promotion piece">
          <div className={styles.promotionPanel}>
            {PROMOTIONS.map((p) => {
              const move = (legal.get(promotion.from) ?? []).find((m) => m.to === promotion.to && m.promotion === p);
              if (!move) return null;
              const code = `${turn === "white" ? "w" : "b"}${p.toUpperCase()}` as PieceCode;
              return (
                <button key={p} type="button" className={styles.promotionChoice} aria-label={`Promote to ${PIECE_NAMES[p.toUpperCase()]}`} onClick={() => commit(move, false)}>
                  <PieceSvg piece={code} />
                </button>
              );
            })}
            <button type="button" className={styles.promotionCancel} onClick={() => setPromo(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
  if (!framed) return board;
  return <div className={[styles.frame, className ?? ""].join(" ")}>{board}</div>;
}
