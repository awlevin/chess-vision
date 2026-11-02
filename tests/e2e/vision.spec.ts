import { test, expect, type Page } from "@playwright/test";

// Behaviour of the Vision drills, through the same hooks as the smoke test:
// the prompt (data-coord, data-feedback, data-review), the board squares
// (data-sq, data-mark) and the round strip (data-result).

const prompt = (page: Page) => page.getByTestId("prompt");
const progress = (page: Page) => page.getByTestId("round-progress");

/** Waits for the next prompt, then returns the square it asks for. */
async function nextCoord(page: Page) {
  await expect(prompt(page)).not.toHaveAttribute("data-feedback", /.+/);
  const coord = await prompt(page).getAttribute("data-coord");
  expect(coord).toMatch(/^[a-h][1-8]$/);
  return coord!;
}

async function answerRight(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    const hits = await progress(page).locator('[data-result="hit"]').count();
    await page.locator(`[data-sq="${await nextCoord(page)}"]`).click();
    // The 20th answer ends the round, and the strip gives way to the summary.
    if (hits + 1 < 20) await expect(progress(page).locator('[data-result="hit"]')).toHaveCount(hits + 1);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/vision");
});

test("a miss shows the right square, then comes back as a review", async ({ page }) => {
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  const target = await nextCoord(page);
  const wrong = target === "a1" ? "h8" : "a1";
  await page.locator(`[data-sq="${wrong}"]`).click();

  await expect(prompt(page)).toHaveAttribute("data-feedback", "miss");
  await expect(page.locator(`[data-sq="${target}"]`)).toHaveAttribute("data-mark", "answer");
  await expect(page.locator(`[data-sq="${wrong}"]`)).toHaveAttribute("data-mark", "wrong");
  await expect(page.getByText(`You tapped ${wrong}`)).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(progress(page).locator('[data-result="miss"]')).toHaveCount(1);

  // A miss is requeued 2–4 prompts later, marked as a review.
  let came_back = false;
  for (let i = 0; i < 6 && !came_back; i++) {
    const coord = await nextCoord(page);
    if (coord === target) {
      came_back = true;
      await expect(prompt(page)).toHaveAttribute("data-review", "true");
      await expect(prompt(page).getByText("Review")).toBeVisible();
    }
    await page.locator(`[data-sq="${coord}"]`).click();
  }
  expect(came_back).toBe(true);
});

test("a misclick counts as a hit", async ({ page }) => {
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  const target = await nextCoord(page);
  await page.locator(`[data-sq="${target === "a1" ? "h8" : "a1"}"]`).click();
  await page.getByRole("button", { name: "Misclick" }).click();
  await expect(progress(page).locator('[data-result="hit"]')).toHaveCount(1);
  await expect(progress(page).locator('[data-result="miss"]')).toHaveCount(0);
});

test("a full round ends with a summary, and the stats survive a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await answerRight(page, 20);

  const summary = page.getByTestId("round-summary");
  await expect(summary).toBeVisible();
  await expect(summary.getByText("100%")).toBeVisible();
  await expect(summary.getByText("Not a single miss.")).toBeVisible();
  await expect(summary.getByTestId("round-average")).toHaveText(/^\d+\.\d\d$/);
  await expect(page.getByRole("button", { name: "Next round" })).toBeVisible();

  // Saved under the same key and shape as before the redesign.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("cv:cv-find-white-v1") || "null"));
  expect(saved.history).toHaveLength(1);
  expect(Object.values(saved.stats as Record<string, { seen: number }>).reduce((s, x) => s + x.seen, 0)).toBe(20);

  await page.reload();
  await expect(prompt(page)).toContainText(/best \d+\.\d\ds/);
  await page.getByRole("button", { name: "Your squares" }).click();
  await expect(page.getByRole("dialog", { name: "Your squares" })).toBeVisible();
});

test("stats saved by the old drills still load", async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      "cv:cv-find-black-v1",
      JSON.stringify({ stats: { e4: { seen: 4, wrong: 1, ewma: 1.2 } }, history: [{ avg: 1.84, acc: 90, total: 36.8 }] }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Drill settings" }).click();
  await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Black" }).click();
  await page.keyboard.press("Escape");
  await expect(prompt(page)).toContainText("As Black · best 1.84s");
});

test("the naming drills take a file, then a rank, from the keypad", async ({ page }) => {
  await page.getByRole("button", { name: "Find the square" }).click();
  await page.getByRole("dialog", { name: "Drills" }).getByRole("button", { name: /Name the square/ }).click();
  await page.getByRole("button", { name: "Begin", exact: true }).click();

  const coord = await nextCoord(page);
  // The find drill stays mounted (hidden) behind it, so pick the visible board.
  await expect(page.locator(`[data-sq="${coord}"]:visible`)).toHaveAttribute("data-mark", "target");
  const pad = page.getByRole("group", { name: "Name the square" });
  await pad.getByRole("button", { name: coord[0], exact: true }).click();
  await pad.getByRole("button", { name: coord[1], exact: true }).click();
  await expect(progress(page).locator('[data-result="hit"]')).toHaveCount(1);
});
