"use client";

// Small synthesised sounds: no audio files, no licences. Everything is built
// from oscillators and a little filtered noise with WebAudio.
//
//   playSound("move" | "capture" | "castle" | "correct" | "wrong" | "complete")
//   useSound() → [on, setOn]        the persisted sound setting (default on)
//
// Browsers only allow audio after a user gesture, so the AudioContext is
// created on the first pointerdown or keydown anywhere on the page. Until
// then playSound is a silent no-op. The setting is per device
// (localStorage), since it's about the room you're in.
import { useCallback, useSyncExternalStore } from "react";

export type SoundName = "move" | "capture" | "castle" | "correct" | "wrong" | "complete";

const KEY = "delight-sound-v1";
const listeners = new Set<() => void>();
let enabled: boolean | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let hooked = false;

function readEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    enabled = window.localStorage.getItem(KEY) !== "off";
  } catch {
    enabled = true;
  }
  return enabled;
}

export function isSoundOn(): boolean {
  return typeof window !== "undefined" && readEnabled();
}

export function setSoundOn(on: boolean): void {
  enabled = on;
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Private mode: keep it for this page.
  }
  listeners.forEach((l) => l());
}

/** The sound setting, live and persisted. */
export function useSound(): [boolean, (on: boolean) => void] {
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, []);
  const on = useSyncExternalStore(subscribe, isSoundOn, () => true);
  return [on, setSoundOn];
}

/** Creates (or resumes) the AudioContext. Call from a user gesture. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Unlocks audio on the first gesture anywhere. Safe to call many times. */
export function installAudioUnlock(): void {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  const once = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", once, true);
    window.removeEventListener("keydown", once, true);
  };
  window.addEventListener("pointerdown", once, true);
  window.addEventListener("keydown", once, true);
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const len = Math.floor(c.sampleRate * 0.25);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

/** A filtered noise burst: the "wood" in a piece being set down. */
function knock(c: AudioContext, out: AudioNode, t: number, freq: number, q: number, gain: number, decay: number) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(bp).connect(g).connect(out);
  src.start(t);
  src.stop(t + decay + 0.02);
}

/** A sine with an envelope; `to` glides the pitch. */
function tone(c: AudioContext, out: AudioNode, t: number, freq: number, gain: number, attack: number, decay: number, to?: number, type: OscillatorType = "sine") {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.02);
}

/** A soft bell: a fundamental with a quiet inharmonic partial. */
function chime(c: AudioContext, out: AudioNode, t: number, freq: number, gain: number, decay: number) {
  tone(c, out, t, freq, gain, 0.008, decay);
  tone(c, out, t, freq * 2.76, gain * 0.18, 0.004, decay * 0.45);
}

const RECIPES: Record<SoundName, (c: AudioContext, out: AudioNode, t: number) => void> = {
  move: (c, out, t) => {
    knock(c, out, t, 1900, 1.4, 0.55, 0.05);
    tone(c, out, t, 210, 0.35, 0.002, 0.06, 140);
  },
  capture: (c, out, t) => {
    knock(c, out, t, 1300, 1.1, 0.7, 0.07);
    tone(c, out, t, 170, 0.45, 0.002, 0.09, 100);
    knock(c, out, t + 0.045, 2400, 2, 0.32, 0.04);
  },
  castle: (c, out, t) => {
    knock(c, out, t, 1900, 1.4, 0.5, 0.05);
    tone(c, out, t, 210, 0.3, 0.002, 0.06, 140);
    knock(c, out, t + 0.09, 1700, 1.4, 0.45, 0.05);
    tone(c, out, t + 0.09, 190, 0.28, 0.002, 0.06, 130);
  },
  correct: (c, out, t) => {
    chime(c, out, t, 659.25, 0.2, 0.55); // E5
    chime(c, out, t + 0.07, 987.77, 0.16, 0.7); // B5
  },
  wrong: (c, out, t) => {
    tone(c, out, t, 120, 0.5, 0.005, 0.2, 72);
    knock(c, out, t, 380, 0.9, 0.25, 0.08);
  },
  complete: (c, out, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => chime(c, out, t + i * 0.09, f, 0.16, 0.9 + i * 0.15)); // C E G C
  },
};

/** Plays a sound if sound is on and audio has been unlocked. Never throws. */
export function playSound(name: SoundName): void {
  if (!isSoundOn() || !ctx || !master) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    RECIPES[name](ctx, master, ctx.currentTime + 0.005);
  } catch {
    // Audio is a nicety.
  }
}

/** The sound for a move, from its SAN. */
export function soundForSan(san: string): SoundName {
  if (san.startsWith("O-O")) return "castle";
  return san.includes("x") ? "capture" : "move";
}
