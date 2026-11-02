// The prompt: the coordinate to find (or the one you're naming) set as an
// oversized serif glyph, with a live timer and the streak beside it.
//
// Test hooks (on the drill on screen only): data-testid="prompt", data-coord
// (the key being asked), data-review, and data-feedback ("correct" while a
// hit glows, "miss" while a miss waits).
import { useEffect, useRef } from "react";
import type { Mode, Phase } from "./config";
import styles from "./vision.module.css";

function Timer({ running, startedAt, final }: { running: boolean; startedAt: number; final: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      if (ref.current) ref.current.textContent = ((performance.now() - startedAt) / 1000).toFixed(1);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [running, startedAt]);
  // The live figure is written straight to the DOM each frame, so React owns
  // no text inside that span.
  return (
    <span className={styles.timer} data-running={running || undefined}>
      {running ? <span key="live" ref={ref} /> : <span key="final">{final == null ? "0.0" : final.toFixed(2)}</span>}
      <span className={styles.unit}>s</span>
    </span>
  );
}

export function Prompt({
  phase,
  mode,
  square,
  promptId,
  nameFile,
  isReview,
  startedAt,
  lastTime,
  streak,
  ready,
  active,
}: {
  /** Only the drill on screen carries the test hooks; drills kept mounted in the background don't. */
  active: boolean;
  phase: Phase;
  mode: Mode;
  square: string;
  promptId: number;
  nameFile: string | null;
  isReview: boolean;
  startedAt: number;
  lastTime: number | null;
  streak: number;
  ready: { title: string; sub: string };
}) {
  const live = phase !== "ready";
  const blank = <span className={styles.blank}>?</span>;
  let glyph: React.ReactNode;
  if (mode === "find" || phase === "flash" || phase === "wrongpause") glyph = square;
  else if (mode === "line") glyph = blank;
  else glyph = <>{nameFile ?? blank}{nameFile ? blank : null}</>;

  return (
    <div
      className={styles.prompt}
      data-testid={active ? "prompt" : undefined}
      data-coord={live ? square : undefined}
      data-review={(live && isReview) || undefined}
      data-feedback={phase === "flash" ? "correct" : phase === "wrongpause" ? "miss" : undefined}
    >
      {live ? (
        <span key={promptId} className={styles.glyph} aria-live="polite">{glyph}</span>
      ) : (
        <div className={styles.ready}>
          <span className={styles.readyTitle}>{ready.title}</span>
          <span className={styles.readySub}>{ready.sub}</span>
        </div>
      )}
      {live && (
        <div className={styles.meta}>
          {isReview && <span className={styles.review}>Review</span>}
          <Timer running={phase === "solve"} startedAt={startedAt} final={lastTime} />
          {streak >= 2 && (
            <span key={streak} className={styles.streak} data-milestone={streak % 5 === 0 || undefined}>
              {streak} in a row
            </span>
          )}
        </div>
      )}
    </div>
  );
}
