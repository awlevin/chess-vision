// Short haptics through navigator.vibrate. A no-op where it isn't supported
// (iOS Safari, desktops), so it is always safe to call.

export type HapticKind = "tick" | "success" | "miss";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tick: 8, //               a correct move, a toggle
  success: [10, 50, 10, 50, 22], // a session done
  miss: [26, 60, 26], //     a wrong move: a soft double buzz
};

export function haptic(kind: HapticKind): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Some browsers throw before the first user gesture; haptics never matter.
  }
}
