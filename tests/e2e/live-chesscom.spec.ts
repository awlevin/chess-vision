import { test, expect } from "@playwright/test";

// Talks to the real api.chess.com. Opt in with a public username:
//   LIVE_CHESSCOM_USER=hikaru npx playwright test live --project=desktop
const USER = process.env.LIVE_CHESSCOM_USER;

test("@live links a real Chess.com account and imports its whole history", async ({ page }) => {
  test.skip(!USER, "set LIVE_CHESSCOM_USER to run against the real Chess.com API");
  test.setTimeout(180_000);

  // Ground truth straight from the API.
  const archives: string[] = (await (await page.request.get(`https://api.chess.com/pub/player/${USER}/games/archives`)).json()).archives;
  expect(archives.length).toBeGreaterThan(0);

  await page.goto("/account");
  await page.getByRole("textbox", { name: /username/i }).fill(USER!);
  await page.getByRole("button", { name: /^link/i }).click();

  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled({ timeout: 150_000 });
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  const count = Number((await page.getByTestId("game-count").innerText()).replace(/\D/g, ""));
  expect(count).toBeGreaterThan(0);
  console.log(`${USER}: ${count} games imported from ${archives.length} monthly archives`);

  // The openings page works on real data.
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Openings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /openings/i })).toBeVisible();
});
