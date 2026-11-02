// A small brass confetti burst for a personal best. Pure CSS motion; the
// pieces are spread deterministically (golden angle), so renders stay pure.
import type { CSSProperties } from "react";
import { reducedMotion } from "./motion";
import styles from "./summary.module.css";

const PIECES = Array.from({ length: 28 }, (_, i) => {
  const angle = (i * 137.508 * Math.PI) / 180;
  const dist = 70 + ((i * 37) % 80);
  return {
    dx: Math.round(Math.cos(angle) * dist * 1.3),
    dy: Math.round(Math.sin(angle) * dist * 0.7 - 50),
    rot: ((i * 83) % 360) - 180,
    delay: (i % 5) * 18,
    tone: i % 3,
    wide: i % 4 === 0,
  };
});

export function Confetti() {
  if (reducedMotion()) return null;
  return (
    <span className={styles.confetti} aria-hidden>
      {PIECES.map((p, i) => (
        <span
          key={i}
          data-tone={p.tone}
          data-wide={p.wide || undefined}
          style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--rot": `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
        />
      ))}
    </span>
  );
}
