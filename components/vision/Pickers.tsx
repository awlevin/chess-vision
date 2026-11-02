// The contents of the two sheets: the drill list, and the drill settings
// (side, piece, board labels, sound).
import { PieceSvg } from "@/components/board";
import { DRILLS, PIECES, SIDES, type Mode, type Prefs } from "./config";
import styles from "./pickers.module.css";

/** A tiny 4×4 board that sketches what each drill asks of you. */
function DrillArt({ mode }: { mode: Mode }) {
  const cells = [];
  for (let r = 0; r < 4; r++)
    for (let f = 0; f < 4; f++)
      cells.push(<rect key={`${f}${r}`} x={f * 9} y={r * 9} width={9} height={9} className={(f + r) % 2 ? styles.dk : styles.lt} />);
  return (
    <svg viewBox="0 0 36 36" className={styles.art} aria-hidden>
      {cells}
      {mode === "find" && <rect x={18.75} y={9.75} width={7.5} height={7.5} className={styles.ring} />}
      {mode === "line" && <rect x={9} y={0} width={9} height={36} className={styles.fill} />}
      {mode === "name" && (
        <>
          <rect x={18} y={18} width={9} height={9} className={styles.fill} />
          <circle cx={22.5} cy={22.5} r={2.4} className={styles.dot} />
        </>
      )}
      {mode === "tour" && (
        <>
          <path d="M4.5 31.5 V13.5 H13.5" className={styles.path} />
          <circle cx={4.5} cy={31.5} r={2} className={styles.dot} />
          <circle cx={13.5} cy={13.5} r={2.6} className={styles.dot} />
        </>
      )}
    </svg>
  );
}

export function DrillList({ current, onPick }: { current: Mode; onPick: (m: Mode) => void }) {
  return (
    <div className={styles.list}>
      {DRILLS.map((d) => (
        <button
          key={d.mode}
          type="button"
          className={styles.row}
          aria-current={d.mode === current || undefined}
          onClick={() => onPick(d.mode)}
        >
          <DrillArt mode={d.mode} />
          <span className={styles.text}>
            <span className={styles.name}>{d.title}</span>
            <span className={styles.sub}>{d.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Settings({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (f: (p: Prefs) => Prefs) => void }) {
  return (
    <div className={styles.settings}>
      <div className={styles.setting}>
        <span className={styles.label}>Play as</span>
        <div className={styles.seg} role="group" aria-label="Play as">
          {SIDES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={prefs.side === s}
              onClick={() => setPrefs((p) => ({ ...p, side: s }))}
            >
              {s === "white" ? "White" : "Black"}
            </button>
          ))}
        </div>
      </div>

      {prefs.mode === "tour" && (
        <div className={styles.setting}>
          <span className={styles.label}>Piece</span>
          <div className={styles.seg} role="group" aria-label="Piece">
            {PIECES.map((x) => (
              <button
                key={x.piece}
                type="button"
                aria-pressed={prefs.piece === x.piece}
                aria-label={x.name}
                title={x.name}
                onClick={() => setPrefs((p) => ({ ...p, piece: x.piece }))}
              >
                <PieceSvg piece={x.code} className={styles.piece} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.setting}>
        <span className={styles.label}>Board labels</span>
        <div className={styles.seg} role="group" aria-label="Board labels">
          {(
            [
              ["files", "a–h", "File letters"],
              ["ranks", "1–8", "Rank numbers"],
            ] as const
          ).map(([edge, range, name]) => (
            <button
              key={edge}
              type="button"
              aria-pressed={prefs.labels[edge]}
              aria-label={name}
              title={name}
              onClick={() => setPrefs((p) => ({ ...p, labels: { ...p.labels, [edge]: !p.labels[edge] } }))}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.setting}>
        <span className={styles.label}>Sound</span>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.sound}
          aria-label="Sound"
          className={styles.switch}
          onClick={() => setPrefs((p) => ({ ...p, sound: !p.sound }))}
        >
          <span />
        </button>
      </div>
    </div>
  );
}
