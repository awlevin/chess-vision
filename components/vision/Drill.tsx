// One drill on screen: the prompt, the progress strip, the board, and the
// thumb zone below it (Begin, the keypad, or the miss card). At round end
// the whole view becomes the summary.
import { useState } from "react";
import { lineSquares, type Square } from "@/lib/drill";
import { Board, type MarkKind } from "./Board";
import { ROUND_LEN, drillFor, pieceFor, type DrillConfig, type Labels } from "./config";
import { HeatBoard } from "./HeatBoard";
import { Keypad, Progress } from "./Keypad";
import { Prompt } from "./Prompt";
import { RoundSummary } from "./RoundSummary";
import { Sheet } from "./Sheet";
import { streakOf, useDrill } from "./useDrill";
import styles from "./vision.module.css";

export function Drill({ active, config, labels }: { active: boolean; config: DrillConfig; labels: Labels }) {
  const {
    phase, square, pending, round, history, stats, named, loaded, promptId, nameFile, isReview, startedAt,
    lastTime, from, pulse, roundKey, boardRef, begin, answer, pressFile, pressRank, resolvePending,
  } = useDrill(config, active);
  const { mode, orientation, piece } = config;
  const [statsOpen, setStatsOpen] = useState(false);

  if (phase === "roundend") {
    return (
      <RoundSummary active={active} round={round} history={history} stats={stats} orientation={orientation} mode={mode} onNext={begin} />
    );
  }

  const live = phase !== "ready";
  const answered = live ? round.length : 0;
  const best = history.length ? Math.min(...history.map((h) => h.avg)) : null;
  const side = orientation === "white" ? "White" : "Black";

  // ---- what the board shows ----
  const marks: Record<Square, MarkKind> = {};
  const mark = (key: string, kind: MarkKind) => {
    for (const sq of mode === "line" ? lineSquares(key) : [key]) marks[sq] = kind;
  };
  if (phase === "solve" || phase === "flash") {
    if (mode === "tour" && from) marks[from] = "from";
    if (mode !== "find") mark(square, mode === "line" ? "line" : "target");
  }
  if (phase === "wrongpause" && pending) {
    mark(pending.given, "wrong");
    mark(square, "answer");
  }
  const showPiece = named && live;

  return (
    <section className={styles.drill} data-phase={phase}>
      <Prompt
        active={active}
        phase={phase}
        mode={mode}
        square={square}
        promptId={promptId}
        nameFile={nameFile}
        isReview={isReview}
        startedAt={startedAt}
        lastTime={lastTime}
        streak={live ? streakOf(round) : 0}
        ready={{
          title: `${ROUND_LEN} ${drillFor(mode).units}`,
          sub: `As ${side}${best != null ? ` · best ${best.toFixed(2)}s` : ""}`,
        }}
      />
      <Progress results={round.slice(0, answered).map((r) => r.correct)} total={ROUND_LEN} active={active} />

      <Board
        ref={boardRef}
        orientation={orientation}
        labels={labels}
        marks={marks}
        piece={showPiece ? { sq: square, code: pieceFor(piece ?? "knight").code, slide: mode === "tour" } : undefined}
        onPick={mode === "find" && phase === "solve" ? answer : undefined}
        pulse={live ? pulse : null}
        dim={!live}
        sheen={live ? roundKey : null}
      />

      <div className={styles.thumb} data-named={mode !== "find" || undefined}>
        {phase === "ready" ? (
          <div key="ready" className={styles.enter}>
            <button type="button" className={styles.primary} onClick={begin} disabled={!loaded}>
              Begin
            </button>
            {Object.keys(stats).length > 0 && (
              <button type="button" className={styles.textBtn} onClick={() => setStatsOpen(true)}>
                Your squares
              </button>
            )}
          </div>
        ) : phase === "wrongpause" && pending ? (
          <div key="miss" className={`${styles.enter} ${styles.miss}`}>
            <p>
              You {mode === "find" ? "tapped" : "named"} <b>{pending.given}</b>
            </p>
            <div className={styles.missBtns}>
              <button type="button" className={styles.textBtn} onClick={() => resolvePending("slip")}>
                {mode === "find" ? "Misclick" : "Mistap"}
              </button>
              <button type="button" className={styles.primary} onClick={() => resolvePending("wrong")}>
                Continue
              </button>
            </div>
          </div>
        ) : mode !== "find" ? (
          <Keypad
            enabled={phase === "solve"}
            needsFile={named}
            nameFile={nameFile}
            onFile={pressFile}
            onRank={pressRank}
          />
        ) : null}
      </div>

      <Sheet open={statsOpen} onClose={() => setStatsOpen(false)} title="Your squares">
        <HeatBoard stats={stats} orientation={orientation} mode={mode} />
      </Sheet>
    </section>
  );
}
