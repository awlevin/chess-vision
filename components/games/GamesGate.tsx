"use client";

import { useGames } from "@/lib/games";
import { KnightIcon } from "@/components/icons";
import { LinkAccountPrompt } from "./LinkAccountPrompt";
import { SyncProgress } from "./SyncStatus";
import styles from "./games.module.css";

export interface GamesGateProps {
  /** Rendered once the linked account has at least one imported game. */
  children: React.ReactNode;
  /** Passed to the LinkAccountPrompt shown when no account is linked. */
  linkTitle?: string;
  /** Body for that prompt: one short line on what this feature shows once linked. */
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
      <div className={`${styles.card} ${styles.loading}`} role="status" aria-busy="true">
        <span className="sr-only">Loading your games…</span>
        <span className={styles.skeleton} aria-hidden="true" />
        <span className={`${styles.skeleton} ${styles.short}`} aria-hidden="true" />
      </div>
    );
  }
  if (!account) return <LinkAccountPrompt title={linkTitle}>{linkMessage}</LinkAccountPrompt>;
  if (games.length > 0) return <>{children}</>;

  if (sync.status === "syncing") {
    return (
      <section className={styles.card} aria-busy="true">
        <h2 className={styles.title}>Fetching {account.displayName}’s games</h2>
        <SyncProgress sync={sync} />
      </section>
    );
  }
  if (sync.status === "error") {
    return (
      <section className={styles.card}>
        <h2 className={styles.title}>Couldn’t import your games</h2>
        <p className={`${styles.line} ${styles.error}`} role="alert">{sync.message}</p>
        <button type="button" className={styles.button} onClick={() => void refresh()}>Try again</button>
      </section>
    );
  }
  return (
    <section className={`${styles.card} ${styles.prompt}`}>
      <KnightIcon className={`${styles.knight} ${styles.sitting}`} />
      <div className={styles.promptText}>
        <h2 className={styles.title}>No games yet</h2>
        <p className={styles.line}>Play a few on Chess.com, then refresh.</p>
      </div>
      <button type="button" className={`${styles.button} ${styles.quiet}`} onClick={() => void refresh()}>Refresh</button>
    </section>
  );
}
