"use client";

// A small brass confetti and sparkle burst on a throwaway canvas. No
// dependencies, about a second long, and gone afterwards. Under reduced
// motion it does nothing.
//
//   burst(element)                 from the element's centre
//   burst({ x, y }, { count: 60 })  from a viewport point
import { prefersReducedMotion } from "./motion";

export interface BurstOptions {
  /** Pieces of confetti. Default 46. */
  count?: number;
  /** Colours to draw from. Default: brass, brass highlight, ivory, sage. */
  colors?: string[];
  /** Initial speed in px per second. Default 520. */
  power?: number;
  /** Spread in degrees around straight up. Default 300 (nearly a full circle). */
  spread?: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; size: number; color: string;
  kind: "strip" | "spark";
  life: number;
}

const DEFAULT_COLORS = ["#D2AC6E", "#E8C98F", "#F2EADB", "#9DBE7A", "#8E6C3C"];
const DURATION = 1300;

export function burst(origin: Element | { x: number; y: number }, options: BurstOptions = {}): void {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  const { count = 46, colors = DEFAULT_COLORS, power = 520, spread = 300 } = options;
  let ox: number, oy: number;
  if ("getBoundingClientRect" in origin) {
    const r = origin.getBoundingClientRect();
    ox = r.left + r.width / 2;
    oy = r.top + r.height / 2;
  } else ({ x: ox, y: oy } = origin);

  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: `${w}px`, height: `${h}px`, pointerEvents: "none", zIndex: "9999" });
  document.body.appendChild(canvas);
  const g = canvas.getContext("2d");
  if (!g) return canvas.remove();
  g.scale(dpr, dpr);

  const parts: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = ((-90 + (Math.random() - 0.5) * spread) * Math.PI) / 180;
    const speed = power * (0.35 + Math.random() * 0.75);
    const spark = i % 4 === 0;
    parts.push({
      x: ox, y: oy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 14,
      size: spark ? 2 + Math.random() * 2 : 5 + Math.random() * 5,
      color: colors[i % colors.length],
      kind: spark ? "spark" : "strip",
      life: 0.75 + Math.random() * 0.25,
    });
  }

  const t0 = performance.now();
  let last = t0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const p = (now - t0) / DURATION;
    g.clearRect(0, 0, w, h);
    for (const q of parts) {
      q.vy += 900 * dt; // gravity
      q.vx *= 1 - 1.6 * dt; // air
      q.vy *= 1 - 1.2 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      const alpha = Math.max(0, 1 - p / q.life);
      if (alpha <= 0) continue;
      g.globalAlpha = alpha;
      g.fillStyle = q.color;
      if (q.kind === "spark") {
        g.beginPath();
        g.arc(q.x, q.y, q.size * (1 + 0.4 * Math.sin(now / 60 + q.rot)), 0, Math.PI * 2);
        g.fill();
      } else {
        g.save();
        g.translate(q.x, q.y);
        g.rotate(q.rot);
        // Flip on one axis so strips catch the light as they tumble.
        g.scale(1, Math.abs(Math.cos(q.rot * 1.7)) * 0.8 + 0.2);
        g.fillRect(-q.size / 2, -q.size / 5, q.size, (q.size * 2) / 5);
        g.restore();
      }
    }
    if (p < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
