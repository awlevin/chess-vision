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
// Test hooks: the root has data-fen, data-orientation and data-turn; each
// square has data-square and, when occupied, data-piece ("wP", "bK", ...),
// plus data-selected, data-target, data-last, data-marker and data-check.
// Arrows are <g data-arrow="e2e4">.
import { Chess, type Move } from "chess.js";
import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
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
  className?: string;
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
  className,
}: ChessboardProps) {
  const descId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
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
    if (!canMove || promotion || (e.pointerType === "mouse" && e.button !== 0)) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
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

  function endDrag(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
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
  const animate = !!lastMove && pieces.has(lastMove.to) && dropped?.slice(0, 4) !== lastUci;
  const slide = animate && lastMove
    ? (() => {
        const a = displayCoords(lastMove.from, orientation), b = displayCoords(lastMove.to, orientation);
        return { "--dx": `${(a.col - b.col) * 100}%`, "--dy": `${(a.row - b.row) * 100}%` } as CSSProperties;
      })()
    : undefined;
  const tabStop = focusSq ?? squares[56];

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      aria-describedby={descId}
      className={[styles.board, canMove ? styles.movable : "", className ?? ""].join(" ")}
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
            {piece && (
              <span
                key={`${fen}-${sq}`}
                className={[styles.piece, drag?.from === sq ? styles.lifted : "", animate && sq === lastMove?.to ? styles.slide : ""].join(" ")}
                style={animate && sq === lastMove?.to ? slide : undefined}
              >
                <PieceSvg piece={piece} />
              </span>
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
}
