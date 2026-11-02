"use client";

import Link from "next/link";
import { useGames, type LinkedAccount } from "@/lib/games";
import { APP_NAME, SECTIONS } from "@/lib/site";
import { KnightIcon } from "@/components/icons";
import { CountUp, LinkAccountPrompt, syncLabel, useNow } from "@/components/games";
import s from "./hub.module.css";

const DESTINATIONS = SECTIONS.filter((x) => x.href !== "/account");
const ART = { "/vision": VisionArt, "/openings": OpeningsArt } as const;

function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The home page: a greeting, one line of momentum, and the two places to go,
 * set as an editorial index rather than a grid of cards.
 */
export default function Hub({ user }: { user?: React.ReactNode }) {
  const { ready, account } = useGames();
  const now = useNow();
  // The greeting depends on the local clock, so it waits for the client.
  const hello = now ? greeting(now) : "Hello";

  return (
    <>
      <div className={s.top}>
        <span className={s.brand}><KnightIcon />{APP_NAME}</span>
        {user && <div className="phone-only">{user}</div>}
      </div>

      <header className={s.head} data-ready={now > 0 && ready ? "" : undefined}>
        <h1 className={s.hello}>
          {account ? (
            <>
              {hello},<br />
              <span className={s.name}>{account.displayName}.</span>
            </>
          ) : (
            <>{hello}.</>
          )}
        </h1>
        <Momentum account={account} />
      </header>

      <nav aria-label="Start" className={s.index}>
        {DESTINATIONS.map((d, i) => {
          const Art = ART[d.href];
          return (
            <Link key={d.href} href={d.href} className={`${s.row} rise`} style={{ "--i": i + 1 } as React.CSSProperties}>
              <span className={s.num} aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span className={s.words}>
                <span className={s.title}>{d.title}</span>
                <span className={s.blurb}>{d.blurb}</span>
              </span>
              <Art />
            </Link>
          );
        })}
      </nav>

      {ready && !account && (
        <div className="rise" style={{ "--i": DESTINATIONS.length + 1 } as React.CSSProperties}>
          <LinkAccountPrompt>Link Chess.com to see how your openings score.</LinkAccountPrompt>
        </div>
      )}
    </>
  );
}

/** "156 games imported", or the import's progress while it runs. */
function Momentum({ account }: { account: LinkedAccount | null }) {
  const { games, sync } = useGames();
  if (!account) return <p className={s.momentum}>Sharpen your eye, then bring your own games.</p>;
  return (
    <p className={s.momentum}>
      <Avatar account={account} />
      {sync.status === "syncing" && games.length === 0 ? (
        <span>{syncLabel(sync)}</span>
      ) : (
        <span>
          <CountUp value={games.length} className={s.count} /> {games.length === 1 ? "game" : "games"} imported
          {sync.status === "syncing" && <span className={s.busy}> · importing</span>}
        </span>
      )}
    </p>
  );
}

function Avatar({ account }: { account: LinkedAccount }) {
  if (account.avatar) {
    // A small remote avatar from Chess.com's CDN; next/image would need a remotePatterns entry for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={s.avatar} src={account.avatar} alt="" width={24} height={24} referrerPolicy="no-referrer" />;
  }
  return <span className={`${s.avatar} ${s.initial}`} aria-hidden="true">{account.displayName.slice(0, 1).toUpperCase()}</span>;
}

/** A corner of the board with one square called out. */
function VisionArt() {
  const squares = [];
  for (let r = 0; r < 3; r++) {
    for (let f = 0; f < 3; f++) {
      if (r === 1 && f === 1) continue;
      squares.push(
        <rect key={`${r}${f}`} x={4 + f * 20} y={4 + r * 20} width="20" height="20" className={(r + f) % 2 ? s.dark : s.light} />,
      );
    }
  }
  return (
    <svg className={s.art} viewBox="0 0 68 68" aria-hidden="true">
      {squares}
      <g className={s.target}>
        <rect x="24" y="24" width="20" height="20" rx="2" />
        <text x="34" y="38.5" textAnchor="middle">e4</text>
      </g>
    </svg>
  );
}

/** A line of moves that branches: your main line in brass. */
function OpeningsArt() {
  return (
    <svg className={s.art} viewBox="0 0 68 68" aria-hidden="true" fill="none" strokeLinecap="round">
      <path className={s.side} d="M34 46c0-10-14-12-16-24M34 46c0-8 4-14 2-30" />
      <path className={s.main} d="M34 62V46c0-10 14-14 18-26" pathLength="1" />
      <circle className={s.node} cx="34" cy="62" r="3" />
      <circle className={s.node} cx="34" cy="46" r="3" />
      <circle className={s.nodeSide} cx="18" cy="22" r="2.5" />
      <circle className={s.nodeSide} cx="36" cy="16" r="2.5" />
      <circle className={s.nodeEnd} cx="52" cy="20" r="3.5" />
    </svg>
  );
}
