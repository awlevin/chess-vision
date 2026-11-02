import { test, expect } from "@playwright/test";

test("the hub links to every section, and the vision drills still work", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Vision", "Openings", "Account"]) {
    await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name })).toBeVisible();
  }

  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Vision" }).click();
  await expect(page).toHaveURL(/\/vision$/);
  await page.getByRole("button", { name: "Begin", exact: true }).click();

  // Answer five prompts correctly by clicking the square the plaque names.
  for (let i = 0; i < 5; i++) {
    // Wait out the green "correct" flash before reading the next prompt.
    await expect(page.getByTestId("prompt")).not.toHaveAttribute("data-feedback", "correct");
    const coord = (await page.getByTestId("prompt").getAttribute("data-coord"))!;
    expect(coord).toMatch(/^[a-h][1-8]$/);
    await page.locator(`[data-sq="${coord}"]`).click();
    await expect(page.getByTestId("round-progress").locator('[data-result="hit"]')).toHaveCount(i + 1);
  }
  await expect(page.getByTestId("round-progress").locator('[data-result="miss"]')).toHaveCount(0);
});
