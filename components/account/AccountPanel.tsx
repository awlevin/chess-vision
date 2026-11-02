"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useGames, type Game, type LinkedAccount, type TimeClass } from "@/lib/games";
import { CLOUD } from "@/lib/cloud";
import { CountUp, RefreshButton, SyncProgress, formatMonth, formatRelative, useNow } from "@/components/games";
import { ExternalIcon, KnightIcon, MoreIcon } from "@/components/icons";
import g from "@/components/games/games.module.css";
import s from "./account.module.css";

const TIME_CLASSES: { key: TimeClass; label: string }[] = [
  { key: "bullet", label: "Bullet" },
  { key: "blitz", label: "Blitz" },
  { key: "rapid", label: "Rapid" },
  { key: "daily", label: "Daily" },
];

/** The /account page body. `user` is the Clerk user menu (cloud mode), shown here on phones. */
export default function AccountPanel({ user }: { user?: React.ReactNode }) {
  const { ready, account } = useGames();
  if (!ready) {
    return (
      <div className={s.loading} role="status" aria-busy="true">
        <span className="sr-only">Loading your account…</span>
        <span className={`${g.skeleton} ${s.skeletonAvatar}`} aria-hidden="true" />
        <span className={`${g.skeleton} ${s.skeletonNumber}`} aria-hidden="true" />
        <span className={`${g.skeleton} ${g.short}`} aria-hidden="true" />
      </div>
    );
  }
  return account ? <LinkedView account={account} user={user} /> : <LinkForm user={user} />;
}

function LinkForm({ user }: { user?: React.ReactNode }) {
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
    <section className={s.linkView} aria-labelledby={`${id}-title`}>
      {user && <div className={`${s.userSlot} phone-only`}>{user}</div>}
      <KnightIcon className={`${s.bigKnight} ${pending ? s.hopping : g.sitting}`} />
      <h2 id={`${id}-title`} className={`${s.linkTitle} rise`} style={{ "--i": 1 } as React.CSSProperties}>
        Bring your games.
      </h2>
      <p id={`${id}-hint`} className={`${s.linkLine} rise`} style={{ "--i": 2 } as React.CSSProperties}>
        Just your Chess.com username. No password.
      </p>

      <form className={`${s.form} rise`} style={{ "--i": 3 } as React.CSSProperties} onSubmit={onSubmit} noValidate aria-busy={pending}>
        {/* A load error (e.g. cloud storage unreachable) is reported through sync. */}
        {sync.status === "error" && <p className={s.alert} role="alert">{sync.message}</p>}
        <label htmlFor={`${id}-username`} className={s.label}>Chess.com username</label>
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
        <button type="submit" className={`${g.button} ${s.submit}`} disabled={pending}>Link account</button>
        <div className={s.formStatus}>
          {pending && <p role="status">Checking Chess.com…</p>}
          {error && <p id={`${id}-error`} className={s.alert} role="alert">{error}</p>}
        </div>
      </form>
    </section>
  );
}

function LinkedView({ account, user }: { account: LinkedAccount; user?: React.ReactNode }) {
  const { games, sync, lastSyncedAt, refresh } = useGames();
  const now = useNow();
  const stats = useMemo(() => summarize(games), [games]);
  const syncing = sync.status === "syncing";
  const classes = TIME_CLASSES.filter((tc) => stats.byClass[tc.key] > 0).sort(
    (a, b) => stats.byClass[b.key] - stats.byClass[a.key],
  );

  return (
    <div className={s.linked}>
      <div className={`${s.bar} rise`}>
        <Avatar account={account} />
        <div className={s.who}>
          <h2>{account.displayName}</h2>
          <p>{account.name ?? "Chess.com"}</p>
        </div>
        {user && <div className="phone-only">{user}</div>}
        <AccountOptions account={account} total={stats.total} />
      </div>

      <section className={s.hero} aria-label="Imported games">
        <CountUp value={stats.total} className={s.numeral} data-testid="game-count" />
        <p className={s.caption}>
          {stats.total === 1 ? "game" : "games"}
          {/* Months arrive newest first, so the start date only means something once the import is done. */}
          {syncing ? " so far" : stats.first != null && <> since {formatMonth(stats.first)}</>}
        </p>
        {classes.length > 0 && (
          <ul className={s.chips} aria-label="By time control">
            {classes.map((tc, i) => (
              <li key={tc.key} className="rise" style={{ "--i": i + 2 } as React.CSSProperties}>
                {tc.label} <span>{stats.byClass[tc.key].toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={s.syncRow}>
        {syncing ? (
          <SyncProgress sync={sync} className={s.syncProgress} />
        ) : (
          <p className={s.synced}>
            {lastSyncedAt != null ? (
              <>
                Synced{" "}
                <time dateTime={new Date(lastSyncedAt).toISOString()} title={new Date(lastSyncedAt).toLocaleString()}>
                  {formatRelative(lastSyncedAt, now)}
                </time>
              </>
            ) : (
              "Not synced yet"
            )}
          </p>
        )}
        <RefreshButton syncing={syncing} onClick={() => void refresh()} />
      </div>
      {sync.status === "error" && <p className={s.alert} role="alert">{sync.message}</p>}
    </div>
  );
}

/** "⋯" opens a sheet with the profile link and Unlink (which asks once). */
function AccountOptions({ account, total }: { account: LinkedAccount; total: number }) {
  const { unlink } = useGames();
  const ref = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  function open() {
    setConfirming(false);
    setError(null);
    ref.current?.showModal();
  }
  const close = () => ref.current?.close();

  async function onUnlink() {
    setError(null);
    setUnlinking(true);
    try {
      await unlink(); // this view unmounts once the account is gone
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlink. Try again.");
      setUnlinking(false);
    }
  }

  return (
    <>
      <button type="button" className={g.iconButton} aria-label="Account options" aria-haspopup="dialog" onClick={open}>
        <MoreIcon />
      </button>
      <dialog
        ref={ref}
        className={s.sheet}
        aria-labelledby={titleId}
        onClose={() => setConfirming(false)}
        // A tap on the backdrop lands on the dialog itself, outside the content.
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className={s.sheetBody}>
          <span className={s.grabber} aria-hidden="true" />
          <h2 id={titleId} className={s.sheetTitle}>{account.displayName}</h2>
          <p className={s.sheetNote}>
            {CLOUD ? "Linked to your sign-in on every device." : "Linked in this browser only."}
          </p>

          <a
            className={s.sheetRow}
            href={`https://www.chess.com/member/${encodeURIComponent(account.username)}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Chess.com<span className="sr-only"> (opens in a new tab)</span>
            <ExternalIcon />
          </a>

          {confirming ? (
            <div className={s.confirm}>
              <p>Forget {account.displayName} and {total.toLocaleString()} imported {total === 1 ? "game" : "games"}?</p>
              <div className={s.confirmActions}>
                <button type="button" className={`${g.button} ${s.danger}`} onClick={onUnlink} disabled={unlinking}>
                  Yes, unlink
                </button>
                <button type="button" className={`${g.button} ${g.quiet}`} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={`${s.sheetRow} ${s.dangerText}`} onClick={() => setConfirming(true)}>
              Unlink Chess.com
            </button>
          )}
          {error && <p className={s.alert} role="alert">{error}</p>}

          <button type="button" className={`${g.textButton} ${s.done}`} onClick={close}>Done</button>
        </div>
      </dialog>
    </>
  );
}

function Avatar({ account }: { account: LinkedAccount }) {
  if (account.avatar) {
    // A small remote avatar from Chess.com's CDN; next/image would need a remotePatterns entry for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={s.avatar} src={account.avatar} alt="" width={48} height={48} referrerPolicy="no-referrer" />;
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
  };
}
