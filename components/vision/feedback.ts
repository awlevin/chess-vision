// Sound and haptics for the Vision drills, behind one tiny adapter.
//
// Every drill event calls `feedback.<event>()` and nothing else touches
// WebAudio or navigator.vibrate, so this file is the one place to repoint at
// the shared delight library (lib/delight) once it lands: replace the bodies
// of the exported functions and delete the local synth below.
//
// Sound is synthesised (no audio files), soft, and created lazily on the
// first call, which is always inside a tap or key press so browsers allow it.

export type FeedbackEvent = "begin" | "correct" | "miss" | "streak" | "roundEnd" | "best";

let soundOn = true;
let ctx: AudioContext | null = null;

/** Called by the drill shell whenever the viewer's sound preference changes. */
export function setSoundEnabled(on: boolean) {
  soundOn = on;
}

function audio(): AudioContext | null {
  if (!soundOn || typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One soft note: a sine (or triangle) with a quick attack and an exponential tail. */
function note(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported (iOS): a no-op */
  }
}

const EVENTS: Record<FeedbackEvent, () => void> = {
  // A woody tick as the clock starts.
  begin: () => {
    note(520, 0, 0.09, 0.05, "triangle");
    vibrate(8);
  },
  // A warm two-partial chime.
  correct: () => {
    note(880, 0, 0.22, 0.045);
    note(1320, 0.005, 0.16, 0.02);
    vibrate(6);
  },
  // A soft, low thud and a double buzz.
  miss: () => {
    note(150, 0, 0.18, 0.08, "triangle");
    vibrate([14, 60, 14]);
  },
  // A brighter chime on every fifth in a row.
  streak: () => {
    note(1047, 0, 0.18, 0.04);
    note(1568, 0.06, 0.22, 0.03);
  },
  roundEnd: () => {
    note(660, 0, 0.25, 0.04);
    note(880, 0.09, 0.3, 0.04);
    vibrate(12);
  },
  // A rising arpeggio for a personal best.
  best: () => {
    [784, 988, 1175, 1568].forEach((f, i) => note(f, i * 0.08, 0.32, 0.04));
    vibrate([10, 40, 10, 40, 24]);
  },
};

export const feedback = {
  play(event: FeedbackEvent) {
    try {
      EVENTS[event]();
    } catch {
      /* feedback must never break a drill */
    }
  },
};
