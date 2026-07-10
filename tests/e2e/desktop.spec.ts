import { expect, test } from "@playwright/test";

test("moves on foot and enters the hero car", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Mirage: Bay City");
  await expect(page.getByRole("heading", { name: "Mirage" })).toBeVisible();
  await page.getByRole("button", { name: "Enter Bay City" }).click();
  const shell = page.locator(".bay-city-shell");
  await expect(shell).toHaveAttribute("data-mode", "foot");
  await expect(
    page.getByRole("heading", { name: "Take the wheel." }),
  ).toBeVisible();

  const before = Number(await shell.getAttribute("data-player-z"));
  await page.keyboard.down("w");
  await page.waitForTimeout(300);
  await page.keyboard.up("w");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-player-z")))
    .not.toBe(before);

  await page.keyboard.press("e");
  await expect(shell).toHaveAttribute("data-mode", "car");
  await expect(
    page.getByRole("heading", { name: "Intercept the Mission echo." }),
  ).toBeVisible();
  await expect(page.locator("canvas#bay-city-renderer")).toBeVisible();
});
