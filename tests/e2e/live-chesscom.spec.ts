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

  // Expected total, counted straight from the API: games with moves that this user played.
  let expected = 0;
  for (const url of archives) {
    const { games } = await (await page.request.get(url)).json();
    expected += games.filter((g: { pgn?: string; white: { username: string }; black: { username: string } }) =>
      g.pgn && [g.white.username, g.black.username].some((u) => u.toLowerCase() === USER!.toLowerCase())).length;
  }

  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled({ timeout: 150_000 });
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  // The count animates up, so wait for it to land on the exact total.
  await expect(page.getByTestId("game-count")).toHaveText(expected.toLocaleString("en-US"), { timeout: 15_000 });
  console.log(`${USER}: ${expected} games imported from ${archives.length} monthly archives`);

  // The openings overview works on real data.
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Openings" }).click();
  await expect(page.getByRole("region", { name: /training/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Start training" })).toBeVisible();
});
