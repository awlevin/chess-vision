"use client";

import Link from "next/link";
import { useGames, type SyncState } from "@/lib/games";
import { formatCount, formatRelative, syncLabel, useNow } from "./format";
import styles from "./games.module.css";

/** A labelled progress bar for a running import. */
export function SyncProgress({ sync }: { sync: Extract<SyncState, { status: "syncing" }> }) {
  const label = syncLabel(sync);
  return (
    <div className={styles.progress}>
      <span className={styles.label} role="status">{label}</span>
      {/* No value while the month list is being checked: an indeterminate bar. */}
      <progress
        className={styles.bar}
        aria-label="Import progress"
        max={sync.total || undefined}
        value={sync.total ? sync.done : undefined}
      />
    </div>
  );
}

/**
 * One compact line for a feature's header: "1,234 games from Hikaru · synced
 * 5 minutes ago · Refresh", the import's progress while it runs, or the last
 * error with a Retry button. Renders nothing until the games have loaded.
 */
export function SyncStatus({ showRefresh = true, className }: { showRefresh?: boolean; className?: string }) {
  const { ready, account, games, sync, lastSyncedAt, refresh } = useGames();
  const now = useNow();
  if (!ready) return null;
  const cls = [styles.status, className].filter(Boolean).join(" ");

  if (!account) {
    return (
      <p className={cls}>
        <span className={styles.text}>No Chess.com account linked. <Link href="/account">Link one</Link></span>
      </p>
    );
  }

  if (sync.status === "syncing") {
    return (
      <div className={cls}>
        <span className={styles.text} role="status">
          <span className={`${styles.dot} ${styles.busy}`} aria-hidden="true" />
          {syncLabel(sync)}
        </span>
        <progress
          className={styles.bar}
          aria-label="Import progress"
          max={sync.total || undefined}
          value={sync.total ? sync.done : undefined}
        />
      </div>
    );
  }

  if (sync.status === "error") {
    return (
      <div className={cls}>
        <span className={`${styles.text} ${styles.error}`} role="alert">
          <span className={`${styles.dot} ${styles.bad}`} aria-hidden="true" />
          {sync.message}
        </span>
        <button type="button" className={styles.linkButton} onClick={() => void refresh()}>Retry</button>
      </div>
    );
  }

  return (
    <div className={cls}>
      <span className={styles.text}>
        <span className={styles.dot} aria-hidden="true" />
        {formatCount(games.length, "game")} from {account.displayName}
        {lastSyncedAt != null && <> · synced {formatRelative(lastSyncedAt, now)}</>}
      </span>
      {showRefresh && (
        <button type="button" className={styles.linkButton} onClick={() => void refresh()}>Refresh</button>
      )}
    </div>
  );
}
