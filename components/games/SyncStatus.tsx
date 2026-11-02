"use client";

import Link from "next/link";
import { useGames, type SyncState } from "@/lib/games";
import { KnightIcon } from "@/components/icons";
import { formatCount, formatRelative, syncLabel, useNow } from "./format";
import { RefreshButton } from "./RefreshButton";
import styles from "./games.module.css";

type Syncing = Extract<SyncState, { status: "syncing" }>;

/**
 * A running import: the knight hops along a rank that fills with brass,
 * labelled "Importing month 3 of 25". While the month list is still being
 * checked it hops in place at the start.
 */
export function SyncProgress({ sync, className }: { sync: Syncing; className?: string }) {
  const label = syncLabel(sync);
  const pct = sync.total ? Math.min(100, (sync.done / sync.total) * 100) : 0;
  return (
    <div className={[styles.progress, className].filter(Boolean).join(" ")}>
      <div
        className={styles.rail}
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={sync.total || undefined}
        aria-valuenow={sync.total ? sync.done : undefined}
        style={{ "--p": `${pct}%` } as React.CSSProperties}
      >
        <span className={styles.fill} />
        <span className={styles.rider}>
          <KnightIcon className={styles.hopper} />
          <span className={styles.shadow} />
        </span>
      </div>
      <span className={styles.label} role="status">{label}</span>
    </div>
  );
}

/**
 * One compact line for a feature's header: "1,234 games · synced 5 minutes
 * ago" with a round refresh button, the import's progress while it runs, or
 * the last error with Retry. Renders nothing until the games have loaded.
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
    return <SyncProgress sync={sync} className={cls} />;
  }

  if (sync.status === "error") {
    return (
      <div className={cls}>
        <span className={`${styles.text} ${styles.error}`} role="alert">
          <span className={`${styles.dot} ${styles.bad}`} aria-hidden="true" />
          {sync.message}
        </span>
        <button type="button" className={styles.textButton} onClick={() => void refresh()}>Retry</button>
      </div>
    );
  }

  return (
    <div className={cls}>
      <span className={styles.text}>
        {formatCount(games.length, "game")}
        {lastSyncedAt != null && <> · synced {formatRelative(lastSyncedAt, now)}</>}
      </span>
      {showRefresh && <RefreshButton size="sm" onClick={() => void refresh()} />}
    </div>
  );
}
