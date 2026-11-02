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
  await expect(
    page.getByRole("region", { name: "Imported games" }).locator("dt", { hasText: /^Games$/ }).locator("+ dd"),
  ).toHaveText(String(FIXTURE_GAME_COUNT), { timeout: 30_000 });
});

/** Reads the "Next moves" table: SAN → { games, pct }. */
async function nextMoves(page: Page) {
  const rows = page.getByRole("table", { name: "Next moves" }).locator("tbody tr[data-move]");
  await expect(rows.first()).toBeVisible();
  const out = new Map<string, { games: number; pct: number }>();
  for (const row of await rows.all()) {
    const san = (await row.getAttribute("data-move"))!;
    const cells = row.locator("td");
    const games = Number((await cells.nth(1).innerText()).trim().split(/\s+/)[0]);
    const pct = Number((await cells.nth(3).innerText()).replace(/\D/g, ""));
    out.set(san, { games, pct });
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
    await page.getByRole("table", { name: "Next moves" }).locator(`tr[data-move="${first}"] button`).first().click();
    const replies = await nextMoves(page);
    const total = [...replies.values()].reduce((n, r) => n + r.games, 0);
    expect(total).toBeLessThanOrEqual(root.get(first)!.games);
    for (const [san, shown] of replies) {
      const truth = lineStats(color, [first, san]);
      expect(shown, `1.${first} ${san}`).toEqual({ games: truth.games, pct: truth.pct });
    }
  });
}

test("every move-choice leak the report claims is true of the raw games", async ({ page }) => {
  await page.goto("/openings");
  const leaks = page.getByRole("region", { name: "Leaks to fix" }).getByRole("listitem");
  await expect(leaks.first()).toBeVisible();

  const sans = (line: string) => line.replace(/\d+\.(\.\.)?/g, " ").trim().split(/\s+/).filter(Boolean);
  let checked = 0;
  for (const leak of await leaks.all()) {
    const text = await leak.innerText();
    // "After 1.e4 e5 you play 2.Nf3 most often and score worst with it: 40% in 21 games."
    const m = text.match(/After (.+?) you play (\S+) most often.*?: (\d+)% in (\d+) games[\s\S]*?With (\S+) you score (\d+)% in (\d+) games/);
    if (!m) continue;
    const prefix = sans(m[1]);
    const usual = lineStats("white", [...prefix, ...sans(m[2])]);
    const better = lineStats("white", [...prefix, ...sans(m[5])]);
    expect({ pct: usual.pct, games: usual.games }).toEqual({ pct: Number(m[3]), games: Number(m[4]) });
    expect({ pct: better.pct, games: better.games }).toEqual({ pct: Number(m[6]), games: Number(m[7]) });
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
