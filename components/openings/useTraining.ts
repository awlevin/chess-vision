"use client";

// Everything the trainer, home and repertoire screens need about one
// colour's repertoire: the cards, their review state, and today's counts.
import { useCallback, useMemo, useState } from "react";
import type { Color } from "@/lib/games";
import { buildGraph, buildRepertoire, leakCards, type Repertoire } from "@/lib/openings/repertoire";
import { isDue, LEARNED_BOX, type CardStates } from "@/lib/openings/srs";
import { useOpenings } from "./OpeningsProvider";
import { useRepertoireStore } from "./useRepertoireStore";

export interface TrainingCounts {
  /** Positions due now, new ones included. */
  due: number;
  /** Of those, never seen. */
  fresh: number;
  learned: number;
  /** Positions answered today that are no longer due. */
  doneToday: number;
}

export function useTraining(color: Color) {
  const { all } = useOpenings();
  const store = useRepertoireStore(color);
  const { overrides, cards: states } = store;
  const graph = useMemo(() => buildGraph(all, color), [all, color]);
  const rep = useMemo(() => buildRepertoire(graph, overrides), [graph, overrides]);
  const baseline = useMemo(() => {
    const mine = all.filter((g) => g.game.color === color);
    return mine.length ? mine.reduce((a, g) => a + g.points, 0) / mine.length : 0.5;
  }, [all, color]);

  const [clock, setClock] = useState(() => Date.now());
  /** Re-reads the time, so positions that came due since are counted. */
  const tick = useCallback(() => {
    const now = Date.now();
    setClock(now);
    return now;
  }, []);

  const counts = useMemo(() => countCards(rep, states, clock), [rep, states, clock]);
  const leaks = useMemo(() => leakCards(rep, states, baseline), [rep, states, baseline]);
  const nextDue = useMemo(() => {
    let min: number | null = null;
    for (const c of rep.order) {
      const st = states[c.key];
      if (st && st.due > clock && (min === null || st.due < min)) min = st.due;
    }
    return min;
  }, [rep, states, clock]);

  return { ...store, rep, baseline, counts, leaks, nextDue, clock, tick };
}

export function countCards(rep: Repertoire, states: CardStates, now: number): TrainingCounts {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const today = day.getTime();
  let due = 0, fresh = 0, learned = 0, doneToday = 0;
  for (const c of rep.order) {
    const st = states[c.key];
    if (!st) fresh++;
    if (isDue(st, now)) due++;
    else if (st && st.last >= today) doneToday++;
    if ((st?.box ?? 0) >= LEARNED_BOX) learned++;
  }
  return { due, fresh, learned, doneToday };
}
