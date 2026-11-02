# Chess Companion

_A chess companion: board-vision drills, analysis of your own Chess.com games, and practice on the openings you actually reach._

The name lives in `lib/site.ts`, so a rename is a one-line change.

| Section | Route | What it does |
|---|---|---|
| Vision | `/vision` | Timed drills to find and name squares and follow pieces around the board |
| Openings | `/openings` | How your openings score in your own games, and drills on the moves you get wrong |
| Account | `/account` | Link your Chess.com username and import your games |

Features that analyse your play all read the same imported games through one
contract (`useGames()` in `lib/games`). [Your Chess.com games](#your-chesscom-games)
explains how they get there.

## Vision drills

Inspired by chess.com's Vision trainer. You get a coordinate and click the square, or
a square lights up and you name it, and every answer is timed to the hundredth of a
second. The app keeps per-square stats and uses them to decide which squares you see
next. The drills live in `components/ChessVision.tsx` and `lib/drill.ts`.

### The drills

| Drill | What it does |
|---|---|
| Find the square | A coordinate appears, and you click it |
| Name the file or rank | A whole file or rank lights up, and you name it with one tap or key (`c`, `6`). A warm-up for naming full squares |
| Name the square | A knight lands on a square, and you name it by tapping a file and then a rank, or typing them (e.g. `e` `4`) |
| Follow the piece | A knight, bishop, rook or queen hops around the board one legal move at a time. You name each square it lands on. The square it left stays marked, so you learn the shape of its moves |

Before each round, and on the round-end card, you choose:

- **Play as** White or Black. Black flips the board. Each drill keeps separate stats
  for each side, because finding e4 from Black's side is a different skill from
  finding it from White's side.
- **Piece** (Follow the piece only). Each piece keeps its own stats.
- **Board labels**: file letters (a–h) along the bottom edge, rank numbers (1–8)
  along the left edge, both, or neither. Both are off by default.

A round is 20 squares. The clock starts when you press **Begin** or Enter, not when
the page loads.

### How it picks squares

This is the same adaptive picker as the sprints in
[mental-math-trainer](https://github.com/awlevin/mental-math-trainer), applied to the
64 squares instead of the 64 times-table facts. It lives in `lib/drill.ts`. The file and
rank drill uses the same picker over 16 lines (8 files and 8 ranks) instead of 64 squares.
Follow the piece draws only from the squares the piece can reach from where it is, and
never hops straight back. A missed square comes back when the piece can next reach it.

Each square keeps three numbers: how many times you've seen it, how many times you
missed it, and an exponentially weighted average of your answer time
(`0.6 * old + 0.4 * latest`). Each square is drawn from a weighted sample over all 64:

- base weight 1, plus up to 5 more in proportion to your miss rate on that square
- plus up to 2.5 more if that square's average time is above your global average
- plus up to 2 more for the squares you've seen least, so coverage stays even
- squares you've never seen start with a high weight, so they come up early

If you miss a square, it is queued to come back twice: once 2–4 squares later and once
7–10 squares later. If you get a square right but slowly (over 1.6x your round average,
and never under 2 seconds), it is queued once, 4–7 squares later. A requeued square is
labelled **Review** when it comes back.

A wrong click shows your square in red and the right one in green. If it was a
slip of the finger, **Misclick — count it** records the attempt as correct but keeps
your real time.

### Stats

At the end of a round you see:

- your average per square, total time and accuracy
- the squares you missed and what you clicked instead
- your three slowest correct squares
- the squares getting extra reps next round
- an 8x8 heat map drawn as the board itself, from the side you're drilling, which you
  can switch between average time, attempts and misses
- your past rounds, with the best one highlighted

The heat map also shows under the board before each round.

## Openings

_This section is written with the Openings feature._

## Your Chess.com games

On `/account` you link a Chess.com username. The app checks it against the
profile endpoint, so an unknown name gets a clear error, and then it imports the
player's games. The page shows the import's progress. When it finishes, the page
shows the avatar and name, the game count by time class, the date range, when the
games were last synced, and **Refresh** and **Unlink** buttons.

### Ownership verification (not built)

Linking a username does not prove that you own it. That is deliberate. Everything
the app reads comes from Chess.com's published-data API, which anyone can read, so
linking someone else's username only shows you analysis of games that are already
public. Nothing is written to Chess.com, and no private data is involved.

If a future feature needs real ownership, for example posting to the account or
showing other players "verified" stats, the usual approach without OAuth is a
challenge. The app issues a short random code, the user pastes it into their
Chess.com profile's location or bio field, and the server fetches
`/pub/player/{username}` and checks for the code before it marks the link as
verified (in `user_storage`, against the Clerk user). Chess.com also offers OAuth to
approved apps, which would replace the challenge.

### Where the data lives

| What | Where | Scope |
|---|---|---|
| The linked account (`LinkedAccount` JSON) | `window.storage` key `games-account-v1` | Local mode: this browser (`localStorage` key `cv:games-account-v1`). Cloud mode: the signed-in Clerk user's `user_storage` row, so it follows them to every device |
| Imported games | IndexedDB database `games-cache`, store `months`, one record per `[username, "yyyy/mm"]` holding that month's raw Chess.com JSON and when it was fetched | This device |
| Sync bookkeeping | IndexedDB `games-cache`, store `meta`, one record per username: `lastSyncedAt` and the fetch time of each cached month | This device |

The games are public and cheap to fetch again, and a heavy account is about 1,500
games and 5 MB of JSON. That is too big for `localStorage` and not worth putting in
Postgres, so each device keeps its own copy. Games are stored raw and normalized
through `normalizeChessComGame` on load. A fix to the normalizer, or a new field on
`Game`, therefore takes effect without downloading anything again. If IndexedDB is
unavailable (as in some private-browsing modes), games are kept in memory for the
visit.

### How a sync works

`lib/games/store.ts` runs the sync. `lib/games/chesscom.ts` is the API client.

1. Fetch `/pub/player/{u}/games/archives`, the list of months that have games.
2. Choose the months to fetch: those not cached yet, plus any cached month that was
   still in progress when it was fetched. A month counts as finished once it was
   fetched at least 12 hours after it ended (UTC). The slack covers late-arriving
   games and time-zone skew. This rule always includes the current month. Past
   months never change, so they are fetched once.
3. Fetch those months **one request at a time** (Chess.com asks clients not to make
   requests in parallel), newest first, so the most recent games arrive first. The
   state is `{ status: "syncing", done, total }`, counted in months. Each month is
   written to IndexedDB as soon as it arrives.
4. Retry a 429 or a transient failure (5xx, network error) up to 3 times with jittered
   backoff (about 0.6 s, 1.5 s, then 4 s, doubled for 429, using `Retry-After` when
   it is readable). If a month still fails, the sync moves on to the next month,
   except after a 429, a network failure, or two failures in a row, when it stops.
   Whatever it fetched is kept, and `sync` becomes
   `{ status: "error", message }` with a readable message such as
   "1 of 24 months couldn't be imported. Chess.com is having trouble (error 503)…".
   The next sync fetches only what is still missing.
5. A sync that completes stamps `lastSyncedAt`. A failed one does not, so it is retried.

Syncs start on their own:

- When a linked account has no completed sync on this device, such as a new device
  in cloud mode, or after an interrupted import.
- When the app opens, the tab becomes visible, or the browser comes back online, and
  the last sync is over an hour old (`STALE_AFTER_MS`). A visible tab also checks
  every 5 minutes.
- Not within 5 minutes of a failed sync, so a broken connection doesn't loop.

One store, rendered once in the root layout (`components/AppProviders.tsx`), serves
every page, so moving between pages never reloads or refetches. Syncs of one account
are serialised across tabs with the Web Locks API, and a `BroadcastChannel` tells
other tabs when games were synced or the account was linked or unlinked. While a sync
runs, new games are published at most every 1.5 s. A refresh that finds nothing new
leaves the `games` array untouched, so features that memoise on it don't recompute.

### Using the games in a feature

```tsx
"use client";
import { useGames } from "@/lib/games";
import { GamesGate, SyncStatus } from "@/components/games";

export default function MyFeature() {
  return (
    <GamesGate linkMessage="Link your Chess.com account to see how your openings score.">
      <SyncStatus />
      <Analysis />
    </GamesGate>
  );
}

function Analysis() {
  const { games } = useGames(); // Game[], oldest first
  // ...
}
```

`useGames()` returns `account`, `ready`, `games`, `sync` and `lastSyncedAt` (the
`GamesState` in `lib/games/types.ts`), plus `link(username)`, `unlink()` and
`refresh()`. Features import only from `@/lib/games` and depend only on `Game`, never
on raw Chess.com JSON.

`components/games` has drop-in UI for the states a feature has to handle:

| Component | Use |
|---|---|
| `<GamesGate linkTitle? linkMessage?>` | Wrap a feature. Shows loading, a link prompt, the first import's progress, an import error with **Try again**, or "No games yet" until there are games, then renders its children |
| `<LinkAccountPrompt title? headingLevel?>` | The "Link your Chess.com account" card with a link to `/account`. Its children are the body text |
| `<SyncStatus showRefresh?>` | One line: "1,527 games from Hikaru · synced 5 minutes ago · Refresh", the import's progress, or the last error with **Retry** |
| `<SyncProgress sync>` | A labelled progress bar for a running import |

## How it's built

- **Next.js 16 App Router.** `app/layout.tsx` renders the section nav (`components/AppNav.tsx`)
  and `components/AppProviders.tsx`, which installs `window.storage` and the games store
  for every page. Shared design tokens are in `app/globals.css`.
- `lib/site.ts` holds the app name and sections.
- `lib/games` holds the games contract (`types.ts`), the Chess.com normalizer, the API
  client, the IndexedDB cache and the sync store.
- The vision drills keep their UI in `components/ChessVision.tsx` and their logic in `lib/drill.ts`.
- Everything that saves per-user state goes through an async `window.storage` key/value
  API, the same contract the mental math trainer uses. `lib/storage-client.ts` installs it.

### Two storage modes

**Local mode** is the default when no Clerk key is set. There's no sign-in, and
`window.storage` keeps drill stats and the linked account in this browser's
`localStorage` under `cv:`-prefixed keys.

**Cloud mode** turns on when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set at build time.
It works the same way as the mental math trainer:

- Clerk protects every route through `proxy.ts`.
- `/api/storage/[key]` scopes reads and writes to the Clerk user id.
- Drill stats and the linked account are stored in Neon Postgres in the same
  `user_storage` table. Imported games stay in each device's IndexedDB (see above).
- If the signed-in user changes, the games store reloads for the new user.

The keys are namespaced (`cv-find-white-v1`, `games-account-v1`, …), so you can point
this app at the **same Clerk application and the same Neon database** as the mental
math trainer, and one sign-in covers both. The first time cloud mode runs in a browser,
any local-mode values there are uploaded once.

## Running it locally

```sh
npm install
npm run dev        # local mode, no setup needed
```

Then open http://localhost:3000.

For cloud mode, copy `.env.example` to `.env.local` and fill in all three values:

| Name | Where it comes from |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard, API keys (or reuse the mental math trainer's) |
| `CLERK_SECRET_KEY` | same place |
| `DATABASE_URL` | Neon connection string (or reuse the mental math trainer's) |

Then run `npm run db:init` once. It's a no-op if the table already exists.

## Tests

```sh
npx playwright install chromium   # once
npx playwright test               # builds, starts on E2E_PORT (default 3123), runs desktop + mobile
```

The end-to-end tests drive the production build in local mode. `tests/e2e/chesscom-mock.ts`
fakes api.chess.com from `tests/fixtures/chesscom-testplayer.json` (user `testplayer`,
156 real games over 4 months). `tests/e2e/account.spec.ts` covers linking, import,
incremental refresh, a new device, stale auto-refresh, partial failure and unlinking,
and it checks which requests reach Chess.com.

Next.js renders a hidden route announcer with `role="alert"`, so scope alert queries
to the page: `page.getByRole("main").getByRole("alert")`.

## Deploying

```sh
vercel link
vercel env add ...   # the three variables above, or none for a local-mode deploy
vercel --prod
```
