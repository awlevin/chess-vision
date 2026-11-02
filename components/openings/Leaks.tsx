"use client";

// Leaks: the biggest one as a card on the home screen, and every one of
// them at /openings/leaks. "Fix it" adopts the better move (for a move
// choice) and starts a drill on that line.
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { Chessboard } from "@/components/board";
import type { Color } from "@/lib/games";
import { fenFromKey, FastPosition } from "@/lib/chess/fast";
import { nameOfLine, type Book } from "@/lib/openings/book";
import { explorerHref, trainerHref } from "@/lib/openings/links";
import type { Leak } from "@/lib/openings/report";
import { score } from "@/lib/openings/stats";
import { EngineNote, useEngineSetting } from "./EngineNote";
import { useOpenings } from "./OpeningsProvider";
import { cap, ColorToggle, Empty, FilterChip, LineText, MoveText, ScorePill, SectionBar, styles as s, useColor } from "./ui";
import { useRepertoireStore } from "./useRepertoireStore";

/** Adopts a leak's better move (if it has one) and drills its line. */
export function useFixLeak(color: Color) {
  const router = useRouter();
  const { adopt } = useRepertoireStore(color);
  return (leak: Leak, move?: { uci: string; san: string }) => {
    const pick = move ?? leak.better;
    if (leak.kind === "move" && leak.positionKey && pick) adopt(leak.positionKey, { uci: pick.uci, san: pick.san });
    router.push(trainerHref(color, { line: leak.line, go: true }));
  };
}

/** The position a leak is about: before your move, or where the opening is reached. */
function leakFen(leak: Leak): string {
  if (leak.positionKey) return fenFromKey(leak.positionKey, leak.line.length);
  const pos = FastPosition.start();
  for (const san of leak.line) if (!pos.play(san)) break;
  return pos.fen();
}

function headline(leak: Leak, book: Book | null): string {
  const named = book ? nameOfLine(book, leak.line) : null;
  return named ? `Your ${named.family} is leaking` : "A leak worth fixing";
}

/** The home screen's one big leak: a board thumbnail, one warm sentence, Fix it. */
export function TopLeak({ leaks, color, baseline }: { leaks: Leak[]; color: Color; baseline: number }) {
  const { book } = useOpenings();
  const fix = useFixLeak(color);
  const leak = leaks[0];
  if (!leak) {
    return (
      <section className={s.section} aria-labelledby="leak-h">
        <h2 id="leak-h" className={s.heading}>No leaks</h2>
        <p className={s.ink2}>Nothing scores clearly worse than it should. Lovely.</p>
      </section>
    );
  }
  const arrows = leak.better ? [{ from: leak.better.uci.slice(0, 2), to: leak.better.uci.slice(2, 4), tone: "good" as const }] : [];
  return (
    <section className={s.section} aria-labelledby="leak-h">
      <div className={s.leakCard} data-leak={leak.kind === "move" ? "move-choice" : "opening"}>
        <div className={s.thumb}>
          <Chessboard fen={leakFen(leak)} orientation={color} coordinates={false} arrows={arrows} framed={false} label="Leak position" />
        </div>
        <div className={s.leakBody}>
          <h2 id="leak-h" className={s.heading}>{headline(leak, book)}</h2>
          <LeakSentence leak={leak} baseline={baseline} />
        </div>
        <div className={s.leakActions}>
          <button type="button" className={s.tonalBtn} onClick={() => fix(leak)}>Fix it</button>
          <Link className={s.textBtn} href={explorerHref(color, leak.line)}>Explore</Link>
          {leaks.length > 1 && (
            <Link className={`${s.textBtn} ${s.push}`} href={`/openings/leaks?color=${color}`}>
              See all {leaks.length}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function LeakSentence({ leak, baseline }: { leak: Leak; baseline: number }) {
  const ply = leak.line.length;
  if (leak.kind === "move" && leak.played && leak.better) {
    return (
      <p className={s.sentence}>
        After <LineText sans={leak.line} /> you usually play <MoveText san={leak.played.san} ply={ply} /> and score{" "}
        <b>{Math.round(score(leak.played.stats) * 100)}%</b>. <MoveText san={leak.better.san} ply={ply} /> scores{" "}
        <b>{Math.round(score(leak.better.stats) * 100)}%</b>.
      </p>
    );
  }
  const v = score(leak.stats);
  return (
    <p className={s.sentence}>
      <b>{Math.round(v * 100)}%</b> in {leak.stats.n} games, {Math.max(1, Math.round((baseline - v) * 100))} points under your usual. Let&apos;s drill it.
    </p>
  );
}

// ---------- /openings/leaks ----------

export default function LeaksPage() {
  const { report } = useOpenings();
  const [color, setColor] = useColor();
  const r = report?.[color];
  const [engineOn] = useEngineSetting();
  const fix = useFixLeak(color);
  const baseline = r ? score(r.stats) : 0.5;
  const leaks = r?.leaks ?? [];

  return (
    <>
      <SectionBar />
      <div className={s.controls}>
        <ColorToggle value={color} onChange={setColor} />
        <FilterChip engine />
      </div>
      {!r || r.stats.n === 0 ? (
        <Empty title={`No games as ${cap(color)}`}>Try wider filters.</Empty>
      ) : (
        <>
          <header className={s.pageHead}>
            <span className={s.display}>{leaks.length}</span>
            <h1 className={s.pageTitle}>{leaks.length === 1 ? "leak" : "leaks"} as {cap(color)}</h1>
          </header>
          {leaks.length === 0 ? (
            <Empty title="Nothing leaking">Every opening scores about what it should. Keep it up.</Empty>
          ) : (
            <ol className={s.leakList}>
              {leaks.map((leak, i) => (
                <LeakRow key={leak.id} leak={leak} color={color} baseline={baseline} index={i} engine={engineOn} onFix={(m) => fix(leak, m)} />
              ))}
            </ol>
          )}
          <div className={s.footActions}>
            {leaks.length > 0 && <Link className={s.primaryBtn} href={trainerHref(color, { mode: "leaks", go: true })}>Drill my worst spots</Link>}
          </div>
        </>
      )}
    </>
  );
}

function LeakRow({ leak, color, baseline, index, engine, onFix }: { leak: Leak; color: Color; baseline: number; index: number; engine: boolean; onFix: (m?: { uci: string; san: string }) => void }) {
  const ply = leak.line.length;
  const { book } = useOpenings();
  const named = book ? nameOfLine(book, leak.line) : null;
  const attrs =
    leak.kind === "move" && leak.played && leak.better
      ? {
          "data-leak": "move-choice",
          "data-line": leak.line.join(" "),
          "data-usual": leak.played.san,
          "data-better": leak.better.san,
          "data-usual-games": leak.played.stats.n,
          "data-usual-score": Math.round(score(leak.played.stats) * 100),
          "data-better-games": leak.better.stats.n,
          "data-better-score": Math.round(score(leak.better.stats) * 100),
        }
      : { "data-leak": "opening", "data-line": leak.line.join(" ") };
  return (
    <li className={s.leakItem} style={{ "--i": index } as CSSProperties} {...attrs}>
      <div className={s.leakTop}>
        <span className={s.leakName}>{named?.name ?? "Unnamed line"}</span>
        <LineText sans={leak.line} />
      </div>
      {leak.kind === "move" && leak.played && leak.better ? (
        <dl className={s.compare}>
          <div>
            <dt>You play <MoveText san={leak.played.san} ply={ply} /></dt>
            <dd><ScorePill stats={leak.played.stats} /></dd>
          </div>
          <div>
            <dt>Try <MoveText san={leak.better.san} ply={ply} /></dt>
            <dd><ScorePill stats={leak.better.stats} /></dd>
          </div>
        </dl>
      ) : (
        <dl className={s.compare}>
          <div>
            <dt>This opening</dt>
            <dd><ScorePill stats={leak.stats} /></dd>
          </div>
          <div>
            <dt>Your usual</dt>
            <dd className={s.ink3}>{Math.round(baseline * 100)}%</dd>
          </div>
        </dl>
      )}
      {engine && leak.positionKey && leak.played && (
        <EngineNote fen={fenFromKey(leak.positionKey, ply)} ply={ply} color={color} playedUci={leak.played.uci} playedSan={leak.played.san} onAdopt={onFix} />
      )}
      <div className={s.leakActions}>
        <button type="button" className={s.tonalBtn} onClick={() => onFix()}>Fix it</button>
        <Link className={s.textBtn} href={explorerHref(color, leak.line)}>Explore</Link>
      </div>
    </li>
  );
}
