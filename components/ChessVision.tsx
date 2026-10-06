import React, { useEffect, useRef, useState } from "react";
import {
  ALL_LINES,
  ALL_SQUARES,
  FILES,
  RANKS,
  boardRows,
  isDark,
  lineSquares,
  pickNext,
  pieceMoves,
  recordAttempt,
  scheduleRetries,
  weakSpots,
  type Orientation,
  type Piece,
  type Retry,
  type Square,
  type StatMap,
} from "@/lib/drill";

const ROUND_LEN = 20;
const SLOW_FLOOR = 2; // seconds; a correct answer slower than this (and 1.6x the round avg) is requeued
const FLASH_MS = 280;

type Mode = "find" | "line" | "name" | "tour";
// `piece` is set only for the tour drill, which keeps stats per piece.
type DrillConfig = { mode: Mode; orientation: Orientation; piece: Piece | null; storageKey: string };
type Attempt = { sq: Square; correct: boolean; time: number; given: Square | null };
type RoundSummary = { avg: number; acc: number; total: number };
type Phase = "ready" | "solve" | "flash" | "wrongpause" | "roundend";
type HeatMetric = "seen" | "time" | "wrong";
// Which edge labels the board shows: files (a–h) along the bottom, ranks
// (1–8) up the left side.
type Labels = { files: boolean; ranks: boolean };

const now = () => performance.now();

// ================= Drill registry =================
const DRILLS: { mode: Mode; title: string; sub: string; units: string; task: string; prompt: string }[] = [
  { mode: "find", title: "Find the square", sub: "A coordinate appears — click it", units: "squares", task: "named for you to click", prompt: "Tap the square" },
  { mode: "line", title: "Name the file or rank", sub: "A file or rank lights up — name it", units: "files and ranks", task: "highlighted for you to name", prompt: "Name the highlighted file or rank" },
  { mode: "name", title: "Name the square", sub: "A knight lands on a square — name it", units: "squares", task: "marked for you to name", prompt: "Name the knight's square" },
  { mode: "tour", title: "Follow the piece", sub: "A piece hops around — name where it lands", units: "moves", task: "each landing square for you to name", prompt: "Name the square it landed on" },
];
const drillFor = (mode: Mode) => DRILLS.find((d) => d.mode === mode)!;

const PIECES: { piece: Piece; name: string; glyph: string }[] = [
  { piece: "knight", name: "Knight", glyph: "♞" },
  { piece: "bishop", name: "Bishop", glyph: "♝" },
  { piece: "rook", name: "Rook", glyph: "♜" },
  { piece: "queen", name: "Queen", glyph: "♛" },
];
const pieceFor = (piece: Piece) => PIECES.find((p) => p.piece === piece)!;
const titleFor = (mode: Mode, piece: Piece | null) =>
  mode === "tour" && piece ? `Follow the ${pieceFor(piece).name.toLowerCase()}` : drillFor(mode).title;
// The text variation selector keeps the glyphs from rendering as emoji.
const TEXT = "\uFE0E";

// ================= Board =================
function Board({
  orientation,
  labels,
  marks = {},
  piece,
  onPick,
  dim,
  children,
}: {
  orientation: Orientation;
  labels: Labels;
  marks?: Record<Square, string>;
  // `slide` animates the piece from its last square to this one.
  piece?: { sq: Square; glyph: string; slide: boolean };
  onPick?: (sq: Square) => void;
  dim?: boolean;
  children?: React.ReactNode;
}) {
  const rows = boardRows(orientation);
  const pieceAt = piece ? rows.flat().indexOf(piece.sq) : -1;
  return (
    <div className={`boardwrap ${dim ? "dim" : ""}`}>
      <div className={`board ${onPick ? "pickable" : ""}`}>
        {rows.map((row, ri) =>
          row.map((sq, fi) => (
            <button
              key={sq}
              type="button"
              tabIndex={-1}
              data-sq={sq}
              className={`sq ${isDark(sq) ? "dk" : "lt"} ${marks[sq] || ""}`}
              onPointerDown={onPick ? (e) => { e.preventDefault(); onPick(sq); } : undefined}
            >
              {labels.ranks && fi === 0 && <span className="crank">{sq[1]}</span>}
              {labels.files && ri === 7 && <span className="cfile">{sq[0]}</span>}
            </button>
          )),
        )}
        {piece && (
          <span
            className={`piece ${piece.slide ? "slide" : ""}`}
            style={{ left: `${(pieceAt % 8) * 12.5}%`, top: `${Math.floor(pieceAt / 8) * 12.5}%` }}
            aria-hidden
          >
            {piece.glyph + TEXT}
          </span>
        )}
      </div>
      {children && <div className="overlay">{children}</div>}
    </div>
  );
}

// ================= Heat board =================
const HEAT_COLORS: Record<HeatMetric, string> = { seen: "201,164,106", time: "214,138,62", wrong: "208,97,74" };

function HeatBoard({ stats, orientation, mode }: { stats: StatMap; orientation: Orientation; mode: Mode }) {
  const [metric, setMetric] = useState<HeatMetric>("time");
  const lines = mode === "line";
  const noun = lines ? "file or rank" : "square";
  const val = (k: string) => {
    const s = stats[k];
    if (!s) return null;
    return metric === "seen" ? s.seen : metric === "wrong" ? s.wrong : s.ewma;
  };
  const rows = boardRows(orientation);
  const max = Math.max(0.001, ...(lines ? ALL_LINES : ALL_SQUARES).map((k) => val(k) || 0));
  const all = Object.values(stats);
  const lifeSeen = all.reduce((s, x) => s + x.seen, 0);
  const lifeWrong = all.reduce((s, x) => s + x.wrong, 0);
  const lifeAcc = lifeSeen ? Math.round(((lifeSeen - lifeWrong) / lifeSeen) * 100) : 0;
  const lifeAvg = lifeSeen ? all.reduce((s, x) => s + (x.ewma || 0) * x.seen, 0) / lifeSeen : 0;
  const files = orientation === "white" ? [...FILES] : [...FILES].reverse();
  const ranks = (orientation === "white" ? [...RANKS] : [...RANKS].reverse()).map(String);
  const cell = (k: string, shade: "lt" | "dk") => {
    const v = val(k);
    const alpha = v == null ? 0 : Math.max(0.12, v / max);
    return (
      <div
        key={k}
        className={`hcell ${shade}`}
        title={k}
        style={v == null ? undefined : { background: `rgba(${HEAT_COLORS[metric]},${alpha.toFixed(2)})`, color: alpha > 0.55 ? "#15120F" : "#F2EADB" }}
      >
        {v == null ? "·" : metric === "time" ? v.toFixed(1) : v}
      </div>
    );
  };

  return (
    <div className="section">
      <h3>Every {lines ? "file and rank" : "square"}, all time</h3>
      <div className="lifetime">{lifeSeen} answered · {lifeAcc}% right · {lifeAvg.toFixed(2)}s avg</div>
      <div className="metricchips">
        {([["time", "Avg time"], ["seen", "Attempts"], ["wrong", "Misses"]] as const).map(([m, label]) => (
          <button key={m} className={`mchip ${metric === m ? "active" : ""}`} onClick={() => setMetric(m)}>{label}</button>
        ))}
      </div>
      {lines ? (
        <div className="heatlines">
          {[files, ranks].map((keys) => (
            <div key={keys[0]} className="heat strip">
              {keys.map((k) => cell(k, "lt"))}
              {keys.map((k) => <div key={k} className="hhead">{k}</div>)}
            </div>
          ))}
        </div>
      ) : (
        <div className="heat">
          {rows.map((row) => (
            <React.Fragment key={row[0]}>
              <div className="hhead">{row[0][1]}</div>
              {row.map((sq) => cell(sq, isDark(sq) ? "dk" : "lt"))}
            </React.Fragment>
          ))}
          <div />
          {files.map((f) => <div key={f} className="hhead">{f}</div>)}
        </div>
      )}
      <div className="heatcaption">
        {metric === "seen" && `Times each ${noun} has come up, from this side of the board. Brighter = more reps.`}
        {metric === "time" && `Recent average seconds per ${noun}. Brighter = slower.`}
        {metric === "wrong" && `Total misses per ${noun}. Brighter = missed more.`}
      </div>
    </div>
  );
}

// ================= Timed drill =================
function Drill({
  active,
  config,
  labels,
  setup,
}: {
  active: boolean;
  config: DrillConfig;
  labels: Labels;
  // Side and label controls, shown between rounds.
  setup: React.ReactNode;
}) {
  const { mode, orientation, piece, storageKey } = config;
  const drill = drillFor(mode);
  const named = mode === "name" || mode === "tour"; // answered with a file, then a rank
  const [square, setSquare] = useState<Square>("e4");
  const [phase, setPhase] = useState<Phase>("ready");
  const [flash, setFlash] = useState<{ correct: boolean; time: number } | null>(null);
  const [pending, setPending] = useState<{ time: number; given: Square } | null>(null);
  const [round, setRound] = useState<Attempt[]>([]);
  const [history, setHistory] = useState<RoundSummary[]>([]);
  const [stats, setStats] = useState<StatMap>({});
  const [isReview, setIsReview] = useState(false);
  const [lastTime, setLastTime] = useState<number | null>(null);
  const [nameFile, setNameFile] = useState<string | null>(null);
  const startRef = useRef(0);
  const retryRef = useRef<Retry[]>([]);
  const countRef = useRef(0);
  const lastKeyRef = useRef<Square | null>(null);
  // Tour only: the square the piece just left, and the one before it.
  const [from, setFrom] = useState<Square | null>(null);
  const prevKeyRef = useRef<Square | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadedRef = useRef(false);

  // ---- persistence ----
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage?.get(storageKey);
        if (r?.value) {
          const d = JSON.parse(r.value);
          if (d.stats) setStats(d.stats);
          if (d.history) setHistory(d.history);
        }
      } catch { /* fresh start */ }
      loadedRef.current = true;
    })();
  }, [storageKey]);

  useEffect(() => {
    if (!loadedRef.current || !window.storage) return;
    if (phase !== "roundend" && history.length === 0) return;
    (async () => {
      try {
        await window.storage!.set(storageKey, JSON.stringify({ stats, history }));
      } catch (e) { console.error("save failed", e); }
    })();
    // Saves at round end and when a round is filed into history, not on every attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, history]);

  const newProblem = () => {
    // On a tour the piece moves from where it is, and avoids hopping straight
    // back; elsewhere the draw only avoids repeating the last key.
    const at = mode === "tour" ? lastKeyRef.current : null;
    const pool = mode === "line" ? ALL_LINES : at ? pieceMoves(piece!, at) : ALL_SQUARES;
    const avoid = mode === "tour" ? prevKeyRef.current : lastKeyRef.current;
    const { key: next, review } = pickNext(pool, stats, retryRef.current, countRef.current, avoid);
    prevKeyRef.current = at;
    lastKeyRef.current = next;
    setFrom(at);
    countRef.current += 1;
    setSquare(next);
    setIsReview(review);
    setNameFile(null);
    setFlash(null);
    setPhase("solve");
    startRef.current = now();
  };

  const total = round.reduce((s, r) => s + r.time, 0);

  const commitResult = (correct: boolean, elapsed: number, given: Square | null) => {
    const nextRound = [...round, { sq: square, correct, time: elapsed, given }];
    setRound(nextRound);
    setStats((s) => recordAttempt(s, square, correct, elapsed));
    scheduleRetries(retryRef.current, square, correct, elapsed, countRef.current, round.length ? total / round.length : null, SLOW_FLOOR);
    return nextRound;
  };

  const answer = (given: Square) => {
    if (phase !== "solve") return;
    const elapsed = (now() - startRef.current) / 1000;
    const correct = given === square;
    setLastTime(elapsed);
    setFlash({ correct, time: elapsed });
    if (correct) {
      const nextRound = commitResult(true, elapsed, null);
      if (nextRound.length >= ROUND_LEN) setPhase("roundend");
      else { setPhase("flash"); timeoutRef.current = setTimeout(newProblem, FLASH_MS); }
    } else {
      setPending({ time: elapsed, given });
      setPhase("wrongpause");
    }
  };

  const resolvePending = (decision: "wrong" | "slip") => {
    if (!pending) return;
    const nextRound = commitResult(decision === "slip", pending.time, decision === "slip" ? null : pending.given);
    setPending(null);
    if (nextRound.length >= ROUND_LEN) setPhase("roundend");
    else newProblem();
  };

  const startNewRound = () => {
    const right = round.filter((r) => r.correct).length;
    setHistory((h) => [...h, { avg: total / round.length, acc: Math.round((right / round.length) * 100), total }]);
    setRound([]);
    newProblem();
  };

  // Name mode input: a file, then a rank; the second key submits. Line mode
  // submits on the first key.
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
      if (phase === "solve" && mode !== "find") {
        const k = e.key.toLowerCase();
        if (/^[a-h]$/.test(k)) pressFile(k);
        else if (/^[1-8]$/.test(k)) pressRank(Number(k));
        else if (e.key === "Backspace") setNameFile(null);
      } else if (e.key === "Enter") {
        // A focused button handles its own Enter.
        if (e.target instanceof HTMLButtonElement) return;
        if (phase === "ready") newProblem();
        else if (phase === "wrongpause") resolvePending("wrong");
        else if (phase === "roundend") startNewRound();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  // ---- derived ----
  const count = round.length;
  const right = round.filter((r) => r.correct).length;
  const avg = count ? total / count : null;
  const acc = count ? Math.round((right / count) * 100) : null;
  const best = history.length ? Math.min(...history.map((h) => h.avg)) : null;
  const slowest = round.filter((r) => r.correct).sort((x, y) => y.time - x.time).slice(0, 3);
  const missed = round.filter((r) => !r.correct);
  const focus = weakSpots(stats);
  const hasStats = Object.keys(stats).length > 0;
  const roundNo = history.length + 1;
  const verb = mode === "find" ? "clicked" : "named";

  const marks: Record<Square, string> = {};
  const mark = (key: string, cls: string) => {
    for (const sq of mode === "line" ? lineSquares(key) : [key]) marks[sq] = cls;
  };
  if (mode === "tour" && from && (phase === "solve" || phase === "flash")) marks[from] = "from";
  if (mode !== "find" && (phase === "solve" || phase === "flash")) mark(square, mode === "line" ? "line" : "target");
  if (phase === "flash" && flash?.correct) mark(square, "good");
  if (phase === "wrongpause" && pending) { mark(pending.given, "bad"); mark(square, "answer"); }

  const statsRow = (
    <div className="stats">
      <div className="stat"><div className="v">{lastTime === null ? "–" : `${lastTime.toFixed(2)}s`}</div><div className="l">Last</div></div>
      <div className="stat"><div className="v">{avg === null ? "–" : `${avg.toFixed(2)}s`}</div><div className="l">Round avg</div></div>
      <div className="stat"><div className="v">{acc === null ? "–" : `${acc}%`}</div><div className="l">Accuracy</div></div>
      <div className="stat"><div className="v">{best === null ? "–" : `${best.toFixed(2)}s`}</div><div className="l">Best round</div></div>
    </div>
  );

  if (phase === "roundend") {
    return (
      <>
        <div className="card roundend">
          <div className="eyebrow center">Round {roundNo} complete</div>
          <h2>{avg!.toFixed(2)}<span className="unit">s</span> <em>per square</em></h2>
          <div className="bigstats">
            <div className="bigstat"><div className="v">{total.toFixed(1)}s</div><div className="l">Total</div></div>
            <div className="bigstat"><div className="v">{acc}%</div><div className="l">Accuracy</div></div>
            <div className="bigstat"><div className="v">{best === null || avg! < best ? "New" : `${best.toFixed(2)}s`}</div><div className="l">{best === null || avg! < best ? "Best round" : "Best so far"}</div></div>
          </div>
          {missed.length > 0 && (
            <div className="section">
              <h3>Missed — coming back next round</h3>
              {missed.map((r, i) => (
                <div key={i} className="fact wrongf"><span><b>{r.sq}</b> · you {verb} {r.given}</span><span>{r.time.toFixed(2)}s</span></div>
              ))}
            </div>
          )}
          {slowest.length > 0 && (
            <div className="section">
              <h3>Slowest correct</h3>
              {slowest.map((r, i) => (
                <div key={i} className="fact slow"><span><b>{r.sq}</b></span><span>{r.time.toFixed(2)}s</span></div>
              ))}
            </div>
          )}
          {focus.length > 0 && (
            <div className="section">
              <h3>Getting extra reps next round</h3>
              {focus.map(({ k, s }) => (
                <div key={k} className="fact focus">
                  <span><b>{k}</b></span>
                  <span>{s.wrong > 0 ? `${s.wrong} miss${s.wrong > 1 ? "es" : ""} · ` : ""}{s.ewma!.toFixed(2)}s avg</span>
                </div>
              ))}
            </div>
          )}
          <HeatBoard stats={stats} orientation={orientation} mode={mode} />
          {history.length > 0 && (
            <div className="section">
              <h3>Past rounds (avg / square)</h3>
              <div className="histrow">
                {history.map((h, i) => (
                  <span key={i} className={`histchip ${h.avg === best ? "best" : ""}`}>R{i + 1}: {h.avg.toFixed(2)}s</span>
                ))}
              </div>
            </div>
          )}
          {setup}
          <button className="primary" onClick={startNewRound}>Begin round {roundNo + 1}</button>
          <div className="hint">or press Enter</div>
        </div>
        {statsRow}
      </>
    );
  }

  return (
    <>
      <div className="promptbar">
        <div className="progress">
          <div className="pmeta">
            Round {roundNo}{phase !== "ready" && ` · ${Math.min(count + 1, ROUND_LEN)} of ${ROUND_LEN}`}
            {isReview && phase !== "ready" && <span className="reviewtag">Review</span>}
          </div>
          <div className="roundbar">
            {Array.from({ length: ROUND_LEN }).map((_, i) => {
              const r = round[i];
              return <div key={i} className={`seg ${r ? (r.correct ? "hit" : "miss") : ""}`} />;
            })}
          </div>
        </div>
        <div className={`plaque ${phase === "flash" ? "good" : phase === "wrongpause" ? "bad" : ""}`}>
          {phase === "ready" ? (
            <span className="glyph">{orientation === "white" ? "♔" : "♚"}</span>
          ) : mode === "find" ? (
            <span className="coord">{square}</span>
          ) : phase === "solve" && mode === "line" ? (
            <span className="coord"><span className="blank">_</span></span>
          ) : phase === "solve" ? (
            <span className="coord">{nameFile ?? <span className="blank">_</span>}<span className="blank">_</span></span>
          ) : (
            <span className="coord">{square}</span>
          )}
        </div>
      </div>

      <Board
        orientation={orientation}
        labels={labels}
        marks={marks}
        piece={named && phase !== "ready" ? { sq: square, glyph: pieceFor(piece ?? "knight").glyph, slide: mode === "tour" } : undefined}
        onPick={mode === "find" && phase === "solve" ? answer : undefined}
        dim={phase === "ready"}
      >
        {phase === "ready" && (
          <div className="readycard">
            <div className="eyebrow center">Round {roundNo}</div>
            <h2>{titleFor(mode, piece)}</h2>
            <p>
              {ROUND_LEN} {drill.units} from {orientation === "white" ? "White's" : "Black's"} side, {drill.task}. The
              clock starts when you do.
            </p>
            <button className="primary" onClick={newProblem}>Begin</button>
            <div className="hint">or press Enter</div>
          </div>
        )}
      </Board>

      <div className={`feedback ${phase === "ready" ? "idle" : ""}`}>
        {phase === "wrongpause" && pending ? (
          <>
            <div className="fbline bad">That was <b>{pending.given}</b> — <b>{square}</b> is highlighted</div>
            <div className="fbbtns">
              <button className="primary" onClick={() => resolvePending("wrong")}>Continue</button>
              <button className="ghost" onClick={() => resolvePending("slip")}>{mode === "find" ? "Misclick" : "Mistap"} — count it</button>
            </div>
          </>
        ) : phase === "flash" && flash ? (
          <div className="fbline good">{flash.time.toFixed(2)}s</div>
        ) : (
          <div className="fbline muted">
            {phase === "ready" ? "" : drill.prompt}
          </div>
        )}
      </div>

      {mode !== "find" && phase !== "wrongpause" && (
        <div className="namepad">
          <div className="padrow">
            {FILES.map((f) => (
              <button key={f} className={`key ${nameFile === f ? "sel" : ""}`} disabled={phase !== "solve"} onClick={() => pressFile(f)}>{f}</button>
            ))}
          </div>
          <div className="padrow">
            {RANKS.map((r) => (
              <button key={r} className="key" disabled={phase !== "solve" || (named && !nameFile)} onClick={() => pressRank(r)}>{r}</button>
            ))}
          </div>
        </div>
      )}

      {phase === "ready" && setup}
      {statsRow}
      {phase === "ready" && hasStats && (
        <div className="card statscard"><HeatBoard stats={stats} orientation={orientation} mode={mode} /></div>
      )}
    </>
  );
}

// ================= Drill instances and prefs =================
const MODES = DRILLS.map((d) => d.mode);
const SIDES: readonly Orientation[] = ["white", "black"];
// Each mode and side keeps its own stats: finding e4 as Black is a different
// skill from finding it as White.
const CONFIGS: DrillConfig[] = MODES.flatMap((mode) =>
  (mode === "tour" ? PIECES.map((p) => p.piece) : [null]).flatMap((piece) =>
    SIDES.map((orientation) => ({
      mode,
      orientation,
      piece,
      storageKey: `cv-${mode}${piece ? `-${piece}` : ""}-${orientation}-v1`,
    })),
  ),
);
const LABEL_EDGES = [
  { edge: "files", range: "a–h", name: "File letters" },
  { edge: "ranks", range: "1–8", name: "Rank numbers" },
] as const;

type Prefs = { mode: Mode; side: Orientation; piece: Piece; labels: Labels };
const PREFS_KEY = "cv:prefs";
const DEFAULT_PREFS: Prefs = { mode: "find", side: "white", piece: "knight", labels: { files: false, ranks: false } };

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}");
    // Older prefs stored one activeId like "find-black", and one `coords`
    // switch for both edges.
    const [oldMode, oldSide] = typeof p.activeId === "string" ? p.activeId.split("-") : [];
    return {
      mode: oneOf(p.mode ?? oldMode, MODES, DEFAULT_PREFS.mode),
      side: oneOf(p.side ?? oldSide, SIDES, DEFAULT_PREFS.side),
      piece: oneOf(p.piece, PIECES.map((x) => x.piece), DEFAULT_PREFS.piece),
      labels: { files: !!(p.labels?.files ?? p.coords), ranks: !!(p.labels?.ranks ?? p.coords) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// Keeps a mouse click from leaving focus on a chip, so Enter still starts the
// round afterwards.
const noFocus = (e: React.MouseEvent) => e.preventDefault();

// ================= App shell =================
export default function ChessVision() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode, side, piece, labels } = prefs;
  const isActive = (c: DrillConfig) => c.mode === mode && c.orientation === side && (c.piece === null || c.piece === piece);
  // Drills mount the first time they are opened, so each loads its stats only
  // when needed, then stay mounted to keep a round in progress.
  const activeKey = CONFIGS.find(isActive)!.storageKey;
  const [opened, setOpened] = useState<string[]>([]);
  if (!opened.includes(activeKey)) setOpened([...opened, activeKey]);

  useEffect(() => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);

  const setup = (
    <div className="setup">
      {mode === "tour" && (
        <div className="sgroup full">
          <div className="slabel">Piece</div>
          <div className="schips">
            {PIECES.map((x) => (
              <button
                key={x.piece}
                type="button"
                className={`mchip ${piece === x.piece ? "active" : ""}`}
                aria-pressed={piece === x.piece}
                onMouseDown={noFocus}
                onClick={() => setPrefs((p) => ({ ...p, piece: x.piece }))}
              >
                <span className="sglyph">{x.glyph + TEXT}</span>{x.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sgroup">
        <div className="slabel">Play as</div>
        <div className="schips">
          {SIDES.map((s) => (
            <button
              key={s}
              type="button"
              className={`mchip ${side === s ? "active" : ""}`}
              aria-pressed={side === s}
              onMouseDown={noFocus}
              onClick={() => setPrefs((p) => ({ ...p, side: s }))}
            >
              <span className="sglyph">{s === "white" ? "♔" : "♚"}</span>{s === "white" ? "White" : "Black"}
            </button>
          ))}
        </div>
      </div>
      <div className="sgroup">
        <div className="slabel">Board labels</div>
        <div className="schips">
          {LABEL_EDGES.map(({ edge, range, name }) => (
            <button
              key={edge}
              type="button"
              className={`mchip ${labels[edge] ? "active" : ""}`}
              aria-pressed={labels[edge]}
              aria-label={name}
              title={name}
              onMouseDown={noFocus}
              onClick={() => setPrefs((p) => ({ ...p, labels: { ...p.labels, [edge]: !p.labels[edge] } }))}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="root">
      <style>{CSS}</style>

      <div className={`scrim ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} />
      <nav className={`drawer ${drawerOpen ? "open" : ""}`}>
        <div className="dtitle"><span className="knight">♞</span> Chess Vision</div>
        {DRILLS.map((d) => (
          <button
            key={d.mode}
            className={`ditem ${d.mode === mode ? "active" : ""}`}
            onClick={() => { setPrefs((p) => ({ ...p, mode: d.mode })); setDrawerOpen(false); }}
          >
            <div className="dlabel">{d.title}</div>
            <div className="dsub">{d.sub}</div>
          </button>
        ))}
      </nav>

      <div className="frame">
        <div className="topbar">
          <button className="burger" onClick={() => setDrawerOpen(true)} aria-label="Open drills menu">
            <span /><span /><span />
          </button>
          <div className="titleblock">
            <div className="eyebrow">As {side === "white" ? "White" : "Black"}</div>
            <h1>{titleFor(mode, piece)}</h1>
          </div>
        </div>

        {CONFIGS.filter((c) => opened.includes(c.storageKey)).map((c) => (
          <div key={c.storageKey} style={{ display: isActive(c) ? "block" : "none" }}>
            <Drill active={isActive(c)} config={c} labels={labels} setup={setup} />
          </div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
.root {
  --bg: #15120F; --panel: #1E1A16; --panel2: #27221C; --line: rgba(201,164,106,0.20); --line2: rgba(201,164,106,0.38);
  --ivory: #F2EADB; --muted: #A3957F; --faint: #6F6455; --brass: #C9A46A; --brassdeep: #9C7A45;
  --light: #EAD7B0; --dark: #A87A52; --good: #7DB36A; --bad: #D0614A;
  --serif: 'Cormorant Garamond', Georgia, serif; font-variant-numeric: lining-nums; font-feature-settings: 'lnum' 1; --sans: 'Inter', system-ui, sans-serif; --mono: 'IBM Plex Mono', ui-monospace, monospace;
  min-height: 100vh; font-family: var(--sans); color: var(--ivory);
  background:
    radial-gradient(ellipse 90% 60% at 50% -10%, rgba(201,164,106,0.10), transparent 70%),
    repeating-conic-gradient(rgba(255,255,255,0.012) 0 25%, transparent 0 50%) 0 0 / 56px 56px,
    var(--bg);
  display: flex; flex-direction: column; align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 32px);
}
.frame { width: 100%; max-width: 460px; }
button { font-family: var(--sans); font-variant-numeric: lining-nums; font-feature-settings: 'lnum' 1; }

.topbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-right: 48px; }
.burger { width: 42px; height: 42px; border-radius: 10px; border: 1px solid var(--line2); background: var(--panel); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; flex-shrink: 0; }
.burger span { display: block; width: 17px; height: 1.5px; background: var(--brass); border-radius: 1px; }
.titleblock { min-width: 0; }
.eyebrow { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 600; color: var(--brass); }
.eyebrow.center { text-align: center; }
.titleblock h1 { font-family: var(--serif); font-size: 26px; font-weight: 600; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.scrim { position: fixed; inset: 0; background: rgba(8,6,4,0.6); z-index: 40; opacity: 0; pointer-events: none; transition: opacity .2s; }
.scrim.open { opacity: 1; pointer-events: auto; }
.drawer { position: fixed; top: 0; left: 0; bottom: 0; width: 280px; z-index: 50; background: var(--panel); border-right: 1px solid var(--line2); transform: translateX(-102%); transition: transform .22s ease; padding: calc(env(safe-area-inset-top, 0px) + 22px) 14px 20px; overflow-y: auto; }
.drawer.open { transform: translateX(0); }
@media (prefers-reduced-motion: reduce) { .drawer, .scrim { transition: none; } }
.dtitle { font-family: var(--serif); font-size: 24px; font-weight: 600; margin: 0 0 10px 6px; }
.knight { color: var(--brass); }
.ditem { display: block; width: 100%; text-align: left; border: 1px solid transparent; background: none; padding: 10px 12px; border-radius: 10px; cursor: pointer; }
.ditem .dlabel { font-size: 14px; font-weight: 600; color: var(--ivory); }
.ditem .dsub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.ditem.active { background: var(--panel2); border-color: var(--line2); }
.ditem.active .dlabel { color: var(--brass); }
.ditem:not(.active):hover { background: rgba(255,255,255,0.03); }

.promptbar { display: flex; align-items: flex-end; gap: 14px; margin-bottom: 12px; }
.progress { flex: 1; min-width: 0; padding-bottom: 6px; }
.pmeta { font-size: 12px; font-weight: 500; color: var(--muted); margin-bottom: 8px; white-space: nowrap; }
.roundbar { height: 6px; display: flex; gap: 2px; }
.roundbar .seg { flex: 1; border-radius: 2px; background: var(--panel2); }
.roundbar .seg.hit { background: var(--brass); }
.roundbar .seg.miss { background: var(--bad); }
.reviewtag { display: inline-block; margin-left: 8px; vertical-align: 1px; font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brass); border: 1px solid var(--line2); border-radius: 4px; padding: 2px 6px; }
.plaque { width: 112px; height: 76px; flex-shrink: 0; border-radius: 12px; border: 1px solid var(--line2); background: linear-gradient(180deg, var(--panel2), var(--panel)); display: flex; align-items: center; justify-content: center; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); transition: border-color .12s; }
.plaque .coord { font-family: var(--serif); font-style: italic; font-weight: 600; font-size: 54px; line-height: 1; letter-spacing: 0.02em; color: var(--ivory); }
.plaque .blank { color: var(--faint); }
.plaque .glyph { font-size: 44px; color: var(--brass); line-height: 1; }
.plaque.good { border-color: var(--good); }
.plaque.good .coord { color: var(--good); }
.plaque.bad { border-color: var(--bad); }

.boardwrap { position: relative; padding: 8px; border-radius: 6px; background: linear-gradient(145deg, #3A2C1F, #241B13); box-shadow: 0 0 0 1px var(--line2), 0 18px 40px rgba(0,0,0,0.45); }
.board { position: relative; display: grid; grid-template-columns: repeat(8, 1fr); aspect-ratio: 1; width: 100%; border-radius: 2px; overflow: hidden; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.sq { position: relative; border: none; padding: 0; aspect-ratio: 1; display: block; cursor: default; font: inherit; }
.board.pickable .sq { cursor: pointer; }
.sq.lt { background: var(--light); }
.sq.dk { background: var(--dark); }
.board.pickable .sq:hover::after { content: ''; position: absolute; inset: 0; background: rgba(255,255,255,0.12); }
.sq .crank, .sq .cfile { position: absolute; font-family: var(--sans); font-size: 10px; font-weight: 700; line-height: 1; pointer-events: none; }
.sq .crank { top: 3px; left: 3px; }
.sq .cfile { bottom: 3px; right: 4px; }
.sq.lt .crank, .sq.lt .cfile { color: var(--dark); }
.sq.dk .crank, .sq.dk .cfile { color: var(--light); }
.sq.target { box-shadow: inset 0 0 0 4px #F0B43C; }
.sq.target::before { content: ''; position: absolute; inset: 0; background: rgba(240,180,60,0.6); animation: glow 1.4s ease-in-out infinite; }
@keyframes glow { 50% { opacity: 0.6; } }
.sq.line::before { content: ''; position: absolute; inset: 0; background: rgba(236,160,40,0.88); animation: glow 1.4s ease-in-out infinite; }
.sq.from { box-shadow: inset 0 0 0 3px rgba(240,180,60,0.7); }
.sq.from::before { content: ''; position: absolute; inset: 0; background: rgba(240,180,60,0.22); }
.piece { position: absolute; width: 12.5%; height: 12.5%; z-index: 1; display: flex; align-items: center; justify-content: center; font-family: 'Apple Symbols', 'Segoe UI Symbol', 'DejaVu Sans', serif; font-size: min(9vw, 44px); line-height: 1; color: #1A140D; text-shadow: 0 0 1px #F2EADB, 0 0 3px rgba(242,234,219,0.9), 0 2px 4px rgba(0,0,0,0.35); pointer-events: none; }
.piece.slide { transition: left .2s ease, top .2s ease; }
@media (prefers-reduced-motion: reduce) { .piece.slide { transition: none; } }
.sq.good::before { content: ''; position: absolute; inset: 0; background: rgba(125,179,106,0.75); }
.sq.answer::before { content: ''; position: absolute; inset: 0; background: rgba(125,179,106,0.75); box-shadow: inset 0 0 0 3px #4E7D3F; }
.sq.bad::before { content: ''; position: absolute; inset: 0; background: rgba(208,97,74,0.8); }
@media (prefers-reduced-motion: reduce) { .sq.target::before, .sq.line::before { animation: none; } }
.boardwrap.dim .board { filter: brightness(0.42) saturate(0.7); }
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 20px; }
.readycard { text-align: center; max-width: 300px; }
.readycard h2 { font-family: var(--serif); font-size: 34px; font-weight: 600; margin: 4px 0 8px; }
.readycard p { font-size: 13.5px; line-height: 1.5; color: #D8CDB9; margin-bottom: 18px; }

.feedback { min-height: 44px; margin: 12px 0 4px; text-align: center; }
.feedback.idle { min-height: 0; margin: 12px 0 0; }
.readycard .hint { color: #B5A78F; }
.fbline { font-size: 14px; font-weight: 500; padding-top: 4px; }
.fbline.good { font-family: var(--mono); color: var(--good); }
.fbline.bad { color: #E9A595; margin-bottom: 10px; }
.fbline.muted { color: var(--faint); font-size: 12.5px; }
.fbline b { font-family: var(--serif); font-style: italic; font-size: 19px; color: var(--ivory); }
.fbbtns { display: flex; gap: 8px; }
.fbbtns > * { flex: 1; }

.namepad { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }
.padrow { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; }
.key { font-family: var(--serif); font-style: italic; font-size: 24px; font-weight: 600; padding: 8px 0 10px; border-radius: 9px; border: 1px solid var(--line2); background: var(--panel); color: var(--ivory); cursor: pointer; transition: transform .05s; }
.key:active:not(:disabled) { transform: scale(0.95); background: var(--panel2); }
.key:disabled { opacity: 0.35; cursor: default; }
.key.sel { background: var(--brass); color: var(--bg); border-color: var(--brass); }

.primary { width: 100%; padding: 13px; border-radius: 10px; border: 1px solid var(--brass); background: linear-gradient(180deg, #D4B07A, var(--brass)); color: #1A140D; font-size: 15px; font-weight: 700; letter-spacing: 0.02em; cursor: pointer; margin-top: 6px; }
.primary:active { filter: brightness(0.92); }
.ghost { width: 100%; padding: 13px; border-radius: 10px; background: transparent; border: 1px solid var(--line2); color: var(--muted); font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 6px; }
.hint { font-size: 11.5px; color: var(--faint); margin-top: 8px; text-align: center; }
.primary:focus-visible, .ghost:focus-visible, .key:focus-visible, .mchip:focus-visible, .ditem:focus-visible, .burger:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }

.stats { display: flex; gap: 8px; margin-top: 14px; }
.stat { flex: 1; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 9px 4px; text-align: center; min-width: 0; }
.stat .v { font-family: var(--mono); font-size: 16px; font-weight: 600; }
.stat .l { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin-top: 2px; }

.card { background: var(--panel); border: 1px solid var(--line2); border-radius: 14px; padding: 20px 18px 18px; }
.statscard { margin-top: 14px; }
.statscard .section:last-child { margin-bottom: 0; }
.roundend h2 { font-family: var(--serif); font-size: 52px; font-weight: 600; text-align: center; line-height: 1.05; margin: 6px 0 16px; }
.roundend h2 .unit { font-size: 32px; }
.roundend h2 em { display: block; font-size: 18px; font-weight: 500; color: var(--muted); }
.bigstats { display: flex; gap: 8px; margin-bottom: 18px; }
.bigstat { flex: 1; background: var(--panel2); border-radius: 10px; padding: 10px 6px; text-align: center; }
.bigstat .v { font-family: var(--mono); font-size: 18px; font-weight: 600; }
.bigstat .l { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin-top: 2px; }
.section { margin-bottom: 18px; }
.section h3 { font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin-bottom: 7px; }
.fact { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; padding: 6px 12px; border-radius: 8px; margin-bottom: 4px; }
.fact b { font-family: var(--serif); font-style: italic; font-size: 19px; font-weight: 600; }
.fact > span:last-child { font-family: var(--mono); font-size: 12.5px; }
.fact.wrongf { background: rgba(208,97,74,0.12); color: #E9A595; }
.fact.slow { background: rgba(214,138,62,0.11); color: #E3B887; }
.fact.focus { background: rgba(201,164,106,0.10); color: var(--brass); }
.histrow { display: flex; gap: 6px; flex-wrap: wrap; }
.histchip { font-family: var(--mono); font-size: 12px; background: var(--panel2); border-radius: 6px; padding: 4px 8px; color: var(--ivory); }
.histchip.best { background: rgba(125,179,106,0.16); color: var(--good); }

.lifetime { font-family: var(--mono); font-size: 12px; color: var(--muted); margin-bottom: 8px; }
.setup { display: flex; flex-wrap: wrap; gap: 12px 14px; margin-top: 14px; }
.roundend .setup { margin: 0 0 12px; }
.sgroup { flex: 1; min-width: 0; }
.sgroup.full { flex-basis: 100%; }
.slabel { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
.schips { display: flex; gap: 6px; }
.sglyph { font-family: 'Apple Symbols', 'Segoe UI Symbol', 'DejaVu Sans', serif; font-size: 20px; line-height: 0; vertical-align: -3px; margin-right: 5px; }
.metricchips { display: flex; gap: 6px; margin-bottom: 10px; }
.mchip { flex: 1; padding: 7px 4px; border-radius: 7px; border: 1px solid var(--line2); background: transparent; font-size: 11.5px; font-weight: 600; color: var(--muted); cursor: pointer; }
.mchip.active { background: var(--brass); color: var(--bg); border-color: var(--brass); }
.heat { display: grid; grid-template-columns: 16px repeat(8, 1fr); gap: 2px; }
.heatlines { display: flex; flex-direction: column; gap: 10px; }
.heat.strip { grid-template-columns: repeat(8, 1fr); }
.hcell { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 10px; font-weight: 600; border-radius: 3px; color: var(--faint); min-width: 0; }
.hcell.lt { background: #2E2820; }
.hcell.dk { background: #221D17; }
.hhead { display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-style: italic; font-size: 14px; font-weight: 600; color: var(--muted); }
.heatcaption { font-size: 11px; color: var(--muted); margin-top: 8px; line-height: 1.45; }
`;
