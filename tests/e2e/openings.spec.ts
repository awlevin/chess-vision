import { test, expect, type Page } from "@playwright/test";
import { mockChessCom, FIXTURE_GAME_COUNT } from "./chesscom-mock";
import { lineStats } from "./fixture-stats";

// High-level checks of the Openings section against the fixture player.

const NOW = new Date("2026-11-02T20:00:00Z");

async function linkFixture(page: Page) {
  await mockChessCom(page);
  await page.goto("/account");
  await page.getByRole("textbox", { name: "Chess.com username" }).fill("testplayer");
  await page.getByRole("button", { name: "Link account" }).click();
  await expect(
    page.getByRole("region", { name: "Imported games" }).locator("dt", { hasText: /^Games$/ }).locator("+ dd"),
  ).toHaveText(String(FIXTURE_GAME_COUNT), { timeout: 30_000 });
}

/** Clicks from-square then to-square on a board. */
async function play(page: Page, board: string, uci: string) {
  const b = page.getByRole("group", { name: board });
  await b.locator(`[data-square="${uci.slice(0, 2)}"]`).click();
  await b.locator(`[data-square="${uci.slice(2, 4)}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("without a linked account, every openings page points to /account", async ({ page }) => {
  for (const path of ["/openings", "/openings/explorer", "/openings/train"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: /link chess\.com account/i })).toHaveAttribute("href", "/account");
  }
});

test("the explorer walks your games move by move", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings/explorer");

  const board = page.getByRole("group", { name: "Explorer board" });
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w/);
  const moves = page.getByRole("table", { name: "Next moves" });

  // Root as White: the count for 1.e4 matches an independent reading of the fixture.
  const e4 = lineStats("white", ["e4"]);
  await expect(moves.locator('tr[data-move="e4"] td').nth(1)).toContainText(String(e4.games));
  await moves.getByRole("button", { name: "1.e4" }).click();
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b/);
  await expect(page.getByTestId("opening-name")).toContainText("King's Pawn Game");

  // Moves can be played on the board too.
  await play(page, "Explorer board", "e7e5");
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppp1ppp\/8\/4p3\/4P3/);
  const e4e5 = lineStats("white", ["e4", "e5"]);
  await expect(page.getByTestId("opening-name")).toContainText(`${e4e5.games} games`);

  await page.getByRole("button", { name: "Back one move" }).click();
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b/);

  // As Black the board flips and the tree starts again.
  await page.getByRole("group", { name: "Colour" }).getByRole("button", { name: "As Black" }).click();
  await expect(board).toHaveAttribute("data-orientation", "black");
  await expect(moves.locator('tr[data-move="e4"] td').nth(1)).toContainText(String(lineStats("black", ["e4"]).games));
});

test("the report names openings and calls out leaks", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings");
  await expect(page.getByRole("heading", { name: "Leaks to fix" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Openings as White" })).toContainText("Scandinavian Defense");
  await expect(page.locator("[data-leak]").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where you leave theory" })).toBeVisible();

  // Filters narrow the games.
  const count = page.getByTestId("filtered-count");
  await expect(count).toHaveText(/\d+ games/);
  const all = await count.innerText();
  await page.getByLabel("Time control").selectOption("rapid");
  await expect(count).not.toHaveText(all);
});

test("the trainer grades your moves and remembers progress", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings/train?color=white");
  const trainer = page.getByTestId("trainer");
  const due = page.getByTestId("due-count");
  const before = Number(await due.innerText());
  expect(before).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Start training" }).click();
  await expect(trainer).toHaveAttribute("data-phase", "you");

  // A wrong move is marked and the expected move shown.
  const expected = (await trainer.getAttribute("data-expected-move"))!;
  const wrong = expected === "a2a3" ? "h2h3" : "a2a3";
  await play(page, "Training board", wrong);
  await expect(trainer).toHaveAttribute("data-phase", "retry");
  await expect(page.getByTestId("expected-move")).toBeVisible();

  // Playing it continues the line; then answer correctly until the line ends.
  await play(page, "Training board", expected);
  for (let i = 0; i < 12; i++) {
    await expect(trainer).toHaveAttribute("data-phase", /you|done/, { timeout: 5000 });
    if ((await trainer.getAttribute("data-phase")) === "done") break;
    await play(page, "Training board", (await trainer.getAttribute("data-expected-move"))!);
  }
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();

  // Progress persists across a reload.
  await page.reload();
  await expect(due).not.toHaveText(String(before));
});

test("the board fits a 360px phone and can be dragged", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await linkFixture(page);
  await page.goto("/openings/explorer");
  const board = page.getByRole("group", { name: "Explorer board" });
  const box = (await board.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await board.scrollIntoViewIfNeeded();
  const from = (await board.locator('[data-square="e2"]').boundingBox())!;
  const to = (await board.locator('[data-square="e4"]').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/4P3\//);
});
