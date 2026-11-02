"use client";

// The repertoire editor, off the trainer's main screen: every position you
// drill, the move you play there, and how well you know it. Tap a row to
// switch to another move you've played.
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { MAX_BOX, isDue } from "@/lib/openings/srs";
import { trainerHref } from "@/lib/openings/links";
import type { Card, RepMove } from "@/lib/openings/repertoire";
import { cap, ColorToggle, Empty, LineText, MoveText, ScorePill, SectionBar, styles as s, useColor } from "./ui";
import { useTraining } from "./useTraining";

export default function Repertoire() {
  const [color, setColor] = useColor();
  const { rep, cards: states, adopt, counts, clock } = useTraining(color);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <SectionBar />
      <div className={s.controls}>
        <ColorToggle value={color} onChange={setColor} />
        <Link className={s.textBtn} href={trainerHref(color)}>Back to training</Link>
      </div>
      {rep.cards.size === 0 ? (
        <Empty title="No repertoire yet">{`Positions you reach 3 times as ${cap(color)} show up here.`}</Empty>
      ) : (
        <>
          <header className={s.pageHead}>
            <span className={s.display}>{rep.cards.size}</span>
            <h1 className={s.pageTitle}>positions as {cap(color)}</h1>
            <p className={s.ink3}>{counts.learned} learned · tap one to change your move</p>
          </header>
          <ul className={s.repList}>
            {rep.order.map((c, i) => {
              const st = states[c.key];
              const isOpen = open === c.key;
              return (
                <li key={c.key} data-position={c.key} style={{ "--i": Math.min(i, 12) } as CSSProperties}>
                  <button type="button" className={s.repRow} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.key)}>
                    <span className={s.repLine}><LineText sans={c.line} /></span>
                    <span className={s.repMove}><MoveText san={c.move.san} ply={c.ply} /></span>
                    <Pips box={st?.box ?? 0} />
                    <span className={s.repMeta}>
                      {[st && isDue(st, clock) ? "due" : null, c.adopted ? "your new move" : c.suggestion ? `${c.suggestion.san} scores better` : null].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  {isOpen && <Alternatives card={c} onAdopt={(m) => adopt(c.key, m)} />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function Alternatives({ card, onAdopt }: { card: Card; onAdopt: (m: RepMove | null) => void }) {
  // One-off moves are noise; keep the suggestion and the usual move whatever their count.
  const options = card.played.filter((m) => m.stats.n >= 2 || m === card.suggestion || m === card.usual);
  return (
    <div className={s.alts} role="group" aria-label="Moves you've played here">
      {options.map((m) => {
        const current = m.uci === card.move.uci;
        return (
          <button
            key={m.uci}
            type="button"
            className={s.alt}
            aria-pressed={current}
            aria-label={`Drill ${m.san}${m === card.usual ? " (your usual)" : ""}`}
            onClick={() => !current && onAdopt(m.uci === card.usual.uci ? null : m)}
          >
            <MoveText san={m.san} ply={card.ply} number={false} />
            <ScorePill stats={m.stats} />
            {m === card.suggestion && !current && <span className={s.brassText}>better</span>}
          </button>
        );
      })}
    </div>
  );
}

function Pips({ box }: { box: number }) {
  return (
    <span className={s.pips} role="img" aria-label={`Level ${box} of ${MAX_BOX}`}>
      {Array.from({ length: MAX_BOX }, (_, i) => <i key={i} className={i < box ? s.on : ""} />)}
    </span>
  );
}
