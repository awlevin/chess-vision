"use client";

import { useCallback } from "react";
import type { Color } from "@/lib/games";
import { STORAGE_KEYS, usePersistent } from "@/lib/openings/persist";
import { isOverrides, NO_OVERRIDES, type Override } from "@/lib/openings/repertoire";
import { isCardStates, NO_CARD_STATES } from "@/lib/openings/srs";

/** The trainer's saved state for one colour: adopted moves and review progress. */
export function useRepertoireStore(color: Color) {
  const [overrides, setOverrides, overridesLoaded] = usePersistent(STORAGE_KEYS.repertoire(color), NO_OVERRIDES, isOverrides);
  const [cards, setCards, cardsLoaded] = usePersistent(STORAGE_KEYS.cards(color), NO_CARD_STATES, isCardStates);

  /** Adopt `move` at a position (or null to go back to the move you usually play). Resets its review progress. */
  const adopt = useCallback(
    (key: string, move: Override | null) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (move) next[key] = { uci: move.uci, san: move.san };
        else delete next[key];
        return next;
      });
      setCards((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [setOverrides, setCards],
  );

  return { overrides, cards, setCards, adopt, loaded: overridesLoaded && cardsLoaded };
}
