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

Everything here is worked out in the browser from your imported games. There is no
server-side analysis. Only standard chess from the normal starting position counts;
variants and custom starts are skipped. It is designed for a phone first (390×844):
one column, one job per screen, the board as the hero, and details a tap away. On
desktop it is the same column, centred. The colour is in the URL (`?color=black`), and
every screen except Train shares one set of filters (time control, period, rated
only) in a bottom sheet behind a single chip.

| Screen | Route | What it does |
|---|---|---|
| Home | `/openings` | Today's training (a brass ring of what's due, and Start), your biggest leak with a board thumbnail and **Fix it**, your top 5 openings with score pills, and one line on where you leave book |
| Leaks | `/openings/leaks` | Every leak for that colour, worst first: your move against the better one, each with Fix it |
| Explorer | `/openings/explorer` | Your games as a move tree: the board, the line so far, the opening's name and the next moves as big rows |
| Train | `/openings/train` | A focus mode: drill your side of the lines you actually reach, with spaced repetition |
| Repertoire | `/openings/repertoire` | Every position you drill and its move; tap one to switch to another move you've played |

### The opening book

Opening names come from the [Lichess chess-openings](https://github.com/lichess-org/chess-openings)
dataset (CC0, 3,865 named lines). It is bundled as `lib/openings/book-data.json`
(about 50 KB gzipped, loaded only on these pages). `scripts/build-opening-book.mjs`
regenerates it. The browser replays every line once and indexes it **by position**
(FEN without the move counters), so a game that transposes into a named line still
gets its name. "Known theory" is every position on any named line. A game's opening
is the deepest named position it reaches.

Reading 1,500 games with chess.js would take seconds (about 90 µs a move), so
`lib/chess/fast.ts` replays SAN about 40 times faster. It was checked against chess.js
on 85,000 real plies and produces the same FENs, including chess.js's rule of only
printing an en passant square when the capture is legal. chess.js still checks every
move you make on a board. Games are read in slices of about 12 ms with a progress bar,
so the page never blocks. Each game is read once (its first 24 plies) and cached.

### Explorer

All your games of one colour, merged move by move from the starting position, up to
move 8 (16 plies). The board comes first. Under it are the line so far (a scrolling
breadcrumb with back and forward), the opening's name with your games and score
there, and the next moves as rows: the move, its name, games, a slim win/draw/loss
bar and your score (wins plus half your draws). Tap a row or play the move on the
board to go deeper. Swipe the board, or press ← and →, to step back and forward along
the most played move. A badge marks a position where you usually leave book, and
recent games from that position sit behind an expander. The line is kept in the URL
(`?color=black&moves=e2e4-d7d5`), so any position can be linked to.

### Leaks and theory

- **Your openings**: families (the part of the name before the colon), most played
  first, each with games and a score pill. Tapping one opens the explorer there.
- **Opening leaks**: a family or variation with at least 8 games that scores at least
  10 points below your average for that colour, and still 5 below after shrinking it
  towards your average as if you had played 6 more games at your average. That stops a
  3-game streak from looking like a disaster. A variation of a family that is already a
  leak is listed only if it is at least another 10 points worse.
- **Move-choice leaks**: positions where it's your move, merged across transpositions,
  in the first 16 plies with at least 10 games. A position is a leak when the move you
  play most (4+ games) scores at least 15 points below another move you've played
  (4+ games), and still 6 below after shrinking both towards your score in that
  position. For example: "After 1.e4 e5
  2.Nf3 Nc6 you play 3.d4 most often and score worst with it". **Fix it** adopts the
  better move in your repertoire and starts a drill on that line
  (`/openings/train?line=e4 e5 Nf3 Nc6&go=1`).
- Leaks are ranked by roughly the points they cost (games × score gap). Home shows the
  worst one, and `/openings/leaks` shows all of them.
- **Where you leave theory**: in each game, the first move that reaches a position on
  no named line. Home sums it up in one line (how often it's you who leaves first,
  and your most common exit, with a link to it in the explorer); the explorer marks
  positions where your most played move leaves book. Games where the opponent left
  book first are counted separately, and so are games where the book simply ran out.

**Engine checks (optional, off by default).** Turn on *Check with the Lichess engine*
in the filter sheet to compare your move with the engine at each move-choice leak.
Where the engine's best move is at least half a pawn better (or your move isn't in its
top 5), you can drill the engine's move instead. This uses the free
[Lichess cloud-eval API](https://lichess.org/api#tag/Analysis/operation/apiCloudEval)
straight from the browser. It allows CORS and covers common opening positions well,
and it costs us nothing to run. Requests go one at a time, pause for a minute after a
429, and are cached in this browser's localStorage. Any failure just shows no
evaluation. It is off by default because it sends positions to lichess.org. We chose
not to ship Stockfish WASM: it is GPL-3.0, so bundling it would put GPL obligations
on the app (offering the engine's source to everyone who gets it), and it would cost
every phone a large download and CPU time. Cloud eval gives the same answers for
opening positions without either cost.

### Trainer

**The repertoire** (`lib/openings/repertoire.ts`) is built from all your standard
games. The trainer's filters are not used. Positions are merged by key. A position
becomes a card when:

- it's your move, within the first 16 plies
- you've reached it in at least 3 games
- you can reach it by playing your repertoire moves against moves your opponents have
  actually played

A card's move is the move you've played most there, with games from the last year
counting double. On `/openings/repertoire` you can adopt any other move you've played
there; Fix it and the engine can adopt one too. That resets the card's progress. The
list marks a move that clearly scores better, using the move-choice leak rule.

**A session** is up to 10 target positions: the due ones, earliest first (Review);
the worst ones (**Fix my leaks**, `?mode=leaks`); the positions on one line
(`?line=e4 e5 Nf3`, from a leak's Fix it); or, once you're caught up, the least
recently seen (**Practise anyway**). `?go=1` starts it straight away. While it runs
the screen is just the board, one prompt line, a progress dot per target (sage for
first-time right, clay for a miss) and your streak. It ends with a summary card and a
small brass burst: "9 of 10 · 9 positions levelled up · next review tomorrow".

**A line** starts from the initial position. The opponent's reply is drawn at random,
weighted by how often your opponents played each move against you. Only replies that
lead on to a target you haven't answered yet are drawn. When none is left down the
line, the line ends and **Next line** starts another. You play your moves by
click-click or drag. A right move glows brass on its square; a wrong one flashes clay,
shakes the board, and the expected move is shown with an arrow. You then play it, or
press **Show me**, to go on.

**Scheduling** (`lib/openings/srs.ts`) is Leitner boxes. A correct answer on a due
position moves it up a box, due again in 1, 3, 7, 14, 30, 60, then 120 days. A miss
sends it back to box 0 and it is due again in 2 minutes, so it returns in the same
session if you start another. A correct answer on a position that isn't due yet (one
you pass on the way to another) is counted but doesn't move it up. New positions are
due at once.

**Fix my leaks** drills the 10 positions with the highest leak score:
your misses in the trainer, plus the points your games lose after your move there
(games × how far your shrunk score falls below your average for that colour, ÷ 3),
plus 1 if a clearly better move exists that you haven't adopted.

**Progress** is saved through `window.storage`, so in cloud mode it syncs per signed-in
user. The keys are:

| Key | Holds |
|---|---|
| `op-filters-v1` | The filters for Home, Leaks and the explorer |
| `op-cards-white-v1`, `op-cards-black-v1` | Review state for each position: box, due time, times seen, misses |
| `op-rep-white-v1`, `op-rep-black-v1` | Moves you've adopted in place of your usual move |
| `op-engine-v1` | Whether engine checks are on |

The engine cache (`op-eval-cache-v1`) and the sound setting (`delight-sound-v1`) are
kept in this browser's localStorage only.

### Delight

`lib/delight` holds small, dependency-free primitives any screen can use. All of them
respect `prefers-reduced-motion` and are safe to call on the server or on browsers
without the feature.

| API | What it does |
|---|---|
| `playSound(name)` | WebAudio-synthesised sounds, no audio files: `move`, `capture`, `castle` (wood clicks), `correct` (a warm two-note chime), `wrong` (a soft thud), `complete` (a rising arpeggio). Silent until the first gesture unlocks audio, and when sound is off |
| `soundForSan(san)` | The right one of `move`, `capture` or `castle` for a move |
| `installAudioUnlock()` | Creates the AudioContext on the first pointerdown or keydown |
| `useSound()` | `[on, setOn]`: the persisted sound setting, default on |
| `haptic(kind)` | `navigator.vibrate`: `tick`, `miss` (a double buzz), `success`. A no-op on iOS |
| `feedback(kind)` | Sound plus haptic for `correct`, `wrong` or `complete` |
| `burst(elementOrPoint, opts?)` | A one-second brass confetti and sparkle burst on a throwaway canvas |
| `useCountUp(target, ms?)` | Counts a number up (or down) with an ease-out |
| `useReducedMotion()` | The media query, live |

### The board component

`components/board` holds a controlled board that later features (analysis, puzzles)
can reuse:

```tsx
import { Chessboard } from "@/components/board";

<Chessboard
  fen={fen}                       // always shows this position
  orientation="black"             // default "white"
  interactive="black"             // true = side to move, a colour, or false (default)
  onMove={(m) => setFen(m.fen)}   // { from, to, promotion?, san, uci, fen } for each legal move
  lastMove={{ from: "e2", to: "e4" }}
  arrows={[{ from: "g1", to: "f3", tone: "good", weight: 0.8 }]}   // tones: info, good, bad, warn
  markers={[{ square: "d5", tone: "bad" }]}
  coordinates                     // default true
  label="Analysis board"          // accessible name, default "Chessboard"
  effect={{ kind: "glow", square: "f3", id: n }}   // replays when id changes: "glow" (brass pulse) or "miss" (clay flash and a shake)
  onSwipe={(dir) => step(dir)}    // horizontal swipes that don't start on a movable piece
  framed                          // the walnut frame, default true; false for thumbnails
/>
```

- chess.js supplies legal moves. Moves work by click-click, drag on mouse, touch or pen
  (pointer events), or the keyboard: arrow keys move between squares, and Enter or
  Space picks a piece up and puts it down.
- Promotion opens a piece picker. The legal targets of the selected piece are marked,
  a king in check is highlighted, and a piece slides in for the last move unless
  reduced motion is set. A captured piece sinks away under the piece that took it,
  and a castling rook slides with its king.
- The board sits in a walnut frame with a faint wood grain, from the design tokens.
- Test hooks: the board is `role="group"` with `data-fen`, `data-orientation` and
  `data-turn`. Each square has `data-square` and, when occupied, `data-piece` (`wP`,
  `bK`, ...). Squares can also carry `data-selected`, `data-target`, `data-last`,
  `data-marker` and `data-check`. Arrows are `<g data-arrow="e2e4">`.
- The pieces in `components/board/pieces.tsx` were drawn for this project. There are
  no third-party assets, so they share the app's licence.

### Third-party data and code

| What | Licence |
|---|---|
| Lichess chess-openings dataset (`lib/openings/book-data.json`) | CC0 |
| chess.js | BSD-2-Clause |
| Lichess cloud-eval API (optional, called from the browser) | Lichess API terms. No engine code is shipped |

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
and it checks which requests reach Chess.com. `tests/e2e/openings.spec.ts` covers home,
leaks, Fix it, the explorer, a full training session, sound, the board and 360px phones.

The `*.acceptance.spec.ts` files check the app against an independent reading of the
same fixture: `tests/e2e/fixture-stats.ts` replays the raw games with chess.js and never
imports app code. They check that every explorer number and every claimed leak matches
the raw games. They also check that the trainer only asks for moves you really played
and replies only with moves your real opponents played.

`tests/e2e/live-chesscom.spec.ts` imports a real account from the real API. It is
skipped unless you opt in:

```sh
LIVE_CHESSCOM_USER=awlevin npx playwright test live --project=desktop
```

`reuseExistingServer` is on outside CI, so stop any `next start` left on the test
port first. Otherwise the tests run against that old build.

Next.js renders a hidden route announcer with `role="alert"`, so scope alert queries
to the page: `page.getByRole("main").getByRole("alert")`.

## Deploying

```sh
vercel link
vercel env add ...   # the three variables above, or none for a local-mode deploy
vercel --prod
```
