import { test, expect, type Page } from "@playwright/test";
import { mockChessCom, FIXTURE_GAME_COUNT } from "./chesscom-mock";
import { lineStats } from "./fixture-stats";

// High-level, behavioural checks of the Openings section against the
// fixture player. The numbers are checked in openings.acceptance.spec.ts.

const NOW = new Date("2026-11-02T20:00:00Z");

async function linkFixture(page: Page) {
  await mockChessCom(page);
  await page.goto("/account");
  await page.getByRole("textbox", { name: /username/i }).fill("testplayer");
  await page.getByRole("button", { name: /^link/i }).click();
  await expect(page.getByTestId("game-count")).toHaveText(String(FIXTURE_GAME_COUNT), { timeout: 30_000 });
}

/** Clicks from-square then to-square on a board. */
async function play(page: Page, board: string, uci: string) {
  const b = page.getByRole("group", { name: board });
  await b.locator(`[data-square="${uci.slice(0, 2)}"]`).click();
  await b.locator(`[data-square="${uci.slice(2, 4)}"]`).click();
}

/** Plays the expected move until the trainer stops asking or `until` holds. */
async function answerUntil(page: Page, until: () => Promise<boolean>, max = 60) {
  const trainer = page.getByTestId("trainer");
  for (let i = 0; i < max && !(await until()); i++) {
    await expect(trainer).toHaveAttribute("data-phase", /you|done/, { timeout: 5000 });
    if ((await trainer.getAttribute("data-phase")) === "done") {
      if (await until()) break;
      await page.getByRole("button", { name: "Next line" }).click();
      continue;
    }
    await play(page, "Training board", (await trainer.getAttribute("data-expected-move"))!);
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("without a linked account, every openings page points to /account", async ({ page }) => {
  for (const path of ["/openings", "/openings/explorer", "/openings/train", "/openings/leaks"]) {
    await page.goto(path);
    await expect(page.getByRole("main").locator('a[href="/account"]').first()).toBeVisible();
  }
});

test("home leads with today's training, the biggest leak and your openings", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings");

  // No page header or intro paragraph: the first heading is today's training.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /today.s training/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start training" })).toHaveAttribute("href", /\/openings\/train\?color=white&go=1/);
  await expect(page.locator("[data-leak]").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix it" })).toBeVisible();
  const openings = page.getByRole("list", { name: "Openings as White" }).getByRole("listitem");
  await expect(openings).toHaveCount(5);
  await page.getByRole("button", { name: /^See all \d+$/ }).click();
  await expect(openings).toHaveCount(23);
  await expect(page.getByRole("list", { name: "Openings as White" })).toContainText("Scandinavian Defense");

  // Filters live in one sheet behind one chip.
  await page.getByRole("button", { name: /^Filters: All games$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Which games" });
  const count = sheet.getByTestId("filtered-count");
  const all = await count.innerText();
  await sheet.getByRole("button", { name: "Rapid" }).click();
  await expect(count).not.toHaveText(all);
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: /^Filters: Rapid$/ })).toBeVisible();

  // The colour toggle switches the whole screen, and the URL keeps it.
  await page.getByRole("group", { name: "Colour" }).getByRole("button", { name: "Black" }).click();
  await expect(page).toHaveURL(/color=black/);
  await expect(page.getByRole("list", { name: "Openings as Black" })).toBeVisible();
});

test("Fix it adopts the better move, drills it at once, and it sticks", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings/leaks?color=white");
  const leak = page.locator('[data-leak="move-choice"]').first();
  const better = (await leak.getAttribute("data-better"))!;
  await leak.getByRole("button", { name: "Fix it" }).click();

  await expect(page).toHaveURL(/\/openings\/train\?color=white&line=/);
  const trainer = page.getByTestId("trainer");
  await expect(trainer).toHaveAttribute("data-phase", "you", { timeout: 10_000 });

  // The repertoire now plays the better move there, after a reload too.
  await page.goto("/openings/repertoire?color=white");
  await page.reload();
  await expect(page.locator("[data-position]").filter({ hasText: "your new move" }).first()).toContainText(better.slice(1));
});

test("the explorer walks your games move by move", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings/explorer");

  const board = page.getByRole("group", { name: "Explorer board" });
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w/);
  const moves = page.getByTestId("next-moves");
  await expect(moves.locator('[data-move="e4"]')).toHaveAttribute("data-games", String(lineStats("white", ["e4"]).games));

  // Tap a move row to follow it.
  await moves.locator('[data-move="e4"]').click();
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b/);
  await expect(page.getByTestId("opening-name")).toContainText("King's Pawn Game");

  // Or play it on the board.
  await play(page, "Explorer board", "e7e5");
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppp1ppp\/8\/4p3\/4P3/);
  await expect(page.getByTestId("opening-name")).toContainText(`${lineStats("white", ["e4", "e5"]).games} games`);
  await expect(page.getByRole("navigation", { name: "Current line" })).toContainText("e5");

  // Back, and the arrow keys step through the line.
  await page.getByRole("button", { name: "Back one move" }).click();
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b/);
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("ArrowLeft");
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w/);
  await page.keyboard.press("ArrowRight");
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/4P3\//);

  // Recent games sit behind an expander.
  const recent = page.getByText(/^Recent games here/);
  await recent.click();
  await expect(page.getByRole("link", { name: /View game on Chess\.com/ }).first()).toBeVisible();

  // As Black the board flips and the tree starts again.
  await page.getByRole("group", { name: "Colour" }).getByRole("button", { name: "Black" }).click();
  await expect(board).toHaveAttribute("data-orientation", "black");
  await expect(moves.locator('[data-move="e4"]')).toHaveAttribute("data-games", String(lineStats("black", ["e4"]).games));
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
  // Focus mode: the section bar gives way to the session's progress.
  await expect(page.getByRole("navigation", { name: "Openings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "End session" })).toBeVisible();

  // A wrong move is marked and the expected move shown.
  const expected = (await trainer.getAttribute("data-expected-move"))!;
  const wrong = expected === "a2a3" ? "h2h3" : "a2a3";
  await play(page, "Training board", wrong);
  await expect(trainer).toHaveAttribute("data-phase", "retry");
  await expect(page.getByTestId("expected-move")).toBeVisible();
  await expect(page.locator('[data-result="miss"]')).toHaveCount(1);

  // Playing it continues the line; answer correctly until the line ends.
  await play(page, "Training board", expected);
  await answerUntil(page, async () => (await trainer.getAttribute("data-phase")) === "done");
  await expect(page.getByRole("button", { name: "Next line" })).toBeVisible();

  // Progress persists across a reload.
  await page.reload();
  await expect(due).not.toHaveText(String(before));
});

test("a session ends with a celebration and a summary", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings/train?color=white");
  await page.getByRole("button", { name: "Start training" }).click();
  const complete = page.getByRole("heading", { name: /session complete/i });
  await answerUntil(page, () => complete.isVisible(), 120);
  await expect(complete).toBeVisible();
  await expect(page.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/openings?color=white");
  await expect(page.locator('[data-result="hit"]')).not.toHaveCount(0);
});

test("as Black the opponent moves first, and Fix my leaks drills the weak spots", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings/train?color=black");
  await page.getByRole("link", { name: "Fix my leaks" }).click();
  await expect(page).toHaveURL(/mode=leaks/);
  await page.getByRole("button", { name: "Start fixing leaks" }).click();
  const trainer = page.getByTestId("trainer");
  await expect(trainer).toHaveAttribute("data-phase", "you");
  const board = page.getByRole("group", { name: "Training board" });
  await expect(board).toHaveAttribute("data-orientation", "black");
  await expect(board).toHaveAttribute("data-turn", "black");
  await play(page, "Training board", (await trainer.getAttribute("data-expected-move"))!);
  await expect(page.getByRole("status").filter({ hasText: /Good|done|Your move|Clean/ })).toBeVisible();
});

test("engine checks are opt-in and use the Lichess cloud eval", async ({ page }) => {
  const asked: string[] = [];
  await page.context().route("https://lichess.org/api/cloud-eval**", (route) => {
    asked.push(new URL(route.request().url()).searchParams.get("fen")!);
    // Pretend the engine always prefers a3: never what the player played.
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ depth: 30, pvs: [{ moves: "a2a3 a7a6", cp: 35 }, { moves: "a7a6 a2a3", cp: -35 }] }),
    });
  });
  await linkFixture(page);
  await page.goto("/openings/leaks?color=white");
  await expect(page.locator('[data-leak="move-choice"]').first()).toBeVisible();
  expect(asked).toHaveLength(0);

  await page.getByRole("button", { name: /^Filters:/ }).click();
  await page.getByRole("switch", { name: /Check with the Lichess engine/ }).check();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(/Engine \(depth 30\)/).first()).toBeVisible();
  expect(asked.length).toBeGreaterThan(0);
});

test("the sound toggle is remembered", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings");
  const sound = page.getByRole("button", { name: "Sound" });
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "false");
});

test("the board handles keyboard moves", async ({ page }) => {
  await linkFixture(page);
  await page.goto("/openings/explorer");
  const board = page.getByRole("group", { name: "Explorer board" });
  await board.locator('[data-square="e2"]').focus();
  await page.keyboard.press("Enter");
  await expect(board.locator('[data-square="e2"]')).toHaveAttribute("data-selected", "true");
  await expect(board.locator('[data-square="e4"]')).toHaveAttribute("data-target", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(board).toHaveAttribute("data-fen", /^rnbqkbnr\/pppppppp\/8\/8\/4P3\//);
});

test("every screen fits a 360px phone, and the board can be dragged", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await linkFixture(page);
  for (const path of ["/openings", "/openings/leaks?color=white", "/openings/train", "/openings/repertoire"]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Openings" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(360);
  }

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
