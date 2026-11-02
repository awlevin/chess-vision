// Round end: one big number (seconds per square), the accuracy, what to work
// on as compact chips, and the all-time heat map. A personal best gets confetti.
import type { CSSProperties } from "react";
import type { Orientation, StatMap } from "@/lib/drill";
import type { Attempt, Mode, RoundSummary as Summary } from "./config";
import { Confetti } from "./Confetti";
import { HeatBoard } from "./HeatBoard";
import { useCountUp } from "./motion";
import styles from "./summary.module.css";
import ui from "./vision.module.css";

/** Accuracy tinted from clay through stone to sage, as the score pill does. */
function accuracyTone(acc: number) {
  return acc >= 90 ? "win" : acc >= 70 ? "draw" : "loss";
}

export function RoundSummary({
  active,
  round,
  history,
  stats,
  orientation,
  mode,
  onNext,
}: {
  active: boolean;
  round: Attempt[];
  /** All rounds, this one last. */
  history: Summary[];
  stats: StatMap;
  orientation: Orientation;
  mode: Mode;
  onNext: () => void;
}) {
  const summary = history[history.length - 1];
  const earlier = history.slice(0, -1);
  const prevBest = earlier.length ? Math.min(...earlier.map((h) => h.avg)) : null;
  const isBest = prevBest != null && summary.avg < prevBest;
  // A new best counts down from the old one; otherwise the number counts up.
  const shown = useCountUp(summary.avg, { from: isBest ? prevBest! : 0, ms: isBest ? 900 : 650 });

  const missed = round.filter((r) => !r.correct);
  const slow = round
    .filter((r) => r.correct && r.time > summary.avg * 1.4)
    .sort((a, b) => b.time - a.time)
    .slice(0, 4);

  const line = isBest
    ? `${(prevBest! - summary.avg).toFixed(2)}s faster than your best.`
    : summary.acc === 100
      ? "Not a single miss."
      : `${missed.length} coming back next round.`;

  return (
    <section className={styles.summary} aria-label="Round summary" data-testid={active ? "round-summary" : undefined}>
      <p className={styles.kicker} data-best={isBest || undefined}>
        {isBest ? "New best" : `Round ${history.length}`}
      </p>

      <div className={styles.hero}>
        {isBest && <Confetti />}
        <span className={styles.number} data-testid="round-average">{shown.toFixed(2)}</span>
        <span className={styles.per}>
          s<br />
          <span>per {mode === "line" ? "line" : mode === "tour" ? "move" : "square"}</span>
        </span>
      </div>
      <p className={styles.line}>{line}</p>

      <div className={styles.facts}>
        <span className={styles.pill} data-tone={accuracyTone(summary.acc)}>{summary.acc}%</span>
        <span>{summary.total.toFixed(1)}s total</span>
        {prevBest != null && !isBest && <span>Best {prevBest.toFixed(2)}s</span>}
      </div>

      {(missed.length > 0 || slow.length > 0) && (
        <div className={styles.chips}>
          {missed.map((r, i) => (
            <span key={`m${i}`} className={styles.chip} data-tone="miss" style={{ "--i": i } as CSSProperties}>
              <b>{r.sq}</b>
              {r.given && <s>{r.given}</s>}
            </span>
          ))}
          {slow.map((r, i) => (
            <span key={`s${i}`} className={styles.chip} data-tone="slow" style={{ "--i": missed.length + i } as CSSProperties}>
              <b>{r.sq}</b>
              <span>{r.time.toFixed(1)}s</span>
            </span>
          ))}
        </div>
      )}

      <div className={styles.heat}>
        <h3>All time</h3>
        <HeatBoard stats={stats} orientation={orientation} mode={mode} />
      </div>

      <div className={styles.footer}>
        <button type="button" className={ui.primary} onClick={onNext}>
          Next round
        </button>
      </div>
    </section>
  );
}
