"use client";

// Openings home: today's training, the one leak that matters most, and your
// openings at a glance. Everything else is a tap away.
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { Color } from "@/lib/games";
import { useCountUp } from "@/lib/delight";
import { explorerHref, trainerHref } from "@/lib/openings/links";
import type { ColorReport } from "@/lib/openings/report";
import { score } from "@/lib/openings/stats";
import { TopLeak } from "./Leaks";
import { useOpenings } from "./OpeningsProvider";
import { cap, ColorToggle, Empty, FilterChip, MoveText, Ring, ScorePill, SectionBar, styles as s, useColor } from "./ui";
import { useTraining } from "./useTraining";

const TOP_OPENINGS = 5;

export default function Home() {
  const { report } = useOpenings();
  const [color, setColor] = useColor();
  const r = report?.[color];
  return (
    <>
      <SectionBar />
      <div className={s.controls}>
        <ColorToggle value={color} onChange={setColor} />
        <FilterChip engine />
      </div>
      <Today color={color} />
      {!r || r.stats.n === 0 ? (
        <Empty title={`No games as ${cap(color)}`}>Try wider filters, or play a few as {cap(color)}.</Empty>
      ) : (
        <>
          <TopLeak leaks={r.leaks} color={color} baseline={score(r.stats)} />
          <YourOpenings r={r} />
          <TheoryLine r={r} />
        </>
      )}
    </>
  );
}

/** Today's training: the brass ring, how many are due, one big Start. */
function Today({ color }: { color: Color }) {
  const { rep, counts, loaded, nextDue } = useTraining(color);
  const shown = useCountUp(loaded ? counts.due : 0);
  if (rep.cards.size === 0) {
    return (
      <section className={s.hero}>
        <p className={s.ink2}>Play a few more games as {cap(color)} and your daily training shows up here.</p>
      </section>
    );
  }
  const total = counts.due + counts.doneToday;
  const progress = total ? counts.doneToday / total : 1;
  const caughtUp = counts.due === 0;
  return (
    <section className={s.hero} aria-labelledby="today-h">
      <Ring progress={loaded ? progress : 0} size={116}>
        <span className={s.ringNum} aria-hidden="true">{caughtUp ? "✓" : shown}</span>
        <span className={s.ringLabel} aria-hidden="true">{caughtUp ? "done" : "due"}</span>
      </Ring>
      <div className={s.heroText}>
        <h2 id="today-h" className={s.heading}>{caughtUp ? "All caught up" : "Today’s training"}</h2>
        <p className={s.ink2}>
          {caughtUp
            ? nextDue ? `Next review ${relativeDay(nextDue)}.` : "Nothing due."
            : counts.fresh === counts.due
              ? `${counts.due} new position${counts.due === 1 ? "" : "s"} to learn.`
              : `${counts.due - counts.fresh} to review${counts.fresh ? `, ${counts.fresh} new` : ""}.`}
        </p>
      </div>
      <Link className={`${s.primaryBtn} ${s.wide}`} href={trainerHref(color, { go: true })}>
        {caughtUp ? "Practise anyway" : "Start training"}
      </Link>
    </section>
  );
}

export function relativeDay(ms: number, now = Date.now()): string {
  const day = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86_400_000);
  const d = day(ms) - day(now);
  if (d <= 0) return "later today";
  if (d === 1) return "tomorrow";
  if (d < 7) return `in ${d} days`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function YourOpenings({ r }: { r: ColorReport }) {
  const [all, setAll] = useState(false);
  const rows = all ? r.families : r.families.slice(0, TOP_OPENINGS);
  return (
    <section className={s.section} aria-labelledby="openings-h">
      <h2 id="openings-h" className={s.heading}>Your openings</h2>
      <ul className={s.rows} aria-label={`Openings as ${cap(r.color)}`}>
        {rows.map((f, i) => (
          <li key={f.name} style={{ "--i": i } as CSSProperties}>
            <Link className={s.row} href={explorerHref(r.color, f.line)} data-opening={f.name}>
              <span className={s.rowMain}>{f.name}</span>
              <ScorePill stats={f.stats} />
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
      {r.families.length > TOP_OPENINGS && (
        <button type="button" className={s.textBtn} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `See all ${r.families.length}`}
        </button>
      )}
    </section>
  );
}

/** Where you leave theory, in one line. The detail lives in the explorer. */
function TheoryLine({ r }: { r: ColorReport }) {
  const exit = r.exits[0];
  if (!exit || !r.theory.avgExitMove) return null;
  const decided = r.theory.youLeft + r.theory.opponentLeft;
  const share = decided ? Math.round((100 * r.theory.youLeft) / decided) : 0;
  return (
    <p className={s.theory}>
      <BookIcon />
      <span>
        You leave book first in {share}% of games, most often with <MoveText san={exit.san} ply={exit.ply} />.{" "}
        <Link className={s.inlineLink} href={explorerHref(r.color, exit.line)}>Show me</Link>
      </span>
    </p>
  );
}

export function Chevron() {
  return (
    <svg className={s.chev} viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">
      <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5z" />
      <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z" />
    </svg>
  );
}
