// The drill board: an empty, framed board whose squares can be tapped, with
// marks for the prompt and the answer, an optional piece, and one-off glows.
import type { CSSProperties, Ref } from "react";
import { PieceSvg } from "@/components/board";
import { boardRows, isDark, type Orientation, type Square } from "@/lib/drill";
import type { Labels } from "./config";
import styles from "./board.module.css";

/** target: the square to name · line: the file or rank to name · from: where the piece left · answer / wrong: after a miss */
export type MarkKind = "target" | "line" | "from" | "answer" | "wrong";
/** A one-off glow over some squares: brass for a hit, clay for a miss. A new `id` replays it. */
export type Pulse = { id: number; squares: Square[]; tone: "good" | "bad" };

export function Board({
  orientation,
  labels,
  marks = {},
  piece,
  onPick,
  pulse,
  dim = false,
  sheen,
  ref,
}: {
  orientation: Orientation;
  labels: Labels;
  marks?: Record<Square, MarkKind>;
  /** `slide` animates the piece from its last square to this one. */
  piece?: { sq: Square; code: "wN" | "wB" | "wR" | "wQ"; slide: boolean };
  onPick?: (sq: Square) => void;
  pulse?: Pulse | null;
  /** Ready state: the board rests, dimmed, until Begin. */
  dim?: boolean;
  /** A key that, when it changes, sweeps a brass sheen across the board once. */
  sheen?: number | null;
  ref?: Ref<HTMLDivElement>;
}) {
  const rows = boardRows(orientation);
  const flat = rows.flat();
  const at = (sq: Square): CSSProperties => {
    const i = flat.indexOf(sq);
    return { left: `${(i % 8) * 12.5}%`, top: `${Math.floor(i / 8) * 12.5}%` };
  };
  // Line marks light up square by square along the line.
  const lineOrder = Object.keys(marks).filter((sq) => marks[sq] === "line");

  return (
    <div ref={ref} className={styles.frame} data-dim={dim || undefined}>
      <div className={styles.board} data-pickable={!!onPick || undefined}>
        {rows.map((row, ri) =>
          row.map((sq, fi) => {
            const mark = marks[sq];
            return (
              <button
                key={sq}
                type="button"
                tabIndex={-1}
                aria-label={sq}
                data-sq={sq}
                data-mark={mark}
                className={`${styles.sq} ${isDark(sq) ? styles.dk : styles.lt}`}
                style={mark === "line" ? ({ "--i": lineOrder.indexOf(sq) } as CSSProperties) : undefined}
                onPointerDown={onPick ? (e) => { e.preventDefault(); onPick(sq); } : undefined}
              >
                {labels.ranks && fi === 0 && <span className={styles.rank}>{sq[1]}</span>}
                {labels.files && ri === 7 && <span className={styles.file}>{sq[0]}</span>}
              </button>
            );
          }),
        )}
        {piece && (
          <span
            // A sliding piece keeps its element so it can glide; otherwise it lands afresh.
            key={piece.slide ? "piece" : piece.sq}
            className={styles.piece}
            data-slide={piece.slide || undefined}
            style={at(piece.sq)}
            aria-hidden
          >
            <PieceSvg piece={piece.code} />
          </span>
        )}
        {pulse?.squares.map((sq, i) => (
          <span
            key={`${pulse.id}-${sq}`}
            className={styles.pulse}
            data-tone={pulse.tone}
            style={{ ...at(sq), "--i": i } as CSSProperties}
            aria-hidden
          />
        ))}
        {sheen != null && <span key={sheen} className={styles.sheen} aria-hidden />}
      </div>
    </div>
  );
}
