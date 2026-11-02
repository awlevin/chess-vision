"use client";

// Small pieces shared by the openings screens: the section bar, the colour
// toggle, the filter chip and its sheet, typeset moves, the score pill, the
// brass ring and the knight.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PieceSvg } from "@/components/board";
import { GamesGate } from "@/components/games";
import type { Color } from "@/lib/games";
import { installAudioUnlock, useSound } from "@/lib/delight";
import { plural } from "@/lib/openings/format";
import { PERIODS, TIME_CLASSES, score as scoreOf, type Filters, type Stats } from "@/lib/openings/stats";
import { useEngineSetting } from "./EngineNote";
import { useOpenings } from "./OpeningsProvider";
import s from "./openings.module.css";

export { s as styles };

// ---------- colour, from the URL ----------

/** The colour in `?color=`, and a setter that keeps the URL in step. */
export function useColor(): [Color, (c: Color) => void] {
  const params = useSearchParams();
  const color: Color = params.get("color") === "black" ? "black" : "white";
  const set = (c: Color) => {
    const q = new URLSearchParams(params.toString());
    q.set("color", c);
    q.delete("moves");
    q.delete("line");
    q.delete("go");
    window.history.replaceState(null, "", `?${q.toString()}`);
  };
  return [color, set];
}

export const cap = (c: Color) => (c === "white" ? "White" : "Black");

// ---------- the section bar ----------

const TABS = [
  { href: "/openings", label: "Home" },
  { href: "/openings/explorer", label: "Explore" },
  { href: "/openings/train", label: "Train" },
];

/** Home · Explore · Train, and the sound toggle. Links keep the colour. */
export function SectionBar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const color = params.get("color") === "black" ? "black" : "white";
  useEffect(() => installAudioUnlock(), []);
  return (
    <div className={s.bar}>
      <nav className={s.subnav} aria-label="Openings">
        {TABS.map((t) => {
          const current = t.href === "/openings" ? pathname === t.href || pathname === "/openings/leaks" : pathname.startsWith(t.href) || (t.href.endsWith("train") && pathname === "/openings/repertoire");
          return (
            <Link key={t.href} href={`${t.href}?color=${color}`} className={s.subtab} aria-current={current ? "page" : undefined}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      <SoundToggle />
    </div>
  );
}

export function SoundToggle() {
  const [on, setOn] = useSound();
  return (
    <button type="button" className={s.iconBtn} aria-pressed={on} aria-label="Sound" title={on ? "Sound on" : "Sound off"} onClick={() => setOn(!on)}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
        {on ? (
          <>
            <path d="M15.5 9a4 4 0 0 1 0 6" />
            <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
          </>
        ) : (
          <path d="M16 9.5l5 5m0-5l-5 5" />
        )}
      </svg>
    </button>
  );
}

// ---------- controls ----------

export function ColorToggle({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  return (
    <div className={s.seg} role="group" aria-label="Colour">
      {(["white", "black"] as const).map((c) => (
        <button key={c} type="button" aria-pressed={value === c} onClick={() => onChange(c)}>
          <span className={c === "white" ? s.pawnW : s.pawnB} aria-hidden="true" />
          {cap(c)}
        </button>
      ))}
    </div>
  );
}

function filterSummary(f: Filters): string {
  const parts: string[] = [];
  if (f.timeClass !== "all") parts.push(TIME_CLASSES.find((t) => t.value === f.timeClass)!.label);
  if (f.period !== "all") parts.push(f.period === "365" ? "Last year" : `${f.period} days`);
  if (f.ratedOnly) parts.push("Rated");
  return parts.length ? parts.join(" · ") : "All games";
}

/** One quiet chip that opens the filters in a bottom sheet. */
export function FilterChip({ engine = false }: { engine?: boolean }) {
  const { filters, setFilters, games } = useOpenings();
  const [open, setOpen] = useState(false);
  const [engineOn, setEngineOn] = useEngineSetting();
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });
  const label = filterSummary(filters);
  return (
    <>
      <button type="button" className={s.chip} aria-haspopup="dialog" aria-label={`Filters: ${label}`} onClick={() => setOpen(true)}>
        {label}
        <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Which games">
        <fieldset className={s.field}>
          <legend>Time control</legend>
          <div className={s.chips}>
            {TIME_CLASSES.map((t) => (
              <button key={t.value} type="button" className={s.choice} aria-pressed={filters.timeClass === t.value} onClick={() => set({ timeClass: t.value })}>
                {t.value === "all" ? "All" : t.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className={s.field}>
          <legend>Period</legend>
          <div className={s.chips}>
            {PERIODS.map((p) => (
              <button key={p.value} type="button" className={s.choice} aria-pressed={filters.period === p.value} onClick={() => set({ period: p.value })}>
                {p.value === "all" ? "All time" : p.value === "365" ? "Year" : `${p.value} days`}
              </button>
            ))}
          </div>
        </fieldset>
        <Switch label="Rated games only" checked={filters.ratedOnly} onChange={(v) => set({ ratedOnly: v })} />
        {engine && <Switch label="Check with the Lichess engine" hint="Sends positions to lichess.org" checked={engineOn} onChange={setEngineOn} />}
        <div className={s.sheetFoot}>
          <span className={s.ink3} aria-live="polite" data-testid="filtered-count">{plural(games.length, "game")}</span>
          <button type="button" className={s.primaryBtn} onClick={() => setOpen(false)}>Done</button>
        </div>
      </Sheet>
    </>
  );
}

export function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={s.switchRow}>
      <span>
        {label}
        {hint && <span className={s.hint}>{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className={s.switch} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** A bottom sheet on a native <dialog>: Escape, focus and the backdrop for free. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.sheetBody}>
        <span className={s.grabber} aria-hidden="true" />
        <h2 id={titleId} className={s.sheetTitle}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

// ---------- numbers ----------

/** Clay through stone to sage, by how a score compares with 50%. */
export function scoreHue(score: number): string {
  const t = Math.max(-1, Math.min(1, (score - 0.5) / 0.22));
  const p = Math.round(Math.abs(t) * 100);
  return t >= 0 ? `color-mix(in oklab, var(--win) ${p}%, var(--draw))` : `color-mix(in oklab, var(--loss) ${p}%, var(--draw))`;
}

/** The score pill: the percentage, tinted by how good it is, games beside it. */
export function ScorePill({ stats, games = true }: { stats: Stats; games?: boolean }) {
  const v = scoreOf(stats);
  return (
    <span className={s.pillWrap}>
      {games && <span className={s.ink3}>{stats.n}</span>}
      <span className={s.pill} style={{ "--hue": scoreHue(v) } as CSSProperties}>{Math.round(v * 100)}%</span>
    </span>
  );
}

/** A slim win/draw/loss bar. The numbers are always beside it. */
export function ResultBar({ stats }: { stats: Stats }) {
  const text = `${stats.w} won, ${stats.d} drawn, ${stats.l} lost`;
  return (
    <span className={s.wdl} role="img" aria-label={text} title={text}>
      {stats.w > 0 && <i className={s.win} style={{ flexGrow: stats.w }} />}
      {stats.d > 0 && <i className={s.draw} style={{ flexGrow: stats.d }} />}
      {stats.l > 0 && <i className={s.loss} style={{ flexGrow: stats.l }} />}
    </span>
  );
}

// ---------- moves ----------

const FIGURINES: Record<string, string> = { K: "♚︎", Q: "♛︎", R: "♜︎", B: "♝︎", N: "♞︎" };

/** A SAN move with a figurine for the piece: "♞f3". */
export function San({ san }: { san: string }) {
  const fig = FIGURINES[san[0]];
  if (!fig) return <>{san}</>;
  return (
    <>
      <span className={s.fig} aria-hidden="true">{fig}</span>
      <span className={s.srOnly}>{san[0]}</span>
      {san.slice(1)}
    </>
  );
}

/** One move, with its number in ink-3 when it starts a pair: "3.♞c3" or "3…♞c6". */
export function MoveText({ san, ply, number = true }: { san: string; ply: number; number?: boolean }) {
  const n = Math.floor(ply / 2) + 1;
  return (
    <span className={s.move}>
      {number && <span className={s.ink3}>{ply % 2 === 0 ? `${n}.` : `${n}…`}</span>}
      <San san={san} />
    </span>
  );
}

/** A typeset line: "1.e4 e5 2.♞f3". */
export function LineText({ sans, start = 0, empty = "Start" }: { sans: string[]; start?: number; empty?: string }) {
  if (!sans.length) return <span className={s.ink3}>{empty}</span>;
  return (
    <span className={s.line}>
      {sans.map((san, i) => {
        const ply = start + i;
        return (
          <span key={i} className={s.move}>
            {(ply % 2 === 0 || i === 0) && <span className={s.ink3}>{ply % 2 === 0 ? `${ply / 2 + 1}.` : `${Math.floor(ply / 2) + 1}…`}</span>}
            <San san={san} />
          </span>
        );
      })}
    </span>
  );
}

// ---------- the ring and the knight ----------

/** The brass ring: progress toward today's reviews. Glows when full. */
export function Ring({ progress, size = 132, children }: { progress: number; size?: number; children?: ReactNode }) {
  const r = 46, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className={`${s.ring} ${p >= 1 ? s.ringFull : ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className={s.ringTrack} />
        <circle cx="50" cy="50" r={r} className={s.ringFill} strokeDasharray={c} style={{ strokeDashoffset: c * (1 - p) }} />
      </svg>
      <div className={s.ringInner}>{children}</div>
    </div>
  );
}

/** The knight: hops in an L while we work, sits still on an empty state. */
export function Knight({ hop = false, size = 56 }: { hop?: boolean; size?: number }) {
  return (
    <span className={`${s.knight} ${hop ? s.hop : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <PieceSvg piece="wN" />
    </span>
  );
}

/** An empty or waiting state with the knight. */
export function Empty({ title, children, hop = false, action }: { title: string; children?: ReactNode; hop?: boolean; action?: ReactNode }) {
  return (
    <section className={s.empty} aria-busy={hop || undefined}>
      <Knight hop={hop} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </section>
  );
}

// ---------- the gate ----------

/**
 * Shows children once games and the book are ready. GamesGate covers
 * loading, linking, the first import and its errors; this adds reading the
 * games and the case where none are standard chess.
 */
export function OpeningsGate({ children }: { children: ReactNode }) {
  return (
    <GamesGate linkTitle="Your openings, coached" linkMessage="Link your Chess.com username and we'll find your leaks and drill the lines you really play.">
      <Analysed>{children}</Analysed>
    </GamesGate>
  );
}

function Analysed({ children }: { children: ReactNode }) {
  const { status, progress } = useOpenings();
  if (status === "ready") return <>{children}</>;
  if (status === "no-games") {
    return (
      <Empty title="Nothing to study yet" action={<Link href="/account" className={s.primaryBtn}>Your account</Link>}>
        We only read standard chess from the usual start, and there&apos;s none here yet.
      </Empty>
    );
  }
  const total = progress.total || 1;
  return (
    <Empty title={status === "loading" ? "Setting up the board…" : "Reading your games…"} hop>
      {status === "analysing" && progress.total > 0 ? (
        <span className={s.progress} role="progressbar" aria-label="Reading games" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <span style={{ width: `${(progress.done / total) * 100}%` }} />
        </span>
      ) : null}
    </Empty>
  );
}
