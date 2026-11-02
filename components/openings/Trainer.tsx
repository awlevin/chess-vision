"use client";

// Trainer: a focus mode for playing your side of the lines you really reach.
// A session is up to SESSION_SIZE target positions: the due ones (Review),
// the worst ones (Fix my leaks, ?mode=leaks), one line (?line=e4 e5 Nf3), or
// the least recently seen (Practise). Opponent replies are drawn by how
// often your opponents played them, steered towards targets you haven't
// answered yet. See lib/openings/repertoire.ts and lib/openings/srs.ts.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard, type BoardArrow, type BoardEffect, type BoardMove } from "@/components/board";
import type { Color } from "@/lib/games";
import { fenFromKey, START_KEY } from "@/lib/chess/fast";
import { burst, feedback, haptic, playSound, soundForSan } from "@/lib/delight";
import { plural } from "@/lib/openings/format";
import { homeHref, repertoireHref, trainerHref } from "@/lib/openings/links";
import { leakCards, onLine, pickReply, targetsBelow, type Card, type RepMove } from "@/lib/openings/repertoire";
import { isDue, review } from "@/lib/openings/srs";
import { relativeDay } from "./Home";
import { cap, ColorToggle, Empty, Knight, LineText, MoveText, Ring, SectionBar, styles as s, useColor } from "./ui";
import { useTraining } from "./useTraining";

type Mode = "review" | "leaks" | "line" | "practice";
type Result = "hit" | "miss";

const SESSION_SIZE = 10;
const OPPONENT_DELAY = 520;
const AFTER_CORRECT_DELAY = 480;
const squaresOf = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4) });

interface Session {
  mode: Mode;
  /** The positions this session clears, in no particular order. */
  targets: Set<string>;
  /** First answer at each target, in the order given. */
  results: { key: string; result: Result }[];
  streak: number;
  best: number;
  levelled: number;
}

type Feedback = { kind: "correct"; san: string; ply: number } | { kind: "miss"; played: string; expected: RepMove };

interface Line {
  key: string;
  ply: number;
  sans: string[];
  last: { from: string; to: string } | null;
  phase: "opponent" | "you" | "retry" | "done";
  feedback: Feedback | null;
  correct: number;
  missed: number;
  below: Set<string>;
  end?: "line" | "session" | "caught-up" | "no-leaks";
}

export default function Trainer() {
  const [color, setColor] = useColor();
  const params = useSearchParams();
  const lineParam = params.get("line") ?? "";
  const mode: Mode = lineParam ? "line" : params.get("mode") === "leaks" ? "leaks" : "review";
  // A new colour, mode or line is a fresh trainer.
  return <TrainerSession key={`${color}|${mode}|${lineParam}`} color={color} setColor={setColor} mode={mode} lineSans={lineParam.split(" ").filter(Boolean)} go={params.get("go") === "1"} />;
}

function TrainerSession({ color, setColor, mode, lineSans, go }: { color: Color; setColor: (c: Color) => void; mode: Mode; lineSans: string[]; go: boolean }) {
  const t = useTraining(color);
  const { rep, cards: states, setCards, loaded, counts, leaks, nextDue } = t;

  const [line, setLine] = useState<Line | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [effect, setEffect] = useState<BoardEffect | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Timers read the latest state through these.
  const latest = useRef({ session });
  useEffect(() => {
    latest.current = { session };
  });

  const focus = useMemo(() => (lineSans.length ? onLine(lineSans) : null), [lineSans]);

  // ---- choosing what a session drills ----

  function pickTargets(m: Mode, now: number): Card[] {
    if (m === "leaks") return leakCards(rep, states, t.baseline, SESSION_SIZE);
    if (m === "line") return rep.order.filter((c) => focus?.(c)).slice(0, SESSION_SIZE);
    if (m === "practice") return [...rep.order].sort((a, z) => (states[a.key]?.last ?? 0) - (states[z.key]?.last ?? 0)).slice(0, SESSION_SIZE);
    return rep.order.filter((c) => isDue(states[c.key], now)).slice(0, SESSION_SIZE);
  }

  /** Targets of `sess` not answered yet, as a reachability set. */
  function remaining(sess: Session) {
    const done = new Set(sess.results.map((r) => r.key));
    return targetsBelow(rep, (c) => sess.targets.has(c.key) && !done.has(c.key));
  }

  function startSession(m: Mode) {
    clearTimers();
    setEffect(null);
    const now = t.tick();
    const picked = pickTargets(m, now);
    const reach = targetsBelow(rep, (c) => picked.includes(c));
    const sess: Session = { mode: m, targets: new Set(picked.filter((c) => reach.has(c.key)).map((c) => c.key)), results: [], streak: 0, best: 0, levelled: 0 };
    setSession(sess);
    latest.current.session = sess;
    startLine(sess);
  }

  function startLine(sess: Session) {
    clearTimers();
    setEffect(null);
    const below = remaining(sess);
    const l: Line = { key: START_KEY, ply: 0, sans: [], last: null, phase: "opponent", feedback: null, correct: 0, missed: 0, below };
    if (!below.has(START_KEY)) {
      const end = sess.results.length ? "session" : sess.mode === "leaks" || sess.mode === "line" ? "no-leaks" : "caught-up";
      setLine({ ...l, phase: "done", end });
      return;
    }
    proceed(l);
  }

  function finishLine(l: Line) {
    const sess = latest.current.session;
    const more = sess ? remaining(sess).has(START_KEY) : false;
    setLine({ ...l, phase: "done", end: more ? "line" : "session" });
  }

  function proceed(l: Line) {
    if (rep.cards.has(l.key)) {
      if (!l.below.has(l.key)) return finishLine(l);
      return setLine({ ...l, phase: "you" });
    }
    const reply = pickReply(rep, l.key, l.below);
    if (!reply) return finishLine(l);
    setLine({ ...l, phase: "opponent" });
    timers.current.push(
      setTimeout(() => {
        playSound(soundForSan(reply.san));
        proceed({ ...l, key: reply.to, ply: l.ply + 1, sans: [...l.sans, reply.san], last: squaresOf(reply.uci), feedback: null, phase: "opponent" });
      }, OPPONENT_DELAY),
    );
  }

  function advanceAfter(l: Line, move: RepMove, uci: string, graded: boolean) {
    const next: Line = {
      ...l,
      key: move.to,
      ply: l.ply + 1,
      sans: [...l.sans, move.san],
      last: squaresOf(uci),
      feedback: graded ? { kind: "correct", san: move.san, ply: l.ply } : null,
      phase: "opponent",
      correct: l.correct + (graded ? 1 : 0),
    };
    setLine(next);
    timers.current.push(setTimeout(() => proceed(next), AFTER_CORRECT_DELAY));
  }

  function record(card: Card, correct: boolean) {
    const now = Date.now();
    const prev = states[card.key];
    const nextState = review(prev, correct, now);
    setCards((all) => ({ ...all, [card.key]: review(all[card.key], correct, now) }));
    setSession((sess) => {
      if (!sess) return sess;
      const first = sess.targets.has(card.key) && !sess.results.some((r) => r.key === card.key);
      const streak = correct ? sess.streak + 1 : 0;
      const next: Session = {
        ...sess,
        results: first ? [...sess.results, { key: card.key, result: correct ? "hit" : "miss" }] : sess.results,
        streak,
        best: Math.max(sess.best, streak),
        levelled: sess.levelled + (correct && nextState.box > (prev?.box ?? 0) ? 1 : 0),
      };
      latest.current.session = next;
      return next;
    });
  }

  function onMove(m: BoardMove) {
    if (!line || (line.phase !== "you" && line.phase !== "retry")) return;
    const card = rep.cards.get(line.key);
    if (!card) return;
    const expected = card.move;
    if (m.uci === expected.uci) {
      playSound(soundForSan(m.san));
      if (line.phase === "you") {
        record(card, true);
        setEffect({ kind: "glow", square: m.to, id: Date.now() });
        timers.current.push(setTimeout(() => feedback("correct"), 90));
      } else setEffect(null);
      advanceAfter(line, expected, m.uci, line.phase === "you");
      return;
    }
    if (line.phase === "you") record(card, false);
    feedback("wrong");
    setEffect({ kind: "miss", square: m.to, id: Date.now() });
    setLine({ ...line, phase: "retry", missed: line.missed + (line.phase === "you" ? 1 : 0), feedback: { kind: "miss", played: m.san, expected } });
  }

  function showMe() {
    if (!line || line.phase !== "retry") return;
    const card = rep.cards.get(line.key);
    if (!card) return;
    playSound(soundForSan(card.move.san));
    setEffect(null);
    advanceAfter(line, card.move, card.move.uci, false);
  }

  function nextLine() {
    if (!session || !line || line.end === "session" || line.end === "caught-up" || line.end === "no-leaks") startSession("practice");
    else startLine(session);
  }

  function endSession() {
    clearTimers();
    setLine(null);
    setSession(null);
    setEffect(null);
  }

  // Arriving with ?go=1 (from Home or a leak's "Fix it") starts at once.
  const autostarted = useRef(false);
  const startRef = useRef(() => startSession(mode));
  useEffect(() => {
    startRef.current = () => startSession(mode);
  });
  useEffect(() => {
    if (!go || !loaded || rep.cards.size === 0) return;
    const id = setTimeout(() => {
      if (autostarted.current) return;
      autostarted.current = true;
      const q = new URLSearchParams(window.location.search);
      q.delete("go");
      window.history.replaceState(null, "", `?${q.toString()}`);
      startRef.current();
    }, 150);
    return () => clearTimeout(id);
  }, [go, loaded, rep]);

  // ---- render ----

  if (rep.cards.size === 0) {
    return (
      <>
        <SectionBar />
        <div className={s.controls}><ColorToggle value={color} onChange={setColor} /></div>
        <Empty title="Not enough games yet">{`Positions you reach 3 times as ${cap(color)} become drills. Play a few more and come back.`}</Empty>
      </>
    );
  }

  const card = line ? rep.cards.get(line.key) : undefined;
  const fen = fenFromKey(line?.key ?? START_KEY, line?.ply ?? 0);
  const yourTurn = line?.phase === "you" || line?.phase === "retry";
  const arrows: BoardArrow[] = [];
  if (line?.phase === "retry" && line.feedback?.kind === "miss") {
    const e = squaresOf(line.feedback.expected.uci);
    arrows.push({ from: e.from, to: e.to, tone: "good" });
  }
  const active = !!line;

  return (
    <div className={s.trainer} data-testid="trainer" data-phase={line?.phase ?? "idle"} data-expected-move={yourTurn && card ? card.move.uci : undefined}>
      {active && session ? (
        <FocusBar session={session} onEnd={endSession} />
      ) : (
        <>
          <SectionBar />
          <div className={s.controls}>
            <ColorToggle value={color} onChange={setColor} />
            {mode !== "review" && <Link className={s.textBtn} href={trainerHref(color)}>Back to review</Link>}
          </div>
        </>
      )}

      <div className={s.boardWrap}>
        <Chessboard
          fen={fen}
          orientation={color}
          interactive={yourTurn ? color : false}
          onMove={onMove}
          lastMove={line?.last ?? null}
          arrows={arrows}
          effect={effect}
          label="Training board"
        />
      </div>

      {!line ? (
        <Idle
          mode={mode}
          color={color}
          loaded={loaded}
          due={counts.due}
          fresh={counts.fresh}
          progress={counts.due + counts.doneToday ? counts.doneToday / (counts.due + counts.doneToday) : 1}
          leakCount={leaks.length}
          lineSans={lineSans}
          onStart={() => startSession(mode)}
        />
      ) : line.phase === "done" && line.end === "session" && session ? (
        <SessionDone session={session} nextDue={nextDue} color={color} onNext={nextLine} />
      ) : (
        <Prompt line={line} card={card} onShowMe={showMe} onNext={nextLine} nextDue={nextDue} />
      )}
    </div>
  );
}

// ---------- pieces ----------

function FocusBar({ session, onEnd }: { session: Session; onEnd: () => void }) {
  const goal = session.targets.size;
  return (
    <div className={s.focusBar}>
      <button type="button" className={s.iconBtn} onClick={onEnd} aria-label="End session">
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      <ol className={s.dots} aria-label={`${session.results.length} of ${goal} done`}>
        {Array.from({ length: goal }, (_, i) => {
          const r = session.results[i];
          return <li key={i} className={r ? (r.result === "hit" ? s.dotHit : s.dotMiss) : i === session.results.length ? s.dotNext : ""} data-result={r?.result} />;
        })}
      </ol>
      <span className={s.streak} aria-live="polite" aria-label={`Streak ${session.streak}`}>
        {session.streak >= 2 && (
          <span key={session.streak} className={s.streakPop}>
            <svg viewBox="0 0 16 20" width="12" height="15" aria-hidden="true"><path d="M8 1c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-5 1-9z" fill="currentColor" /></svg>
            {session.streak}
          </span>
        )}
      </span>
    </div>
  );
}

function Idle(props: {
  mode: Mode;
  color: Color;
  loaded: boolean;
  due: number;
  fresh: number;
  progress: number;
  leakCount: number;
  lineSans: string[];
  onStart: () => void;
}) {
  const { mode, color, loaded, due, fresh, leakCount } = props;
  if (mode === "line" || mode === "leaks") {
    return (
      <section className={s.hero} aria-labelledby="idle-h">
        <div className={s.heroText}>
          <h2 id="idle-h" className={s.heading}>{mode === "line" ? "Drill this line" : "Fix my leaks"}</h2>
          <p className={s.ink2}>
            {mode === "line" ? <LineText sans={props.lineSans} /> : `The ${plural(leakCount, "position")} where you go wrong most.`}
          </p>
        </div>
        <button type="button" className={`${s.primaryBtn} ${s.wide}`} onClick={props.onStart} disabled={!loaded}>
          {mode === "line" ? "Start drill" : "Start fixing leaks"}
        </button>
      </section>
    );
  }
  return (
    <section className={s.hero} aria-labelledby="idle-h">
      <Ring progress={loaded ? props.progress : 0} size={116}>
        {loaded && <span className={s.ringNum} data-testid="due-count">{due}</span>}
        <span className={s.ringLabel}>due</span>
      </Ring>
      <div className={s.heroText}>
        <h2 id="idle-h" className={s.heading}>{due ? "Today’s training" : "All caught up"}</h2>
        <p className={s.ink2}>{due ? (fresh === due ? `${due} new to learn as ${cap(color)}.` : `${due - fresh} to review${fresh ? `, ${fresh} new` : ""}.`) : "Practise anyway, or come back tomorrow."}</p>
      </div>
      <button type="button" className={`${s.primaryBtn} ${s.wide}`} onClick={props.onStart} disabled={!loaded}>
        Start training
      </button>
      <div className={s.quietLinks}>
        {leakCount > 0 && <Link className={s.textBtn} href={trainerHref(color, { mode: "leaks" })}>Fix my leaks</Link>}
        <Link className={s.textBtn} href={repertoireHref(color)}>Edit repertoire</Link>
      </div>
    </section>
  );
}

function Prompt({ line, card, onShowMe, onNext, nextDue }: { line: Line; card: Card | undefined; onShowMe: () => void; onNext: () => void; nextDue: number | null }) {
  const { phase, feedback: fb } = line;
  if (phase === "done") {
    const title =
      line.end === "caught-up" ? "All caught up" : line.end === "no-leaks" ? "Nothing to fix here" : line.missed ? "Line done" : "Clean line";
    const sub =
      line.end === "caught-up"
        ? `Nothing due${nextDue ? `. Next review ${relativeDay(nextDue)}` : ""}.`
        : line.end === "no-leaks"
          ? "No weak spots on this path right now."
          : `${line.correct} of ${line.correct + line.missed} first time.`;
    return (
      <div className={s.prompt} role="status">
        <p className={s.promptLine}>
          <strong>{title}</strong> <span className={s.ink2}>{sub}</span>
        </p>
        <button type="button" className={`${s.primaryBtn} ${s.wide}`} onClick={onNext}>
          {line.end === "line" ? "Next line" : "Practise anyway"}
        </button>
      </div>
    );
  }
  if (phase === "retry" && fb?.kind === "miss") {
    return (
      <div className={`${s.prompt} ${s.promptMiss}`} role="status">
        <p className={s.promptLine}>
          <strong>Not quite.</strong>{" "}
          <span>
            It&apos;s <b data-testid="expected-move" className={s.expected}><MoveText san={fb.expected.san} ply={line.ply} /></b>
          </span>
        </p>
        <button type="button" className={s.textBtn} onClick={onShowMe}>Show me</button>
      </div>
    );
  }
  if (phase === "you") {
    return (
      <div className={s.prompt} role="status">
        <p className={s.promptLine}>
          <strong>Your move</strong>{" "}
          <span className={s.ink3}>{card?.adopted ? "· your new move" : card ? `· seen in ${plural(card.n, "game")}` : ""}</span>
        </p>
        {line.sans.length > 0 && <LineText sans={line.sans} />}
      </div>
    );
  }
  return (
    <div className={s.prompt} role="status">
      <p className={s.promptLine}>
        {fb?.kind === "correct" ? (
          <>
            <strong className={s.good}>Good.</strong> <MoveText san={fb.san} ply={fb.ply} />
          </>
        ) : (
          <span className={s.ink2}>They&apos;re thinking…</span>
        )}
      </p>
      {line.sans.length > 0 && <LineText sans={line.sans} />}
    </div>
  );
}

function SessionDone({ session, nextDue, color, onNext }: { session: Session; nextDue: number | null; color: Color; onNext: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const hits = session.results.filter((r) => r.result === "hit").length;
  const total = session.results.length;
  useEffect(() => {
    feedback("complete");
    if (ref.current) burst(ref.current, { count: hits === total ? 64 : 40 });
    else haptic("success");
  }, [hits, total]);
  const parts = [
    session.levelled ? `${plural(session.levelled, "position")} levelled up` : null,
    session.best >= 3 ? `best streak ${session.best}` : null,
    nextDue ? `next review ${relativeDay(nextDue)}` : null,
  ].filter(Boolean);
  return (
    <section ref={ref} className={s.complete} role="status" aria-labelledby="done-h">
      <Knight size={40} />
      <p className={s.completeNum}>
        <span className={s.display}>{hits}</span>
        <span className={s.ink3}> of {total}</span>
      </p>
      <h2 id="done-h" className={s.heading}>{hits === total ? "Flawless. Session complete" : "Session complete"}</h2>
      {parts.length > 0 && <p className={s.ink2}>{parts.join(" · ")}</p>}
      <Link className={`${s.primaryBtn} ${s.wide}`} href={homeHref(color)}>Done</Link>
      <button type="button" className={s.textBtn} onClick={onNext}>Next line</button>
    </section>
  );
}
