// One drill's state machine: ready → solve → (flash | wrongpause) → … → roundend.
//
// The mechanics are lib/drill.ts's: the adaptive picker, requeues for misses
// and slow answers, and per-key stats. This hook adds the round, the timing,
// persistence and the feedback events. Stats are saved under the config's
// storageKey as { stats, history }, the shape every earlier version used.
import { useEffect, useRef, useState } from "react";
import {
  ALL_LINES,
  ALL_SQUARES,
  lineSquares,
  pickNext,
  pieceMoves,
  recordAttempt,
  scheduleRetries,
  type Retry,
  type Square,
  type StatMap,
} from "@/lib/drill";
import { FLASH_MS, ROUND_LEN, SLOW_FLOOR, type Attempt, type DrillConfig, type Phase, type RoundSummary } from "./config";
import type { Pulse } from "./Board";
import { feedback } from "./feedback";
import { shake } from "./motion";

const now = () => performance.now();
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Correct answers in a row at the end of the round so far. */
export function streakOf(round: Attempt[]): number {
  let n = 0;
  for (let i = round.length - 1; i >= 0 && round[i].correct; i--) n++;
  return n;
}

export function useDrill(config: DrillConfig, active: boolean) {
  const { mode, piece, storageKey } = config;
  const named = mode === "name" || mode === "tour"; // answered with a file, then a rank

  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState<StatMap>({});
  const [history, setHistory] = useState<RoundSummary[]>([]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [square, setSquare] = useState<Square>("e4");
  const [promptId, setPromptId] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [isReview, setIsReview] = useState(false);
  const [nameFile, setNameFile] = useState<string | null>(null);
  const [from, setFrom] = useState<Square | null>(null); // tour: the square the piece just left
  const [round, setRound] = useState<Attempt[]>([]);
  const [pending, setPending] = useState<{ time: number; given: Square } | null>(null);
  const [lastTime, setLastTime] = useState<number | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [roundKey, setRoundKey] = useState(0);

  const startRef = useRef(0);
  const retryRef = useRef<Retry[]>([]);
  const countRef = useRef(0);
  const lastKeyRef = useRef<Square | null>(null);
  const prevKeyRef = useRef<Square | null>(null); // tour: the square before `from`
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const boardRef = useRef<HTMLDivElement>(null);

  // ---- persistence ----
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await window.storage?.get(storageKey);
        if (r?.value && live) {
          const d = JSON.parse(r.value);
          if (d.stats) setStats(d.stats);
          if (Array.isArray(d.history)) setHistory(d.history);
        }
      } catch { /* fresh start */ }
      if (live) setLoaded(true);
    })();
    return () => { live = false; };
  }, [storageKey]);

  const persist = (s: StatMap, h: RoundSummary[]) => {
    window.storage?.set(storageKey, JSON.stringify({ stats: s, history: h })).catch((e) => console.error("save failed", e));
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  // ---- the round ----
  const newProblem = (statsNow: StatMap) => {
    // On a tour the piece moves from where it is and avoids hopping straight
    // back; elsewhere the draw only avoids repeating the last key.
    const at = mode === "tour" ? lastKeyRef.current : null;
    const pool = mode === "line" ? ALL_LINES : at ? pieceMoves(piece!, at) : ALL_SQUARES;
    const avoid = mode === "tour" ? prevKeyRef.current : lastKeyRef.current;
    const { key, review } = pickNext(pool, statsNow, retryRef.current, countRef.current, avoid);
    prevKeyRef.current = at;
    lastKeyRef.current = key;
    countRef.current += 1;
    setFrom(at);
    setSquare(key);
    setIsReview(review);
    setNameFile(null);
    setPromptId((n) => n + 1);
    setPhase("solve");
    const t = now();
    startRef.current = t;
    setStartedAt(t);
  };

  const commit = (correct: boolean, elapsed: number, given: Square | null) => {
    const nextRound = [...round, { sq: square, correct, time: elapsed, given }];
    const nextStats = recordAttempt(stats, square, correct, elapsed);
    const roundAvg = round.length ? sum(round.map((r) => r.time)) / round.length : null;
    scheduleRetries(retryRef.current, square, correct, elapsed, countRef.current, roundAvg, SLOW_FLOOR);
    setRound(nextRound);
    setStats(nextStats);
    return { nextRound, nextStats };
  };

  const finish = (nextRound: Attempt[], nextStats: StatMap) => {
    const total = sum(nextRound.map((r) => r.time));
    const right = nextRound.filter((r) => r.correct).length;
    const summary: RoundSummary = { avg: total / nextRound.length, acc: Math.round((right / nextRound.length) * 100), total };
    const prevBest = history.length ? Math.min(...history.map((h) => h.avg)) : null;
    const nextHistory = [...history, summary];
    setHistory(nextHistory);
    setPhase("roundend");
    persist(nextStats, nextHistory);
    feedback.play(prevBest != null && summary.avg < prevBest ? "best" : "roundEnd");
  };

  const advance = (nextRound: Attempt[], nextStats: StatMap) => {
    if (nextRound.length >= ROUND_LEN) finish(nextRound, nextStats);
    else newProblem(nextStats);
  };

  const keysOf = (k: string) => (mode === "line" ? lineSquares(k) : [k]);

  const answer = (given: Square) => {
    if (phase !== "solve") return;
    const elapsed = (now() - startRef.current) / 1000;
    setLastTime(elapsed);
    if (given === square) {
      setPulse({ id: promptId, squares: keysOf(square), tone: "good" });
      const { nextRound, nextStats } = commit(true, elapsed, null);
      const streak = streakOf(nextRound);
      feedback.play(streak > 0 && streak % 5 === 0 ? "streak" : "correct");
      if (nextRound.length >= ROUND_LEN) finish(nextRound, nextStats);
      else {
        setPhase("flash");
        timeoutRef.current = setTimeout(() => newProblem(nextStats), FLASH_MS);
      }
    } else {
      setPulse({ id: promptId, squares: keysOf(given), tone: "bad" });
      shake(boardRef.current);
      feedback.play("miss");
      setPending({ time: elapsed, given });
      setPhase("wrongpause");
    }
  };

  /** After a miss: "wrong" files it as a miss; "slip" counts it as a misclick (correct). */
  const resolvePending = (decision: "wrong" | "slip") => {
    if (!pending) return;
    const slip = decision === "slip";
    const { nextRound, nextStats } = commit(slip, pending.time, slip ? null : pending.given);
    setPending(null);
    advance(nextRound, nextStats);
  };

  const begin = () => {
    if (!loaded || (phase !== "ready" && phase !== "roundend")) return;
    setRound([]);
    setPending(null);
    setLastTime(null);
    setPulse(null);
    setRoundKey((k) => k + 1);
    feedback.play("begin");
    newProblem(stats);
  };

  // Naming input: a file, then a rank; the second key submits. The line
  // drill submits on the first key.
  const pressFile = (f: string) => {
    if (phase !== "solve") return;
    if (mode === "line") answer(f);
    else setNameFile(f);
  };
  const pressRank = (r: number) => {
    if (phase !== "solve") return;
    if (mode === "line") answer(String(r));
    else if (nameFile) answer(`${nameFile}${r}`);
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // Leave keys alone while a sheet is open or a field has focus.
      if (document.querySelector("dialog[open]")) return;
      if (phase === "solve" && mode !== "find") {
        const k = e.key.toLowerCase();
        if (/^[a-h]$/.test(k)) pressFile(k);
        else if (/^[1-8]$/.test(k)) pressRank(Number(k));
        else if (e.key === "Backspace") setNameFile(null);
      } else if (e.key === "Enter") {
        // A focused button handles its own Enter.
        if (e.target instanceof HTMLButtonElement) return;
        if (phase === "ready" || phase === "roundend") begin();
        else if (phase === "wrongpause") resolvePending("wrong");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return {
    named,
    loaded,
    stats,
    history,
    phase,
    square,
    promptId,
    startedAt,
    isReview,
    nameFile,
    from,
    round,
    pending,
    lastTime,
    pulse,
    roundKey,
    boardRef,
    begin,
    answer,
    pressFile,
    pressRank,
    resolvePending,
  };
}

export type DrillState = ReturnType<typeof useDrill>;
