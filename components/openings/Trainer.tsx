"use client";

// Trainer: play your side of the lines you actually reach. Opponent moves
// are picked by how often your opponents played them, steered towards the
// positions that need practice: due ones in Review, the worst ones in Fix
// my leaks. See lib/openings/repertoire.ts and lib/openings/srs.ts.
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard, type BoardArrow, type BoardMarker, type BoardMove } from "@/components/board";
import type { Color } from "@/lib/games";
import { fenFromKey, START_KEY } from "@/lib/chess/fast";
import { formatLine, moveLabel, pct, plural, shortDate } from "@/lib/openings/format";
import {
  buildGraph,
  buildRepertoire,
  leakCards,
  pickReply,
  targetsBelow,
  type Card,
  type RepMove,
  type Repertoire,
} from "@/lib/openings/repertoire";
import { isDue, LEARNED_BOX, MAX_BOX, review, type CardStates } from "@/lib/openings/srs";
import { score } from "@/lib/openings/stats";
import { useOpenings } from "./OpeningsProvider";
import { ColorToggle, styles as s } from "./ui";
import { useRepertoireStore } from "./useRepertoireStore";

type Mode = "review" | "leaks" | "practice";

type Feedback =
  | { kind: "correct"; san: string; square: string }
  | { kind: "miss"; played: string; square: string; expected: RepMove };

interface Line {
  mode: Mode;
  key: string;
  ply: number;
  sans: string[];
  last: { from: string; to: string } | null;
  phase: "opponent" | "you" | "retry" | "done";
  feedback: Feedback | null;
  correct: number;
  missed: number;
  /** Positions from which a target can still be reached. */
  below: Set<string>;
  end?: "complete" | "caught-up" | "no-leaks";
}

const OPPONENT_DELAY = 550;
const AFTER_CORRECT_DELAY = 420;
const squaresOf = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
const cap = (c: Color) => (c === "white" ? "White" : "Black");

export default function Trainer() {
  const { all } = useOpenings();
  const params = useSearchParams();
  const [color, setColor] = useState<Color>(params.get("color") === "black" ? "black" : "white");
  const [mode, setMode] = useState<"review" | "leaks">(params.get("mode") === "leaks" ? "leaks" : "review");
  const store = useRepertoireStore(color);
  const { overrides, cards: states, setCards, adopt, loaded } = store;

  const graph = useMemo(() => buildGraph(all, color), [all, color]);
  const rep = useMemo(() => buildRepertoire(graph, overrides), [graph, overrides]);
  const baseline = useMemo(() => {
    const mine = all.filter((g) => g.game.color === color);
    return mine.length ? mine.reduce((a, g) => a + g.points, 0) / mine.length : 0.5;
  }, [all, color]);

  const [clock, setClock] = useState(() => Date.now());
  const [line, setLine] = useState<Line | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const counts = useMemo(() => {
    let due = 0, fresh = 0, learned = 0;
    for (const c of rep.order) {
      const st = states[c.key];
      if (!st) fresh++;
      else if (isDue(st, clock)) due++;
      if ((st?.box ?? 0) >= LEARNED_BOX) learned++;
    }
    return { due, fresh, learned };
  }, [rep, states, clock]);
  const leaks = useMemo(() => leakCards(rep, states, baseline), [rep, states, baseline]);

  const reset = () => {
    clearTimers();
    setLine(null);
  };

  // ---- the line state machine ----

  function proceed(l: Line) {
    const card = rep.cards.get(l.key);
    if (card) {
      if (!l.below.has(l.key)) return setLine({ ...l, phase: "done", end: "complete" });
      return setLine({ ...l, phase: "you" });
    }
    const reply = pickReply(rep, l.key, l.below);
    if (!reply) return setLine({ ...l, phase: "done", end: "complete" });
    setLine({ ...l, phase: "opponent" });
    timers.current.push(
      setTimeout(() => {
        proceed({ ...l, key: reply.to, ply: l.ply + 1, sans: [...l.sans, reply.san], last: squaresOf(reply.uci), feedback: null, phase: "opponent" });
      }, OPPONENT_DELAY),
    );
  }

  function start(m: Mode) {
    clearTimers();
    const now = Date.now();
    setClock(now);
    const leakSet = new Set(leaks.map((c) => c.key));
    const isTarget = m === "review" ? (c: Card) => isDue(states[c.key], now) : m === "leaks" ? (c: Card) => leakSet.has(c.key) : () => true;
    const below = targetsBelow(rep, isTarget);
    const l: Line = { mode: m, key: START_KEY, ply: 0, sans: [], last: null, phase: "opponent", feedback: null, correct: 0, missed: 0, below };
    if (!below.has(START_KEY)) {
      setLine({ ...l, phase: "done", end: m === "leaks" ? "no-leaks" : "caught-up" });
      return;
    }
    proceed(l);
  }

  function advanceAfter(l: Line, move: RepMove, uci: string, graded: "correct" | "none") {
    const next: Line = {
      ...l,
      key: move.to,
      ply: l.ply + 1,
      sans: [...l.sans, move.san],
      last: squaresOf(uci),
      feedback: graded === "correct" ? { kind: "correct", san: move.san, square: uci.slice(2, 4) } : null,
      phase: "opponent",
      correct: l.correct + (graded === "correct" ? 1 : 0),
    };
    setLine(next);
    timers.current.push(setTimeout(() => proceed(next), AFTER_CORRECT_DELAY));
  }

  function onMove(m: BoardMove) {
    if (!line || (line.phase !== "you" && line.phase !== "retry")) return;
    const card = rep.cards.get(line.key);
    if (!card) return;
    const expected = card.move;
    const now = Date.now();
    if (m.uci === expected.uci) {
      if (line.phase === "you") setCards((prev) => ({ ...prev, [card.key]: review(prev[card.key], true, now) }));
      advanceAfter(line, expected, m.uci, line.phase === "you" ? "correct" : "none");
      return;
    }
    if (line.phase === "you") setCards((prev) => ({ ...prev, [card.key]: review(prev[card.key], false, now) }));
    setLine({
      ...line,
      phase: "retry",
      missed: line.missed + (line.phase === "you" ? 1 : 0),
      feedback: { kind: "miss", played: m.san, square: m.to, expected },
    });
  }

  function showMe() {
    if (!line || line.phase !== "retry") return;
    const card = rep.cards.get(line.key);
    if (card) advanceAfter(line, card.move, card.move.uci, "none");
  }

  const switchColor = (c: Color) => {
    reset();
    setColor(c);
  };
  const switchMode = (m: "review" | "leaks") => {
    reset();
    setMode(m);
  };

  if (rep.cards.size === 0) {
    return (
      <>
        <div className={s.toolbar}><ColorToggle value={color} onChange={switchColor} /></div>
        <section className={s.empty}>
          <h2>Not enough games yet</h2>
          <p>{`The trainer drills positions you've reached at least 3 times as ${cap(color)}. Play a few more games and come back.`}</p>
        </section>
      </>
    );
  }

  const card = line ? rep.cards.get(line.key) : undefined;
  const fen = fenFromKey(line?.key ?? START_KEY, line?.ply ?? 0);
  const arrows: BoardArrow[] = [];
  const markers: BoardMarker[] = [];
  if (line?.feedback?.kind === "correct") markers.push({ square: line.feedback.square, tone: "good" });
  if (line?.feedback?.kind === "miss") {
    markers.push({ square: line.feedback.square, tone: "bad" });
    const e = squaresOf(line.feedback.expected.uci);
    arrows.push({ from: e.from, to: e.to, tone: "good" });
  }
  const yourTurn = line?.phase === "you" || line?.phase === "retry";

  return (
    <>
      <div className={s.toolbar}>
        <ColorToggle value={color} onChange={switchColor} />
        <div className={s.seg} role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === "review"} onClick={() => switchMode("review")}>Review</button>
          <button type="button" aria-pressed={mode === "leaks"} onClick={() => switchMode("leaks")}>Fix my leaks</button>
        </div>
      </div>

      <div className={s.trainer} data-testid="trainer" data-phase={line?.phase ?? "idle"} data-expected-move={yourTurn && card ? card.move.uci : undefined}>
        <div className={s.boardCol}>
          <Chessboard
            fen={fen}
            orientation={color}
            interactive={yourTurn ? color : false}
            onMove={onMove}
            lastMove={line?.last ?? null}
            arrows={arrows}
            markers={markers}
            label="Training board"
          />
        </div>
        <div>
          <Prompt
            line={line}
            card={card}
            color={color}
            mode={mode}
            loaded={loaded}
            leakCount={leaks.length}
            nextDue={nextDue(rep, states)}
            onStart={() => start(mode)}
            onPractice={() => start("practice")}
            onShowMe={showMe}
          />
          {line && line.sans.length > 0 && <p className={`${s.crumbs} ${s.muted}`} aria-label="Moves so far">{formatLine(line.sans)}</p>}
          <div className={s.tiles} style={{ marginTop: 14 }}>
            <div className={s.tile}>
              <div className={s.tileLabel}>Positions</div>
              <div className={s.tileValue}>{rep.cards.size}</div>
              <div className={s.tileNote}>{`${counts.learned} learned`}</div>
            </div>
            <div className={s.tile}>
              <div className={s.tileLabel}>Due now</div>
              <div className={s.tileValue} data-testid="due-count">{counts.due + counts.fresh}</div>
              <div className={s.tileNote}>{`${counts.fresh} new`}</div>
            </div>
            <div className={s.tile}>
              <div className={s.tileLabel}>Leaks</div>
              <div className={s.tileValue}>{leaks.length}</div>
              <div className={s.tileNote}>to fix</div>
            </div>
          </div>
          {mode === "leaks" && leaks.length > 0 && (
            <section className={s.panel} aria-labelledby="leak-list" style={{ marginTop: 14 }}>
              <h2 id="leak-list">Positions to fix</h2>
              <p className={s.sectionLede}>Where you&apos;ve missed most in training, and where your games go worst after your move.</p>
              <ol className={s.repList}>
                {leaks.map((c) => (
                  <li key={c.key}>
                    <div className={s.repHead}>
                      <span className={s.mono}>{formatLine(c.line) || "Start"}</span>
                      <span className={s.repMove}>{moveLabel(c.move.san, c.ply)}</span>
                      <span className={s.muted}>{c.move.stats.n ? `${pct(score(c.move.stats))} in ${plural(c.move.stats.n, "game")}` : "new move"}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      <section className={s.section} aria-labelledby="rep-h">
        <h2 id="rep-h" className={s.sectionTitle}>{`Your repertoire as ${cap(color)}`}</h2>
        <p className={s.sectionLede}>
          Positions you&apos;ve reached at least 3 times, with the move you play most there (games from the last year count double).
          Where another move you&apos;ve played scores clearly better, it&apos;s marked; you can drill any move you&apos;ve played instead.
        </p>
        <RepertoireList rep={rep} states={states} clock={clock} onAdopt={(key, move) => { reset(); adopt(key, move); }} />
      </section>
    </>
  );
}

function nextDue(rep: Repertoire, states: CardStates): number | null {
  let min: number | null = null;
  for (const c of rep.order) {
    const st = states[c.key];
    if (st && (min === null || st.due < min)) min = st.due;
  }
  return min;
}

function Prompt(props: {
  line: Line | null;
  card: Card | undefined;
  color: Color;
  mode: "review" | "leaks";
  loaded: boolean;
  leakCount: number;
  nextDue: number | null;
  onStart: () => void;
  onPractice: () => void;
  onShowMe: () => void;
}) {
  const { line, card, color, mode, loaded, leakCount } = props;
  const startLabel = mode === "leaks" ? "Start fixing leaks" : "Start training";
  if (!line) {
    return (
      <div className={s.prompt} role="status">
        <strong>{mode === "leaks" ? "Fix my leaks" : "Review your repertoire"}</strong>
        {mode === "leaks"
          ? `Drills the ${plural(leakCount, "position")} where you go wrong most.`
          : `Play your moves as ${cap(color)}; your opponents' replies come from your games.`}
        <div className={s.actions} style={{ marginTop: 10 }}>
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={props.onStart} disabled={!loaded}>{startLabel}</button>
        </div>
      </div>
    );
  }
  const { phase, feedback } = line;
  if (phase === "done") {
    const msg =
      line.end === "caught-up"
        ? `All caught up: nothing is due${props.nextDue ? `. Next review ${shortDate(props.nextDue / 1000)}` : ""}.`
        : line.end === "no-leaks"
          ? "No leaks to fix yet. Train more, or come back after more games."
          : `Line complete: ${plural(line.correct, "correct move")}${line.missed ? `, ${line.missed} missed` : ""}.`;
    return (
      <div className={`${s.prompt} ${line.end === "complete" && !line.missed ? s.good : ""}`} role="status">
        <strong>{line.end === "complete" ? "Line complete" : line.end === "caught-up" ? "All caught up" : "Nothing to fix"}</strong>
        {msg}
        <div className={s.actions} style={{ marginTop: 10 }}>
          {line.end === "complete" && <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => (line.mode === "practice" ? props.onPractice() : props.onStart())}>Next line</button>}
          {line.end !== "complete" && <button type="button" className={`${s.btn} ${s.primary}`} onClick={props.onPractice}>Practise anyway</button>}
        </div>
      </div>
    );
  }
  if (phase === "retry" && feedback?.kind === "miss") {
    return (
      <div className={`${s.prompt} ${s.bad}`} role="status">
        <strong>Not quite</strong>
        {`You played ${moveLabel(feedback.played, line.ply)}. Your move here is `}
        <b data-testid="expected-move">{moveLabel(feedback.expected.san, line.ply)}</b>
        {". Play it to continue."}
        <div className={s.actions} style={{ marginTop: 10 }}>
          <button type="button" className={s.btn} onClick={props.onShowMe}>Show me</button>
        </div>
      </div>
    );
  }
  if (phase === "you") {
    return (
      <div className={s.prompt} role="status">
        <strong>Your move</strong>
        {card?.adopted ? `You're learning a new move here.` : `Play the move you usually play as ${cap(color)}.`}
        {card && card.n > 0 && <span className={s.muted}>{` Reached in ${plural(card.n, "game")}.`}</span>}
      </div>
    );
  }
  return (
    <div className={`${s.prompt} ${feedback?.kind === "correct" ? s.good : ""}`} role="status">
      <strong>{feedback?.kind === "correct" ? "Correct" : "Opponent to move"}</strong>
      {feedback?.kind === "correct" ? `${moveLabel(feedback.san, line.ply - 1)} it is.` : "Picking a reply your opponents have played…"}
    </div>
  );
}

function Box({ box }: { box: number }) {
  return (
    <span className={s.box} role="img" aria-label={`Box ${box} of ${MAX_BOX}`}>
      {Array.from({ length: MAX_BOX }, (_, i) => <i key={i} className={i < box ? s.on : ""} />)}
    </span>
  );
}

function RepertoireList({ rep, states, clock, onAdopt }: { rep: Repertoire; states: CardStates; clock: number; onAdopt: (key: string, move: RepMove | null) => void }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rep.order : rep.order.slice(0, 12);
  return (
    <div className={s.panel}>
      <ul className={s.repList}>
        {shown.map((c) => {
          const st = states[c.key];
          return (
            <li key={c.key} data-position={c.key}>
              <div className={s.repHead}>
                <span className={s.mono}>{formatLine(c.line) || "Start"}</span>
                <span className={s.repMove}>{moveLabel(c.move.san, c.ply)}</span>
                <Box box={st?.box ?? 0} />
                <span className={s.muted}>
                  {plural(c.n, "game")}
                  {c.move.stats.n ? ` · ${pct(score(c.move.stats))} with ${c.move.san}` : ""}
                  {!st ? " · new" : isDue(st, clock) ? " · due" : ""}
                </span>
                {c.suggestion && !c.adopted && <span className={s.badge}>{`${c.suggestion.san} scores better`}</span>}
              </div>
              {(c.played.length > 1 || c.adopted) && (
                <div className={s.alts}>
                  {c.played
                    // One-off moves are noise; keep the suggestion and the usual move whatever their count.
                    .filter((m) => m.uci !== c.move.uci && (m.stats.n >= 2 || m === c.suggestion || m === c.usual))
                    .slice(0, 4)
                    .map((m) => (
                      <button
                        key={m.uci}
                        type="button"
                        className={`${s.btn} ${s.small} ${m === c.suggestion ? s.primary : ""}`}
                        aria-label={`Drill ${moveLabel(m.san, c.ply)} after ${formatLine(c.line) || "the start"} instead`}
                        onClick={() => onAdopt(c.key, m.uci === c.usual.uci ? null : m)}
                      >
                        {`Use ${m.san}`}
                        <span className={s.faint}>{` ${pct(score(m.stats))} · ${m.stats.n}`}</span>
                      </button>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {rep.order.length > 12 && (
        <button type="button" className={s.linkish} style={{ marginTop: 10 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${rep.order.length} positions`}
        </button>
      )}
    </div>
  );
}
