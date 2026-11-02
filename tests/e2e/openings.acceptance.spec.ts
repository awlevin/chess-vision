import { test, expect, type Page } from "@playwright/test";
import { Chess } from "chess.js";
import { mockChessCom, FIXTURE_GAME_COUNT } from "./chesscom-mock";
import { lineStats, movesFrom } from "./fixture-stats";

// Acceptance tests for the Openings section. Every number the app shows is
// checked against an independent chess.js reading of the raw fixture games
// (fixture-stats.ts), never against the app's own code.

const NOW = new Date("2026-11-02T20:00:00Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockChessCom(page);
  await page.goto("/account");
  await page.getByRole("textbox", { name: /username/i }).fill("testplayer");
  await page.getByRole("button", { name: /^link/i }).click();
  await expect(page.getByTestId("game-count")).toHaveText(String(FIXTURE_GAME_COUNT), { timeout: 30_000 });
});

/** Reads the explorer's next moves: SAN → { games, pct }. */
async function nextMoves(page: Page) {
  const rows = page.getByTestId("next-moves").locator("[data-move]");
  await expect(rows.first()).toBeVisible();
  const out = new Map<string, { games: number; pct: number }>();
  for (const row of await rows.all()) {
    const san = (await row.getAttribute("data-move"))!;
    out.set(san, { games: Number(await row.getAttribute("data-games")), pct: Number(await row.getAttribute("data-score")) });
  }
  return out;
}

/** Every reply shown at a node, as White and as Black, matches the raw games. */
for (const color of ["white", "black"] as const) {
  test(`explorer statistics as ${color} match the raw games, two plies deep`, async ({ page }) => {
    await page.goto(`/openings/explorer?color=${color}`);
    const root = await nextMoves(page);
    expect(root.size).toBeGreaterThan(1);
    for (const [san, shown] of root) {
      const truth = lineStats(color, [san]);
      expect(shown, `1.${san}`).toEqual({ games: truth.games, pct: truth.pct });
    }

    // Descend into the most common first move and check every reply.
    const [first] = [...root].sort((a, b) => b[1].games - a[1].games)[0];
    await page.getByTestId("next-moves").locator(`[data-move="${first}"]`).click();
    const replies = await nextMoves(page);
    const total = [...replies.values()].reduce((n, r) => n + r.games, 0);
    expect(total).toBeLessThanOrEqual(root.get(first)!.games);
    for (const [san, shown] of replies) {
      const truth = lineStats(color, [first, san]);
      expect(shown, `1.${first} ${san}`).toEqual({ games: truth.games, pct: truth.pct });
    }
  });
}

test("every move-choice leak the app claims is true of the raw games", async ({ page }) => {
  // Every leak for a colour is listed at /openings/leaks.
  await page.goto("/openings/leaks?color=white");
  const leaks = page.locator('[data-leak="move-choice"]');
  await expect(leaks.first()).toBeAttached();

  let checked = 0;
  for (const leak of await leaks.all()) {
    const attr = async (n: string) => (await leak.getAttribute(`data-${n}`))!;
    const prefix = (await attr("line")).split(" ").filter(Boolean);
    const usual = lineStats("white", [...prefix, await attr("usual")]);
    const better = lineStats("white", [...prefix, await attr("better")]);
    expect({ games: usual.games, pct: usual.pct }).toEqual({ games: Number(await attr("usual-games")), pct: Number(await attr("usual-score")) });
    expect({ games: better.games, pct: better.pct }).toEqual({ games: Number(await attr("better-games")), pct: Number(await attr("better-score")) });
    expect(better.pct).toBeGreaterThan(usual.pct);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
});

test("the trainer drills moves you really play, replies like your real opponents, and remembers progress", async ({ page }) => {
  await page.goto("/openings/train?color=white");
  const trainer = page.getByTestId("trainer");
  const board = page.getByRole("group", { name: "Training board" });
  const dueBefore = await page.getByTestId("due-count").innerText();
  await page.getByRole("button", { name: "Start training" }).click();

  const click = async (uci: string) => {
    await board.locator(`[data-square="${uci.slice(0, 2)}"]`).click();
    await board.locator(`[data-square="${uci.slice(2, 4)}"]`).click();
  };

  // Answer three prompts correctly, checking each against the raw games.
  let answered = 0;
  for (let guard = 0; answered < 3 && guard < 20; guard++) {
    await expect(trainer).toHaveAttribute("data-phase", /you|done/);
    if ((await trainer.getAttribute("data-phase")) === "done") {
      await page.getByRole("button", { name: /next line/i }).click();
      continue;
    }
    const fen = (await board.getAttribute("data-fen"))!;
    const uci = (await trainer.getAttribute("data-expected-move"))!;
    const san = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
    expect([...movesFrom(fen, "player").keys()], `expected move at ${fen}`).toContain(san);

    await click(uci);
    answered++;
    await expect(trainer).not.toHaveAttribute("data-phase", "retry");
    // If the line continues, the opponent's reply must be one real opponents played.
    await expect(trainer).toHaveAttribute("data-phase", /you|done/);
    if ((await trainer.getAttribute("data-phase")) === "you") {
      const after = new Chess(fen);
      after.move(san);
      const now = (await board.getAttribute("data-fen"))!;
      const reply = after.moves({ verbose: true }).find((mv) => {
        const c = new Chess(after.fen()); c.move(mv.san); return c.fen().split(" ")[0] === now.split(" ")[0];
      });
      expect(reply, "opponent reply").toBeTruthy();
      expect([...movesFrom(after.fen(), "opponent").keys()]).toContain(reply!.san);
    }
  }
  expect(answered).toBe(3);

  // A wrong move is caught, and the right one is shown.
  if ((await trainer.getAttribute("data-phase")) === "done") await page.getByRole("button", { name: /next line/i }).click();
  await expect(trainer).toHaveAttribute("data-phase", "you");
  const fen = (await board.getAttribute("data-fen"))!;
  const expected = (await trainer.getAttribute("data-expected-move"))!;
  const wrong = new Chess(fen).moves({ verbose: true }).find((mv) => mv.from + mv.to !== expected.slice(0, 4))!;
  await click(wrong.from + wrong.to);
  await expect(trainer).toHaveAttribute("data-phase", "retry");
  await expect(page.getByTestId("expected-move")).toBeVisible();

  // Progress survives a reload: the due count has moved on.
  await page.reload();
  await expect(page.getByTestId("due-count")).not.toHaveText(dueBefore);
});
