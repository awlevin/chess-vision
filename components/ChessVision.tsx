import React, { useEffect, useRef, useState } from "react";
import {
  FILES,
  RANKS,
  boardRows,
  isDark,
  pickSquare,
  recordAttempt,
  scheduleRetries,
  weakSpots,
  type Orientation,
  type Retry,
  type Square,
  type StatMap,
} from "@/lib/drill";

const ROUND_LEN = 20;
const SLOW_FLOOR = 2; // seconds; a correct answer slower than this (and 1.6x the round avg) is requeued
const FLASH_MS = 280;

type Mode = "find" | "name";
type DrillConfig = { mode: Mode; orientation: Orientation; storageKey: string };
type Attempt = { sq: Square; correct: boolean; time: number; given: Square | null };
type RoundSummary = { avg: number; acc: number; total: number };
type Phase = "ready" | "solve" | "flash" | "wrongpause" | "roundend";
type HeatMetric = "seen" | "time" | "wrong";
// Which edge labels the board shows: files (a–h) along the bottom, ranks
// (1–8) up the left side.
type Labels = { files: boolean; ranks: boolean };
const NO_LABELS: Labels = { files: false, ranks: false };

const now = () => performance.now();

// ================= Board =================
function Board({
  orientation,
  labels,
  marks = {},
  onPick,
  dim,
  children,
}: {
  orientation: Orientation;
  labels: Labels;
  marks?: Record<Square, string>;
  onPick?: (sq: Square) => void;
  dim?: boolean;
  children?: React.ReactNode;
}) {
  const rows = boardRows(orientation);
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
      </div>
      {children && <div className="overlay">{children}</div>}
    </div>
  );
}

// ================= Heat board =================
const HEAT_COLORS: Record<HeatMetric, string> = { seen: "201,164,106", time: "214,138,62", wrong: "208,97,74" };

function HeatBoard({ stats, orientation, noun }: { stats: StatMap; orientation: Orientation; noun: string }) {
  const [metric, setMetric] = useState<HeatMetric>("seen");
  const val = (sq: Square) => {
    const s = stats[sq];
    if (!s) return null;
    return metric === "seen" ? s.seen : metric === "wrong" ? s.wrong : s.ewma;
  };
  const rows = boardRows(orientation);
  const max = Math.max(0.001, ...rows.flat().map((sq) => val(sq) || 0));
  const all = Object.values(stats);
  const lifeSeen = all.reduce((s, x) => s + x.seen, 0);
  const lifeWrong = all.reduce((s, x) => s + x.wrong, 0);
  const lifeAcc = lifeSeen ? Math.round(((lifeSeen - lifeWrong) / lifeSeen) * 100) : 0;
  const lifeAvg = lifeSeen ? all.reduce((s, x) => s + (x.ewma || 0) * x.seen, 0) / lifeSeen : 0;
  const files = orientation === "white" ? FILES : [...FILES].reverse();

  return (
    <div className="section">
      <h3>Every {noun}, all time</h3>
      <div className="lifetime">{lifeSeen} answered · {lifeAcc}% right · {lifeAvg.toFixed(2)}s avg</div>
      <div className="metricchips">
        {([["seen", "Attempts"], ["time", "Avg time"], ["wrong", "Misses"]] as const).map(([m, label]) => (
          <button key={m} className={`mchip ${metric === m ? "active" : ""}`} onClick={() => setMetric(m)}>{label}</button>
        ))}
      </div>
      <div className="heat">
        {rows.map((row) => (
          <React.Fragment key={row[0]}>
            <div className="hhead">{row[0][1]}</div>
            {row.map((sq) => {
              const v = val(sq);
              const alpha = v == null ? 0 : Math.max(0.12, v / max);
              return (
                <div
                  key={sq}
                  className={`hcell ${isDark(sq) ? "dk" : "lt"}`}
                  title={sq}
                  style={v == null ? undefined : { background: `rgba(${HEAT_COLORS[metric]},${alpha.toFixed(2)})`, color: alpha > 0.55 ? "#15120F" : "#F2EADB" }}
                >
                  {v == null ? "·" : metric === "time" ? v.toFixed(1) : v}
                </div>
              );
            })}
          </React.Fragment>
        ))}
        <div />
        {files.map((f) => <div key={f} className="hhead">{f}</div>)}
      </div>
      <div className="heatcaption">
        {metric === "seen" && "Times each square has come up, from this side of the board. Brighter = more reps."}
        {metric === "time" && "Recent average seconds per square. Brighter = slower."}
        {metric === "wrong" && "Total misses per square. Brighter = missed more."}
      </div>
    </div>
  );
}

// ================= Timed drill =================
function Drill({ active, config, labels }: { active: boolean; config: DrillConfig; labels: Labels }) {
  const { mode, orientation, storageKey } = config;
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
    const { square: next, review } = pickSquare(stats, retryRef.current, countRef.current, lastKeyRef.current);
    lastKeyRef.current = next;
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

  // Name mode input: a file, then a rank. The second key submits.
  const pressFile = (f: string) => { if (phase === "solve") setNameFile(f); };
  const pressRank = (r: number) => { if (phase === "solve" && nameFile) answer(`${nameFile}${r}`); };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (phase === "solve" && mode === "name") {
        const k = e.key.toLowerCase();
        if (/^[a-h]$/.test(k)) pressFile(k);
        else if (/^[1-8]$/.test(k)) pressRank(Number(k));
        else if (e.key === "Backspace") setNameFile(null);
      } else if (e.key === "Enter") {
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
  if (mode === "name" && (phase === "solve" || phase === "flash")) marks[square] = "target";
  if (phase === "flash" && flash?.correct) marks[square] = "good";
  if (phase === "wrongpause" && pending) { marks[pending.given] = "bad"; marks[square] = "answer"; }

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
          <HeatBoard stats={stats} orientation={orientation} noun="square" />
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
        onPick={mode === "find" && phase === "solve" ? answer : undefined}
        dim={phase === "ready"}
      >
        {phase === "ready" && (
          <div className="readycard">
            <div className="eyebrow center">Round {roundNo}</div>
            <h2>{mode === "find" ? "Find the square" : "Name the square"}</h2>
            <p>
              {ROUND_LEN} squares from {orientation === "white" ? "White's" : "Black's"} side,{" "}
              {mode === "find" ? "named for you to click" : "highlighted for you to name"}. The clock starts when you do.
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
            {phase === "ready" ? "" : mode === "find" ? "Tap the square" : "Name the highlighted square"}
          </div>
        )}
      </div>

      {mode === "name" && phase !== "wrongpause" && (
        <div className="namepad">
          <div className="padrow">
            {FILES.map((f) => (
              <button key={f} className={`key ${nameFile === f ? "sel" : ""}`} disabled={phase !== "solve"} onClick={() => pressFile(f)}>{f}</button>
            ))}
          </div>
          <div className="padrow">
            {RANKS.map((r) => (
              <button key={r} className="key" disabled={phase !== "solve" || !nameFile} onClick={() => pressRank(r)}>{r}</button>
            ))}
          </div>
        </div>
      )}

      {statsRow}
      {phase === "ready" && hasStats && (
        <div className="card statscard"><HeatBoard stats={stats} orientation={orientation} noun="square" /></div>
      )}
    </>
  );
}

// ================= Exercise registry =================
const EXERCISES: { id: string; group: string; label: string; sub: string; config: DrillConfig }[] = [
  { id: "find-white", group: "Find the square", label: "As White", sub: "A coordinate appears — click it", config: { mode: "find", orientation: "white", storageKey: "cv-find-white-v1" } },
  { id: "find-black", group: "Find the square", label: "As Black", sub: "Same drill, board flipped", config: { mode: "find", orientation: "black", storageKey: "cv-find-black-v1" } },
  { id: "name-white", group: "Name the square", label: "As White", sub: "A square lights up — name it", config: { mode: "name", orientation: "white", storageKey: "cv-name-white-v1" } },
  { id: "name-black", group: "Name the square", label: "As Black", sub: "Same drill, board flipped", config: { mode: "name", orientation: "black", storageKey: "cv-name-black-v1" } },
];

const PREFS_KEY = "cv:prefs";

// ================= App shell =================
export default function ChessVision() {
  const [prefs, setPrefs] = useState<{ activeId: string; labels: Labels }>(() => {
    try {
      const p = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}");
      return {
        activeId: EXERCISES.some((e) => e.id === p.activeId) ? p.activeId : "find-white",
        // Older prefs had one `coords` switch for both edges.
        labels: { files: !!(p.labels?.files ?? p.coords), ranks: !!(p.labels?.ranks ?? p.coords) },
      };
    } catch {
      return { activeId: "find-white", labels: NO_LABELS };
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeId, labels } = prefs;
  const activeEx = EXERCISES.find((e) => e.id === activeId)!;
  const groups = [...new Set(EXERCISES.map((e) => e.group))];

  useEffect(() => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);

  return (
    <div className="root">
      <style>{CSS}</style>

      <div className={`scrim ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} />
      <nav className={`drawer ${drawerOpen ? "open" : ""}`}>
        <div className="dtitle"><span className="knight">♞</span> Chess Vision</div>
        {groups.map((g) => (
          <div key={g}>
            <div className="dgroup">{g}</div>
            {EXERCISES.filter((e) => e.group === g).map((e) => (
              <button
                key={e.id}
                className={`ditem ${e.id === activeId ? "active" : ""}`}
                onClick={() => { setPrefs((p) => ({ ...p, activeId: e.id })); setDrawerOpen(false); }}
              >
                <div className="dlabel">{e.label}</div>
                <div className="dsub">{e.sub}</div>
              </button>
            ))}
          </div>
        ))}
        <div className="dgroup">Board</div>
        {([["files", "File letters", "a–h"], ["ranks", "Rank numbers", "1–8"]] as const).map(([edge, name, range]) => (
          <label key={edge} className="toggle">
            <input
              type="checkbox"
              checked={labels[edge]}
              onChange={(e) => setPrefs((p) => ({ ...p, labels: { ...p.labels, [edge]: e.target.checked } }))}
            />
            <span className="track"><span className="thumb" /></span>
            <span>{name} <span className="trange">{range}</span></span>
          </label>
        ))}
        <div className="dnote">Training wheels. Your times still count.</div>
      </nav>

      <div className="frame">
        <div className="topbar">
          <button className="burger" onClick={() => setDrawerOpen(true)} aria-label="Open drills menu">
            <span /><span /><span />
          </button>
          <div className="titleblock">
            <div className="eyebrow">{activeEx.group}</div>
            <h1>{activeEx.label}</h1>
          </div>
        </div>

        {EXERCISES.map((e) => (
          <div key={e.id} style={{ display: e.id === activeId ? "block" : "none" }}>
            <Drill active={e.id === activeId} config={e.config} labels={labels} />
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
.dgroup { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; color: var(--faint); margin: 18px 8px 6px; }
.ditem { display: block; width: 100%; text-align: left; border: 1px solid transparent; background: none; padding: 10px 12px; border-radius: 10px; cursor: pointer; }
.ditem .dlabel { font-size: 14px; font-weight: 600; color: var(--ivory); }
.ditem .dsub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.ditem.active { background: var(--panel2); border-color: var(--line2); }
.ditem.active .dlabel { color: var(--brass); }
.ditem:not(.active):hover { background: rgba(255,255,255,0.03); }
.toggle { display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; font-size: 14px; font-weight: 500; }
.toggle input { position: absolute; opacity: 0; pointer-events: none; }
.toggle .track { width: 36px; height: 20px; border-radius: 10px; background: var(--panel2); border: 1px solid var(--line2); position: relative; transition: background .15s; flex-shrink: 0; }
.toggle .thumb { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--muted); transition: transform .15s, background .15s; }
.toggle input:checked + .track { background: rgba(201,164,106,0.25); }
.toggle input:checked + .track .thumb { transform: translateX(16px); background: var(--brass); }
.toggle input:focus-visible + .track { outline: 2px solid var(--brass); outline-offset: 2px; }
.toggle .trange { color: var(--muted); font-family: var(--serif); font-style: italic; font-size: 15px; margin-left: 2px; }
.dnote { font-size: 11.5px; color: var(--muted); padding: 0 12px; }

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
.board { display: grid; grid-template-columns: repeat(8, 1fr); aspect-ratio: 1; width: 100%; border-radius: 2px; overflow: hidden; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
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
.sq.target { box-shadow: inset 0 0 0 4px #E2B65A; }
.sq.target::before { content: ''; position: absolute; inset: 0; background: rgba(226,182,90,0.35); animation: glow 1.4s ease-in-out infinite; }
@keyframes glow { 50% { opacity: 0.45; } }
.sq.good::before { content: ''; position: absolute; inset: 0; background: rgba(125,179,106,0.75); }
.sq.answer::before { content: ''; position: absolute; inset: 0; background: rgba(125,179,106,0.75); box-shadow: inset 0 0 0 3px #4E7D3F; }
.sq.bad::before { content: ''; position: absolute; inset: 0; background: rgba(208,97,74,0.8); }
@media (prefers-reduced-motion: reduce) { .sq.target::before { animation: none; } }
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
.metricchips { display: flex; gap: 6px; margin-bottom: 10px; }
.mchip { flex: 1; padding: 7px 4px; border-radius: 7px; border: 1px solid var(--line2); background: transparent; font-size: 11.5px; font-weight: 600; color: var(--muted); cursor: pointer; }
.mchip.active { background: var(--brass); color: var(--bg); border-color: var(--brass); }
.heat { display: grid; grid-template-columns: 16px repeat(8, 1fr); gap: 2px; }
.hcell { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 10px; font-weight: 600; border-radius: 3px; color: var(--faint); min-width: 0; }
.hcell.lt { background: #2E2820; }
.hcell.dk { background: #221D17; }
.hhead { display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-style: italic; font-size: 14px; font-weight: 600; color: var(--muted); }
.heatcaption { font-size: 11px; color: var(--muted); margin-top: 8px; line-height: 1.45; }
`;
