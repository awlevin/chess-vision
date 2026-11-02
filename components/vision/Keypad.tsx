// The naming keypad: files on top, ranks below, sized for a thumb.
import { FILES, RANKS } from "@/lib/drill";
import styles from "./vision.module.css";

export function Keypad({
  enabled,
  needsFile,
  nameFile,
  onFile,
  onRank,
}: {
  enabled: boolean;
  /** Name drills take a file first; the ranks wait for it. */
  needsFile: boolean;
  nameFile: string | null;
  onFile: (f: string) => void;
  onRank: (r: number) => void;
}) {
  return (
    <div className={styles.keypad} role="group" aria-label="Name the square">
      {FILES.map((f) => (
        <button
          key={f}
          type="button"
          className={styles.key}
          data-file
          aria-pressed={nameFile === f}
          disabled={!enabled}
          onClick={() => onFile(f)}
        >
          {f}
        </button>
      ))}
      {RANKS.map((r) => (
        <button
          key={r}
          type="button"
          className={styles.key}
          disabled={!enabled || (needsFile && !nameFile)}
          onClick={() => onRank(r)}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/** A slim strip, one segment per square in the round. Test hook: data-result on answered segments. */
export function Progress({ results, total, active }: { results: boolean[]; total: number; active: boolean }) {
  return (
    <div className={styles.progress} data-testid={active ? "round-progress" : undefined} role="img" aria-label={`${results.length} of ${total}`}>
      {Array.from({ length: total }, (_, i) =>
        i < results.length ? (
          <span key={i} data-result={results[i] ? "hit" : "miss"} />
        ) : (
          <span key={i} data-current={i === results.length || undefined} />
        ),
      )}
    </div>
  );
}
