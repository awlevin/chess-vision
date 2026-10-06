# Chess Vision

_Timed board-vision drills: find and name every square, and get extra reps on the ones you miss._

Inspired by chess.com's Vision trainer. You get a coordinate and click the square, or
a square lights up and you name it, and every answer is timed to the hundredth of a
second. The app keeps per-square stats and uses them to decide which squares you see
next.

## The drills

| Drill | What it does |
|---|---|
| Find the square | A coordinate appears, and you click it |
| Name the square | A knight lands on a square, and you name it by tapping a file and then a rank, or typing them (e.g. `e` `4`) |

Before each round, and on the round-end card, you choose:

- **Play as** White or Black. Black flips the board. Each drill keeps separate stats
  for each side, because finding e4 from Black's side is a different skill from
  finding it from White's side.
- **Board labels**: file letters (a–h) along the bottom edge, rank numbers (1–8)
  along the left edge, both, or neither. Both are off by default.

A round is 20 squares. The clock starts when you press **Begin** or Enter, not when
the page loads.

## How it picks squares

This is the same adaptive picker as the sprints in
[mental-math-trainer](https://github.com/awlevin/mental-math-trainer), applied to the
64 squares instead of the 64 times-table facts. It lives in `lib/drill.ts`.

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

## Stats

At the end of a round you see:

- your average per square, total time and accuracy
- the squares you missed and what you clicked instead
- your three slowest correct squares
- the squares getting extra reps next round
- an 8x8 heat map drawn as the board itself, from the side you're drilling, which you
  can switch between average time, attempts and misses
- your past rounds, with the best one highlighted

The heat map also shows under the board before each round.

## How it's built

- **Next.js 16 App Router.** There is one page.
- `components/ChessVision.tsx` holds the UI and styles. `lib/drill.ts` holds the board
  geometry, the picker, the stats update and the requeue rules.
- The drill reads and writes through an async `window.storage` key/value API, the same
  contract the mental math trainer uses. `lib/storage-client.ts` installs it.

### Two storage modes

**Local mode** is the default when no Clerk key is set. There's no sign-in, and stats
live in this browser's `localStorage` under `cv:`-prefixed keys.

**Cloud mode** turns on when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set at build time.
It works the same way as the mental math trainer:

- Clerk protects every route through `proxy.ts`.
- `/api/storage/[key]` scopes reads and writes to the Clerk user id.
- Stats are stored in Neon Postgres in the same `user_storage` table.

The keys are namespaced (`cv-find-white-v1`, …), so you can point this app at the
**same Clerk application and the same Neon database** as the mental math trainer, and
one sign-in covers both. The first time cloud mode runs in a browser, any local-mode
stats there are uploaded once.

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

## Deploying

```sh
vercel link
vercel env add ...   # the three variables above, or none for a local-mode deploy
vercel --prod
```
