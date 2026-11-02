"use client";

import { useGames } from "@/lib/games";
import { LinkAccountPrompt } from "./LinkAccountPrompt";
import { SyncProgress } from "./SyncStatus";
import styles from "./games.module.css";

export interface GamesGateProps {
  /** Rendered once the linked account has at least one imported game. */
  children: React.ReactNode;
  /** Passed to the LinkAccountPrompt shown when no account is linked. */
  linkTitle?: string;
  /** Body for that prompt: say what this feature shows once linked. */
  linkMessage?: React.ReactNode;
}

/**
 * Wraps a feature that needs the player's games. It shows the right empty
 * state until there is something to render: loading, "link your account",
 * the first import's progress, an import error, or "no games yet". After the
 * first games arrive it always renders `children`, even during later syncs.
 */
export function GamesGate({ children, linkTitle, linkMessage }: GamesGateProps) {
  const { ready, account, games, sync, refresh } = useGames();

  if (!ready) {
    return (
      <div className={styles.panel} role="status" aria-busy="true">
        <p>Loading your games…</p>
      </div>
    );
  }
  if (!account) return <LinkAccountPrompt title={linkTitle}>{linkMessage}</LinkAccountPrompt>;
  if (games.length > 0) return <>{children}</>;

  if (sync.status === "syncing") {
    return (
      <section className={styles.panel} aria-busy="true">
        <h2>Importing {account.displayName}’s games</h2>
        <p>This runs once per device. Later visits only fetch new games.</p>
        <SyncProgress sync={sync} />
      </section>
    );
  }
  if (sync.status === "error") {
    return (
      <section className={styles.panel}>
        <h2>Couldn’t import your games</h2>
        <p className={styles.error} role="alert">{sync.message}</p>
        <button type="button" className={styles.button} onClick={() => void refresh()}>Try again</button>
      </section>
    );
  }
  return (
    <section className={styles.panel}>
      <h2>No games yet</h2>
      <p>{account.displayName} has no finished games on Chess.com yet. Play a few, then refresh.</p>
      <button type="button" className={`${styles.button} ${styles.quiet}`} onClick={() => void refresh()}>Refresh</button>
    </section>
  );
}
