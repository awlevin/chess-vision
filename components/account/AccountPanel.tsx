"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useGames, type Game, type LinkedAccount, type TimeClass } from "@/lib/games";
import { CLOUD } from "@/lib/cloud";
import { SyncProgress } from "@/components/games";
import { formatDate, formatRelative, useNow } from "@/components/games/format";
import g from "@/components/games/games.module.css";
import s from "./account.module.css";

const TIME_CLASSES: { key: TimeClass; label: string }[] = [
  { key: "bullet", label: "Bullet" },
  { key: "blitz", label: "Blitz" },
  { key: "rapid", label: "Rapid" },
  { key: "daily", label: "Daily" },
];

export default function AccountPanel() {
  const { ready, account } = useGames();
  if (!ready) {
    return (
      <div className={`${g.panel} ${s.loading}`} role="status" aria-busy="true">
        <p>Loading your account…</p>
      </div>
    );
  }
  return account ? <LinkedView account={account} /> : <LinkForm />;
}

function LinkForm() {
  const { link, sync } = useGames();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      // Resolves after the import; this form unmounts as soon as the account is saved.
      await link(username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't link that account. Try again.");
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <form className={`${g.panel} ${s.linkForm}`} onSubmit={onSubmit} noValidate aria-busy={pending}>
      <h2>Link Chess.com</h2>
      <p id={`${id}-hint`}>
        Your Chess.com games are public, so all we need is your username. No password, no sign-in with Chess.com.
      </p>
      {/* A load error (e.g. cloud storage unreachable) is reported through sync. */}
      {sync.status === "error" && <p className={g.error} role="alert">{sync.message}</p>}
      <label htmlFor={`${id}-username`} className={s.label}>Chess.com username</label>
      <div className={s.inputRow}>
        <input
          ref={inputRef}
          id={`${id}-username`}
          name="username"
          className={s.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          readOnly={pending}
          required
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="e.g. hikaru"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
        />
        <button type="submit" className={g.button} disabled={pending}>Link account</button>
      </div>
      <div className={s.formStatus}>
        {pending && <p role="status">Checking Chess.com…</p>}
        {error && <p id={`${id}-error`} className={g.error} role="alert">{error}</p>}
      </div>
    </form>
  );
}

function LinkedView({ account }: { account: LinkedAccount }) {
  const { games, sync, lastSyncedAt, refresh, unlink } = useGames();
  const now = useNow();
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const stats = useMemo(() => summarize(games), [games]);
  const headingId = useId();
  const syncing = sync.status === "syncing";

  async function onUnlink() {
    setUnlinkError(null);
    setUnlinking(true);
    try {
      await unlink();
    } catch (err) {
      setUnlinkError(err instanceof Error ? err.message : "Couldn't unlink. Try again.");
      setUnlinking(false);
    }
  }

  return (
    <div className={s.stack}>
      <section className={`${g.panel} ${s.profile}`} aria-label="Linked Chess.com account">
        <Avatar account={account} />
        <div className={s.who}>
          <h2>{account.displayName}</h2>
          {account.name && <p className={s.realName}>{account.name}</p>}
          <a
            className={s.external}
            href={`https://www.chess.com/member/${encodeURIComponent(account.username)}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Chess.com<span className={s.srOnly}> (opens in a new tab)</span>
          </a>
        </div>
      </section>

      <section className={g.panel} aria-labelledby={headingId}>
        <h2 id={headingId}>Imported games</h2>

        {syncing && <div className={s.syncBox}><SyncProgress sync={sync} /></div>}
        {sync.status === "error" && (
          <div className={`${s.syncBox} ${s.syncError}`}>
            <p className={g.error} role="alert">{sync.message}</p>
          </div>
        )}

        <dl className={s.tiles}>
          <div className={s.total}>
            <dt>Games</dt>
            <dd>{stats.total.toLocaleString()}</dd>
          </div>
          {TIME_CLASSES.map((tc) => (
            <div key={tc.key}>
              <dt>{tc.label}</dt>
              <dd>{stats.byClass[tc.key].toLocaleString()}</dd>
            </div>
          ))}
        </dl>

        <dl className={s.facts}>
          <div>
            <dt>Date range</dt>
            <dd>
              {stats.first && stats.last ? (
                <>
                  <time dateTime={new Date(stats.first).toISOString()}>{formatDate(stats.first)}</time>
                  {" – "}
                  <time dateTime={new Date(stats.last).toISOString()}>{formatDate(stats.last)}</time>
                </>
              ) : (
                "No games yet"
              )}
            </dd>
          </div>
          <div>
            <dt>Last synced</dt>
            <dd>
              {lastSyncedAt != null ? (
                <time dateTime={new Date(lastSyncedAt).toISOString()} title={new Date(lastSyncedAt).toLocaleString()}>
                  {formatRelative(lastSyncedAt, now)}
                </time>
              ) : syncing ? (
                "Importing now"
              ) : (
                "Not yet"
              )}
            </dd>
          </div>
        </dl>

        <div className={s.actions}>
          <button
            type="button"
            className={g.button}
            onClick={() => void refresh()}
            disabled={syncing}
          >
            Refresh
          </button>
          <button type="button" className={`${g.button} ${g.quiet}`} onClick={onUnlink} disabled={unlinking}>
            Unlink
          </button>
        </div>
        <p className={s.note}>
          Games refresh on their own when you open the app and the last sync is over an hour old.
        </p>
        {unlinkError && <p className={g.error} role="alert">{unlinkError}</p>}
      </section>

      <p className={s.note}>
        {CLOUD
          ? "Your linked account follows your sign-in to every device. Each device keeps its own copy of your games and imports them the first time."
          : "Your linked account and games are saved in this browser. Unlink removes both."}
      </p>
    </div>
  );
}

function Avatar({ account }: { account: LinkedAccount }) {
  if (account.avatar) {
    // A small remote avatar from Chess.com's CDN; next/image would need a remotePatterns entry for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={s.avatar} src={account.avatar} alt="" width={64} height={64} referrerPolicy="no-referrer" />;
  }
  return (
    <span className={`${s.avatar} ${s.initial}`} aria-hidden="true">
      {account.displayName.slice(0, 1).toUpperCase()}
    </span>
  );
}

function summarize(games: Game[]) {
  const byClass: Record<TimeClass, number> = { bullet: 0, blitz: 0, rapid: 0, daily: 0 };
  for (const game of games) byClass[game.timeClass]++;
  return {
    total: games.length,
    byClass,
    // Games are oldest first.
    first: games.length ? games[0].endTime * 1000 : null,
    last: games.length ? games[games.length - 1].endTime * 1000 : null,
  };
}

