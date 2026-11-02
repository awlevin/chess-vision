"use client";

import { useEffect, useRef, useState } from "react";

const FRAMES = 48; // about 0.8 s at 60 fps
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export interface CountUpProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The number to land on. Changes animate from whatever is showing. */
  value: number;
  /** Where the first count starts. Defaults to 0. */
  from?: number;
}

/**
 * A number that counts up to `value` (formatted with toLocaleString). It
 * always lands on the exact value, and jumps straight there under
 * prefers-reduced-motion. Steps by animation frame rather than by clock, so
 * a paused or faked clock can't strand it part way.
 */
export function CountUp({ value, from = 0, ...rest }: CountUpProps) {
  const [shown, setShown] = useState(from);
  const shownRef = useRef(from);

  useEffect(() => {
    const start = shownRef.current;
    if (start === value) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const frames = reduce ? 1 : FRAMES;
    let frame = 0;
    let raf = requestAnimationFrame(function step() {
      frame++;
      const t = Math.min(1, frame / frames);
      const next = t === 1 ? value : Math.round(start + (value - start) * easeOut(t));
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span {...rest}>{shown.toLocaleString()}</span>;
}
