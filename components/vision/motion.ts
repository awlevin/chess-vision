// Small motion helpers for the Vision drills. CSS does most of the motion;
// these cover what CSS can't: a number that counts, and one-off animations
// that must retrigger on demand. All of them honour prefers-reduced-motion.
import { useEffect, useState } from "react";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Counts from `from` to `to` over `ms` with an ease-out; instant under reduced motion. */
export function useCountUp(to: number, { from = 0, ms = 700 }: { from?: number; ms?: number } = {}): number {
  const [value, setValue] = useState(() => (reducedMotion() ? to : from));
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, from, ms]);
  return reducedMotion() ? to : value;
}

/** A 2px shake: the board's "not quite". */
export function shake(el: HTMLElement | null) {
  if (!el || reducedMotion() || !el.animate) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(3px)" },
      { transform: "translateX(-2px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 300, easing: "ease-out" },
  );
}
