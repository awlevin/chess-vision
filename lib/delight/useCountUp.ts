"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

/**
 * Counts from the last shown value (0 at first) up or down to `target`
 * with an ease-out. Returns the integer to show. Instant under reduced
 * motion.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const current = useRef(0);

  useEffect(() => {
    from.current = current.current;
    const start = performance.now();
    const instant = prefersReducedMotion() || durationMs <= 0;
    let raf = 0;
    const step = (now: number) => {
      const p = instant ? 1 : Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from.current + (target - from.current) * eased);
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return shown;
}
