// Leitner-style spaced repetition for repertoire positions.
//
// Each position sits in a box. A correct answer on a due card moves it up a
// box and pushes it out by that box's interval; a miss drops it to box 0 and
// brings it back after a couple of minutes, so it returns in the same
// session. A correct answer on a card that isn't due yet (you passed it on
// the way to another one) is counted but doesn't move it up, so walking
// the same first moves every line doesn't inflate them.

export interface CardState {
  box: number;
  /** Unix ms when it's next due. */
  due: number;
  seen: number;
  lapses: number;
  /** Unix ms of the last answer. */
  last: number;
}

export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];
export const MAX_BOX = INTERVAL_DAYS.length - 1;
/** A missed position comes back after this long. */
export const RETRY_MS = 2 * 60 * 1000;
/** Box at which a position counts as learned. */
export const LEARNED_BOX = 3;
const DAY = 86_400_000;

export const isDue = (s: CardState | undefined, now: number) => !s || s.due <= now;

export function review(s: CardState | undefined, correct: boolean, now: number): CardState {
  const prev = s ?? { box: 0, due: now, seen: 0, lapses: 0, last: 0 };
  if (!correct) return { box: 0, due: now + RETRY_MS, seen: prev.seen + 1, lapses: prev.lapses + 1, last: now };
  if (!isDue(s, now)) return { ...prev, seen: prev.seen + 1, last: now };
  const box = Math.min(prev.box + 1, MAX_BOX);
  return { box, due: now + INTERVAL_DAYS[box] * DAY, seen: prev.seen + 1, lapses: prev.lapses, last: now };
}

export type CardStates = Record<string, CardState>;

export const NO_CARD_STATES: CardStates = {};

export function isCardStates(v: unknown): v is CardStates {
  return !!v && typeof v === "object" && Object.values(v).every((s) => s && typeof s === "object" && typeof (s as CardState).due === "number");
}
