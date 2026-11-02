// Delight primitives: small, dependency-free, and all of them respect
// prefers-reduced-motion and the sound setting. See README "Delight".
//
//   playSound(name), soundForSan(san), useSound(), installAudioUnlock()
//   haptic("tick" | "success" | "miss")
//   burst(elementOrPoint, options?)
//   useCountUp(target, ms?)
//   useReducedMotion(), prefersReducedMotion()
//   feedback("correct" | "wrong" | "complete")   sound + haptic together
export { playSound, soundForSan, useSound, isSoundOn, setSoundOn, unlockAudio, installAudioUnlock, type SoundName } from "./sound";
export { haptic, type HapticKind } from "./haptics";
export { burst, type BurstOptions } from "./burst";
export { useCountUp } from "./useCountUp";
export { useReducedMotion, prefersReducedMotion } from "./motion";

import { haptic } from "./haptics";
import { playSound } from "./sound";

/** The usual pairing of a sound and a haptic for a graded answer. */
export function feedback(kind: "correct" | "wrong" | "complete"): void {
  playSound(kind);
  haptic(kind === "correct" ? "tick" : kind === "wrong" ? "miss" : "success");
}
