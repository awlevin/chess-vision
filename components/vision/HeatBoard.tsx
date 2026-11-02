// All-time stats painted on a board: time, reps or misses per square (or per
// file and rank for the line drill).
import { useState, type CSSProperties } from "react";
import { ALL_LINES, ALL_SQUARES, FILES, RANKS, boardRows, isDark, type Orientation, type StatMap } from "@/lib/drill";
import type { Mode } from "./config";
import styles from "./heat.module.css";

type Metric = "time" | "seen" | "wrong";
const METRICS: { metric: Metric; label: string; caption: string }[] = [
  { metric: "time", label: "Time", caption: "Brighter is slower." },
  { metric: "seen", label: "Reps", caption: "Brighter is more reps." },
  { metric: "wrong", label: "Misses", caption: "Brighter is missed more." },
];

export function HeatBoard({ stats, orientation, mode }: { stats: StatMap; orientation: Orientation; mode: Mode }) {
  const [metric, setMetric] = useState<Metric>("time");
  const lines = mode === "line";
  const val = (k: string) => {
    const s = stats[k];
    if (!s) return null;
    return metric === "seen" ? s.seen : metric === "wrong" ? s.wrong : s.ewma;
  };
  const max = Math.max(0.001, ...(lines ? ALL_LINES : ALL_SQUARES).map((k) => val(k) || 0));
  const files = orientation === "white" ? [...FILES] : [...FILES].reverse();
  const ranks = (orientation === "white" ? [...RANKS] : [...RANKS].reverse()).map(String);

  const cell = (k: string, dark: boolean) => {
    const v = val(k);
    const heat = v == null ? 0 : Math.max(0.12, v / max);
    return (
      <div
        key={k}
        className={styles.cell}
        data-dark={dark || undefined}
        data-hot={heat > 0.55 || undefined}
        data-tone={metric === "wrong" ? "bad" : undefined}
        title={k}
        style={v == null ? undefined : ({ "--heat": `${Math.round(heat * 100)}%` } as CSSProperties)}
      >
        {v == null || (metric === "wrong" && v === 0) ? "" : metric === "time" ? v.toFixed(1) : v}
      </div>
    );
  };

  return (
    <div className={styles.heat}>
      <div className={styles.metrics} role="group" aria-label="Heat map">
        {METRICS.map((m) => (
          <button key={m.metric} type="button" aria-pressed={metric === m.metric} onClick={() => setMetric(m.metric)}>
            {m.label}
          </button>
        ))}
      </div>
      {lines ? (
        <div className={styles.strips}>
          {[files, ranks].map((keys) => (
            <div key={keys[0]} className={styles.strip}>
              {keys.map((k) => cell(k, false))}
              {keys.map((k) => <div key={k} className={styles.head}>{k}</div>)}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.grid}>
          {boardRows(orientation).map((row) => [
            <div key={`r${row[0]}`} className={styles.head}>{row[0][1]}</div>,
            ...row.map((sq) => cell(sq, isDark(sq))),
          ])}
          <div />
          {files.map((f) => <div key={f} className={styles.head}>{f}</div>)}
        </div>
      )}
      <p className={styles.caption}>{METRICS.find((m) => m.metric === metric)!.caption}</p>
    </div>
  );
}
