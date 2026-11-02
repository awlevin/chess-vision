"use client";

// Small pieces shared by the openings pages.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { GamesGate, SyncStatus } from "@/components/games";
import type { Color, Outcome } from "@/lib/games";
import { pct, plural } from "@/lib/openings/format";
import { PERIODS, TIME_CLASSES, score, type Filters, type Stats } from "@/lib/openings/stats";
import { useOpenings } from "./OpeningsProvider";
import s from "./openings.module.css";

export { s as styles };

const TABS = [
  { href: "/openings", label: "Report" },
  { href: "/openings/explorer", label: "Explorer" },
  { href: "/openings/train", label: "Train" },
];

export function OpeningsTabs() {
  const pathname = usePathname();
  return (
    <nav className={s.tabs} aria-label="Openings">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={s.tab} aria-current={pathname === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Shows children once games and the book are ready. GamesGate covers
 * loading, linking, the first import and its errors; this adds reading the
 * games and the case where none are standard chess.
 */
export function OpeningsGate({ children }: { children: ReactNode }) {
  return (
    <GamesGate linkMessage="Openings works from your own games. Link your Chess.com username to see how your openings score, where you go wrong, and to drill the positions you actually reach.">
      <Analysed>{children}</Analysed>
    </GamesGate>
  );
}

function Analysed({ children }: { children: ReactNode }) {
  const { status, progress, account } = useOpenings();
  if (status === "ready") {
    return (
      <>
        <SyncStatus className={s.sync} />
        {children}
      </>
    );
  }
  if (status === "no-games") {
    return (
      <section className={s.empty} aria-labelledby="op-empty">
        <h2 id="op-empty">No standard games to analyse</h2>
        <p>{`We couldn't find any standard chess games${account ? ` for ${account.displayName}` : ""} (variants and custom starting positions are skipped).`}</p>
        <Link href="/account" className={s.btn}>Go to your account</Link>
      </section>
    );
  }
  const total = progress.total || 1;
  return (
    <section className={s.empty} aria-busy="true" aria-labelledby="op-empty">
      <h2 id="op-empty">{status === "loading" ? "Loading…" : "Reading your games…"}</h2>
      {status === "analysing" && progress.total > 0 && (
        <>
          <p>{`${progress.done.toLocaleString("en-US")} of ${plural(progress.total, "game")}`}</p>
          <div className={s.progress} role="progressbar" aria-label="Reading games" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <span style={{ width: `${(progress.done / total) * 100}%` }} />
          </div>
        </>
      )}
    </section>
  );
}

export function FiltersBar({ extra }: { extra?: ReactNode }) {
  const { filters, setFilters, games } = useOpenings();
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });
  return (
    <div className={s.toolbar} role="group" aria-label="Filters">
      {extra}
      <label className={s.field}>
        <span className={s.fieldLabel}>Time control</span>
        <select className={s.select} value={filters.timeClass} onChange={(e) => set({ timeClass: e.target.value as Filters["timeClass"] })}>
          {TIME_CLASSES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label className={s.field}>
        <span className={s.fieldLabel}>Period</span>
        <select className={s.select} value={filters.period} onChange={(e) => set({ period: e.target.value as Filters["period"] })}>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>
      <label className={s.check}>
        <input type="checkbox" checked={filters.ratedOnly} onChange={(e) => set({ ratedOnly: e.target.checked })} />
        Rated only
      </label>
      <span className={s.count} aria-live="polite" data-testid="filtered-count">{plural(games.length, "game")}</span>
    </div>
  );
}

export function ColorToggle({ value, onChange, label = "Colour" }: { value: Color; onChange: (c: Color) => void; label?: string }) {
  return (
    <div className={s.seg} role="group" aria-label={label}>
      {(["white", "black"] as const).map((c) => (
        <button key={c} type="button" aria-pressed={value === c} onClick={() => onChange(c)}>
          {c === "white" ? "As White" : "As Black"}
        </button>
      ))}
    </div>
  );
}

/** Wins, draws and losses as a bar, with the counts written out beside it. */
export function ResultBar({ stats }: { stats: Stats }) {
  const parts = [
    { n: stats.w, cls: s.win, label: "won" },
    { n: stats.d, cls: s.draw, label: "drawn" },
    { n: stats.l, cls: s.loss, label: "lost" },
  ].filter((p) => p.n > 0);
  const text = `${stats.w} won, ${stats.d} drawn, ${stats.l} lost`;
  return (
    <div>
      <div className={s.bar} role="img" aria-label={text} title={text}>
        {parts.map((p) => <span key={p.label} className={p.cls} style={{ flexGrow: p.n }} />)}
      </div>
      <div className={s.wdl} aria-hidden="true">{`+${stats.w} =${stats.d} −${stats.l}`}</div>
    </div>
  );
}

export function Score({ stats, baseline }: { stats: Stats; baseline?: number }) {
  const v = score(stats);
  const tone = baseline === undefined || stats.n < 5 ? "" : v >= baseline + 0.1 ? s.scoreGood : v <= baseline - 0.1 ? s.scoreBad : "";
  return <span className={`${s.score} ${tone}`}>{pct(v)}</span>;
}

const LETTER: Record<Outcome, string> = { win: "W", draw: "D", loss: "L" };

export function ResultDots({ results }: { results: Outcome[] }) {
  const text = results.map((r) => LETTER[r]).join(" ");
  return (
    <span className={s.dots} role="img" aria-label={`Last ${results.length}: ${text}`} title={`Oldest to newest: ${text}`}>
      {results.map((r, i) => (
        <span key={i} className={`${s.dot} ${r === "win" ? s.win : r === "draw" ? s.draw : s.loss}`} aria-hidden="true">{LETTER[r]}</span>
      ))}
    </span>
  );
}

export function Trend({ trend }: { trend: number | null }) {
  if (trend === null || Math.abs(trend) < 0.05) return null;
  const up = trend > 0;
  return (
    <span className={up ? s.trendUp : s.trendDown} title="Score in the last 10 games compared with before">
      {up ? "▲" : "▼"} {Math.round(Math.abs(trend) * 100)}
      <span className={s.srOnly}>{up ? " points up recently" : " points down recently"}</span>
    </span>
  );
}
