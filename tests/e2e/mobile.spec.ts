import { expect, test } from "@playwright/test";

test("exposes complete touch controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter Bay City" }).click();
  for (const label of [
    "Move forward",
    "Move left",
    "Move back",
    "Move right",
    "Sprint or boost",
    "Jump",
    "Enter vehicle",
  ]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }
});
