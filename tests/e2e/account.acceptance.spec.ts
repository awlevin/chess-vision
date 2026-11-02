import { test, expect, type Page } from "@playwright/test";
import { mockChessCom, FIXTURE_GAME_COUNT, FIXTURE_MONTHS, type MockChessCom } from "./chesscom-mock";

// Acceptance tests for linking a Chess.com account and importing its games.
// They drive the real UI in a real browser against a fake api.chess.com, and
// assert on what a user sees and on which requests reach Chess.com.

const NOW = new Date("2026-11-02T20:00:00Z"); // the fixture's newest month is 2026/11
const monthFetches = (m: MockChessCom) => m.requests.filter((p) => /\/games\/\d{4}\/\d{2}$/.test(p));

async function link(page: Page, username: string) {
  await page.goto("/account");
  await page.getByRole("textbox", { name: /username/i }).fill(username);
  await page.getByRole("button", { name: /^link/i }).click();
}

// The account page's total, e.g. data-testid="game-count" → "1,532".
const gameCount = (page: Page, n: number) =>
  page.getByTestId("game-count").filter({ hasText: new RegExp(`^\\s*${n.toLocaleString("en-US")}\\s*$`) });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("linking imports every game, and a reload uses the cache instead of re-downloading history", async ({ page }) => {
  const api = await mockChessCom(page);
  await link(page, "TestPlayer"); // case shouldn't matter

  await expect(gameCount(page, FIXTURE_GAME_COUNT)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("testplayer", { exact: false }).first()).toBeVisible();
  // Chess.com asks for serial requests; each month is fetched exactly once.
  expect(monthFetches(api).sort()).toEqual(
    Object.keys(FIXTURE_MONTHS).map((m) => `/pub/player/testplayer/games/${m}`).sort(),
  );

  api.requests.length = 0;
  await page.reload();
  await expect(gameCount(page, FIXTURE_GAME_COUNT)).toBeVisible();
  // Finished months never change, so they must not be fetched again.
  const refetched = monthFetches(api);
  for (const done of ["2021/03", "2026/09"]) {
    expect(refetched).not.toContain(`/pub/player/testplayer/games/${done}`);
  }
});

test("an unknown username shows a clear error and links nothing", async ({ page }) => {
  await mockChessCom(page);
  await link(page, "no-such-player-xyz");
  await expect(page.getByText(/not found|no chess\.com (player|user|account)|doesn.t exist|couldn.t find/i).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: /username/i })).toBeVisible();
});

test("refresh picks up new games from the current month only", async ({ page }) => {
  const api = await mockChessCom(page);
  await link(page, "testplayer");
  await expect(gameCount(page, FIXTURE_GAME_COUNT)).toBeVisible({ timeout: 20_000 });

  // Three more games finish this month: reuse October games with new ids.
  const extra = (FIXTURE_MONTHS["2026/10"] as Array<Record<string, unknown>>).slice(0, 3).map((g, i) => ({
    ...g,
    uuid: `new-game-${i}`,
    url: `https://www.chess.com/game/live/new-${i}`,
    end_time: Math.floor(NOW.getTime() / 1000) - 600 + i,
  }));
  api.setMonth("2026/11", [...FIXTURE_MONTHS["2026/11"], ...extra]);
  api.requests.length = 0;

  await page.getByRole("button", { name: /refresh|sync/i }).click();
  await expect(gameCount(page, FIXTURE_GAME_COUNT + 3)).toBeVisible({ timeout: 20_000 });
  expect(monthFetches(api)).toEqual(["/pub/player/testplayer/games/2026/11"]);
});

test("a Chess.com outage surfaces a readable error, and a retry recovers", async ({ page }) => {
  const api = await mockChessCom(page);
  api.failWith(503);
  await link(page, "testplayer");
  await expect(page.getByText(/(try again|unavailable|couldn.t|could not|failed|error)/i).first()).toBeVisible({ timeout: 45_000 });

  api.failWith(null);
  const retry = page.getByRole("button", { name: /^link|refresh|sync|retry|try again/i }).first();
  await retry.click();
  await expect(gameCount(page, FIXTURE_GAME_COUNT)).toBeVisible({ timeout: 30_000 });
});

test("the link persists across pages without refetching, and unlinking clears it", async ({ page }) => {
  const api = await mockChessCom(page);
  await link(page, "testplayer");
  await expect(gameCount(page, FIXTURE_GAME_COUNT)).toBeVisible({ timeout: 20_000 });

  api.requests.length = 0;
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("link", { name: "Openings" }).click();
  await expect(page).toHaveURL(/\/openings/);
  await nav.getByRole("link", { name: "Account" }).click();
  await expect(gameCount(page, FIXTURE_GAME_COUNT)).toBeVisible();
  expect(monthFetches(api)).toEqual([]);

  page.once("dialog", (d) => d.accept());
  // Unlink may sit behind an "Account options" menu.
  const options = page.getByRole("button", { name: "Account options" });
  if (await options.count()) await options.click();
  await page.getByRole("button", { name: /unlink|disconnect/i }).click();
  const confirm = page.getByRole("button", { name: /^(unlink|yes|confirm|disconnect)/i });
  if (await confirm.count()) await confirm.first().click().catch(() => {});
  await expect(page.getByRole("textbox", { name: /username/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: /username/i })).toBeVisible();
});
