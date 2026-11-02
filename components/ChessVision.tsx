// The Vision drills: a drill chip and a settings button above the active
// drill. The pieces live in components/vision/; the mechanics in lib/drill.ts.
import { useEffect, useState } from "react";
import { CONFIGS, loadPrefs, savePrefs, titleFor, type DrillConfig, type Prefs } from "./vision/config";
import { Drill } from "./vision/Drill";
import { setSoundEnabled } from "./vision/feedback";
import { DrillList, Settings } from "./vision/Pickers";
import { Sheet } from "./vision/Sheet";
import styles from "./vision/vision.module.css";

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2" />
        <circle cx="9" cy="17" r="2" />
      </g>
    </svg>
  );
}

export default function ChessVision() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [sheet, setSheet] = useState<"drills" | "settings" | null>(null);
  const { mode, side, piece, labels } = prefs;
  const isActive = (c: DrillConfig) => c.mode === mode && c.orientation === side && (c.piece === null || c.piece === piece);
  // Drills mount the first time they are opened, so each loads its stats only
  // when needed, then stay mounted to keep a round in progress.
  const activeKey = CONFIGS.find(isActive)!.storageKey;
  const [opened, setOpened] = useState<string[]>([]);
  if (!opened.includes(activeKey)) setOpened([...opened, activeKey]);

  useEffect(() => {
    savePrefs(prefs);
    setSoundEnabled(prefs.sound);
  }, [prefs]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button type="button" className={styles.drillChip} aria-haspopup="dialog" onClick={() => setSheet("drills")}>
          <span>{titleFor(mode, piece)}</span>
          <Chevron />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          aria-haspopup="dialog"
          aria-label="Drill settings"
          onClick={() => setSheet("settings")}
        >
          <SlidersIcon />
        </button>
      </div>

      {CONFIGS.filter((c) => opened.includes(c.storageKey)).map((c) => (
        <div key={c.storageKey} hidden={!isActive(c)}>
          <Drill active={isActive(c)} config={c} labels={labels} />
        </div>
      ))}

      <Sheet open={sheet === "drills"} onClose={() => setSheet(null)} title="Drills">
        <DrillList
          current={mode}
          onPick={(m) => {
            setPrefs((p) => ({ ...p, mode: m }));
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet open={sheet === "settings"} onClose={() => setSheet(null)} title="Settings">
        <Settings prefs={prefs} setPrefs={setPrefs} />
      </Sheet>
    </div>
  );
}
