import { test, expect, type Page } from "@playwright/test";
import { mockChessCom, FIXTURE_USER, FIXTURE_MONTHS, FIXTURE_GAME_COUNT } from "./chesscom-mock";

// The fixture's newest month is 2026/11, so pin "now" inside it: that month
// is in progress, and every earlier month is final.
const NOW = new Date("2026-11-02T12:00:00Z");
const MONTHS = Object.keys(FIXTURE_MONTHS).sort();
const PLAYER = `/pub/player/${FIXTURE_USER}`;
const monthPath = (m: string) => `${PLAYER}/games/${m}`;
const fetchesOf = (requests: string[], path: string) => requests.filter((r) => r === path).length;

/** Records the most Chess.com requests the page ever had in flight at once. */
async function trackConcurrency(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __inflight: number; __maxInflight: number };
    w.__inflight = 0;
    w.__maxInflight = 0;
    const real = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (!url.startsWith("https://api.chess.com/")) return real(...args);
      w.__maxInflight = Math.max(w.__maxInflight, ++w.__inflight);
      try {
        return await real(...args);
      } finally {
        w.__inflight--;
      }
    };
  });
}

async function linkFixture(page: Page) {
  await page.getByLabel("Chess.com username").fill(FIXTURE_USER);
  await page.getByRole("button", { name: "Link account" }).click();
  await expect(page.getByRole("heading", { name: FIXTURE_USER })).toBeVisible();
  await expect(gamesTotal(page)).toHaveText(String(FIXTURE_GAME_COUNT));
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
}

/** The value shown under a summary label such as "Games" or "Blitz". */
const stat = (page: Page, label: string) =>
  page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd");
const gamesTotal = (page: Page) => stat(page, "Games");

test.use({ timezoneId: "UTC" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("links a player, imports their games one request at a time, and shows a summary", async ({ page }) => {
  await trackConcurrency(page);
  const api = await mockChessCom(page);
  await page.goto("/account");

  // Unknown players get a clear error and nothing is linked.
  await page.getByLabel("Chess.com username").fill("nosuchplayer");
  await page.getByRole("button", { name: "Link account" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("No Chess.com player named “nosuchplayer”");
  await expect(page.getByLabel("Chess.com username")).toBeFocused();

  await page.getByLabel("Chess.com username").fill(`@${FIXTURE_USER.toUpperCase()}`);
  await page.getByRole("button", { name: "Link account" }).click();
  await expect(page.getByRole("heading", { name: FIXTURE_USER })).toBeVisible();
  await expect(gamesTotal(page)).toHaveText(String(FIXTURE_GAME_COUNT));

  // Every month once, plus the profile and archive list; never two at a time.
  for (const m of MONTHS) expect(fetchesOf(api.requests, monthPath(m))).toBe(1);
  expect(fetchesOf(api.requests, `${PLAYER}/games/archives`)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __maxInflight: number }).__maxInflight)).toBe(1);

  // Breakdown by time class and the date range.
  const counts: Record<string, number> = { Bullet: 0, Blitz: 0, Rapid: 0, Daily: 0 };
  const ends: number[] = [];
  for (const games of Object.values(FIXTURE_MONTHS) as { time_class: string; end_time: number }[][]) {
    for (const g of games) {
      counts[g.time_class[0].toUpperCase() + g.time_class.slice(1)]++;
      ends.push(g.end_time * 1000);
    }
  }
  for (const [label, n] of Object.entries(counts)) {
    await expect(stat(page, label)).toHaveText(String(n));
  }
  const day = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
  await expect(stat(page, "Date range")).toHaveText(`${day(Math.min(...ends))} – ${day(Math.max(...ends))}`);
  await expect(stat(page, "Last synced")).toHaveText("just now");
});

test("keeps games across pages and reloads without refetching", async ({ page }) => {
  const api = await mockChessCom(page);
  await page.goto("/account");
  await linkFixture(page);
  const after = api.requests.length;

  // Client-side navigation away and back: same games, no requests.
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("link", { name: "Vision" }).click();
  await expect(page).toHaveURL(/\/vision$/);
  await nav.getByRole("link", { name: "Account" }).click();
  await expect(gamesTotal(page)).toHaveText(String(FIXTURE_GAME_COUNT));

  // A reload reads the cache; the last sync is fresh, so nothing is fetched.
  await page.reload();
  await expect(gamesTotal(page)).toHaveText(String(FIXTURE_GAME_COUNT));
  await page.waitForTimeout(500);
  expect(api.requests.length).toBe(after);
});

test("refresh fetches only the archive list and months still in progress", async ({ page }) => {
  const api = await mockChessCom(page);
  await page.goto("/account");
  await linkFixture(page);
  api.requests.length = 0;

  // A new game finishes this month.
  const current = MONTHS[MONTHS.length - 1];
  const extra = { ...(FIXTURE_MONTHS[current][0] as object), uuid: "new-game-uuid", end_time: NOW.getTime() / 1000 - 60 };
  api.setMonth(current, [...FIXTURE_MONTHS[current], extra]);

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(gamesTotal(page)).toHaveText(String(FIXTURE_GAME_COUNT + 1));
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
  expect(api.requests.sort()).toEqual([`${PLAYER}/games/archives`, monthPath(current)].sort());
});

test("a new device with a linked account imports on its own, and a stale sync refreshes", async ({ page }) => {
  const api = await mockChessCom(page);
  // The account came from storage (as it would from the cloud), but this browser has no games.
  await page.addInitScript((username) => {
    if (!localStorage.getItem("cv:games-account-v1")) {
      localStorage.setItem(
        "cv:games-account-v1",
        JSON.stringify({ source: "chess.com", username, displayName: username, linkedAt: Date.now() }),
      );
    }
  }, FIXTURE_USER);
  await page.goto("/account");
  await expect(gamesTotal(page)).toHaveText(String(FIXTURE_GAME_COUNT));
  for (const m of MONTHS) expect(fetchesOf(api.requests, monthPath(m))).toBe(1);

  // Two hours later the sync is stale, so opening the app checks for new games.
  api.requests.length = 0;
  await page.clock.setFixedTime(new Date(NOW.getTime() + 2 * 60 * 60 * 1000));
  await page.reload();
  await expect.poll(() => fetchesOf(api.requests, `${PLAYER}/games/archives`)).toBe(1);
  await expect(stat(page, "Last synced")).toHaveText("just now");
  expect(api.requests).not.toContain(monthPath(MONTHS[0]));
});

test("a failed month keeps the rest, explains itself, and is fetched on the next refresh", async ({ page }) => {
  const api = await mockChessCom(page);
  const broken = MONTHS[1];
  let failing = true;
  // Registered after the mock, so it runs first.
  await page.context().route(`https://api.chess.com${monthPath(broken)}`, (route) =>
    failing
      ? route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, body: "{}" })
      : route.fallback(),
  );
  await page.goto("/account");
  await page.getByLabel("Chess.com username").fill(FIXTURE_USER);
  await page.getByRole("button", { name: "Link account" }).click();

  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText(`1 of ${MONTHS.length} months couldn't be imported`, { timeout: 20_000 });
  await expect(alert).toContainText("error 503");
  const missing = FIXTURE_MONTHS[broken].length;
  await expect(gamesTotal(page)).toHaveText(String(FIXTURE_GAME_COUNT - missing));

  failing = false;
  api.requests.length = 0;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(gamesTotal(page)).toHaveText(String(FIXTURE_GAME_COUNT));
  await expect(alert).toHaveCount(0);
  expect(api.requests).toContain(monthPath(broken));
  expect(api.requests).not.toContain(monthPath(MONTHS[0]));
});

test("when Chess.com is down, refresh reports it and keeps the games", async ({ page }) => {
  const api = await mockChessCom(page);
  await page.goto("/account");
  await linkFixture(page);

  api.failWith(500);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Chess.com is having trouble", { timeout: 20_000 });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Games already imported are kept");
  await expect(gamesTotal(page)).toHaveText(String(FIXTURE_GAME_COUNT));
});

test("unlink forgets the account and its games on this device", async ({ page }) => {
  const api = await mockChessCom(page);
  await page.goto("/account");
  await linkFixture(page);

  await page.getByRole("button", { name: "Unlink" }).click();
  await expect(page.getByLabel("Chess.com username")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Chess.com username")).toBeVisible();

  // Linking again starts from scratch: every month is fetched again.
  api.requests.length = 0;
  await linkFixture(page);
  for (const m of MONTHS) expect(fetchesOf(api.requests, monthPath(m))).toBe(1);
});
