"use client";

import { useEffect, useState } from "react";
import type { Color } from "@/lib/games";
import { cloudEval, formatEval, povScore, uciToSan, type CloudEval } from "@/lib/openings/engine";
import { moveLabel } from "@/lib/openings/format";
import { STORAGE_KEYS, usePersistent } from "@/lib/openings/persist";
import s from "./openings.module.css";

const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Whether leaks are checked with the Lichess cloud engine. Off by default: it sends positions to lichess.org. */
export function useEngineSetting() {
  return usePersistent(STORAGE_KEYS.engine, false, isBool);
}

/** The engine's view of one of your moves, with a way to drill its choice instead. */
export function EngineNote(props: {
  fen: string;
  ply: number;
  color: Color;
  playedUci: string;
  playedSan: string;
  onAdopt?: (move: { uci: string; san: string }) => void;
}) {
  const { fen, ply, color, playedUci, playedSan, onAdopt } = props;
  const [result, setResult] = useState<{ fen: string; value: CloudEval | null } | null>(null);
  useEffect(() => {
    let live = true;
    cloudEval(fen).then((value) => live && setResult({ fen, value }));
    return () => {
      live = false;
    };
  }, [fen]);

  if (!result || result.fen !== fen) return <p className={s.engine}>Asking the Lichess cloud engine…</p>;
  const ev = result.value;
  if (!ev || ev.pvs.length === 0) return <p className={s.engine}>No cloud evaluation for this position.</p>;

  const best = ev.pvs[0];
  const bestSan = uciToSan(fen, best.uci) ?? best.uci;
  const played = ev.pvs.find((p) => p.uci === playedUci);
  const yours = moveLabel(playedSan, ply);
  const worse = best.uci !== playedUci && (!played || povScore(best, color) - povScore(played, color) >= 0.5);
  return (
    <div className={s.engine}>
      <span>
        {`Engine (depth ${ev.depth}): best is ${moveLabel(bestSan, ply)} ${formatEval(best)}`}
        {best.uci === playedUci
          ? ", which is what you play."
          : played
            ? `; your ${yours} is ${formatEval(played)}.`
            : `; your ${yours} isn't in its top ${ev.pvs.length}.`}
      </span>
      {worse && onAdopt && (
        <button type="button" className={s.textBtn} onClick={() => onAdopt({ uci: best.uci, san: bestSan })}>
          {`Drill ${moveLabel(bestSan, ply)} instead`}
        </button>
      )}
    </div>
  );
}
