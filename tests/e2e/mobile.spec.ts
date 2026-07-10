import { expect, test } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";

test("exposes a complete playable touch control set", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start the job" }).click();
  await expectRenderedCanvas(page);

  for (const label of [
    "Move",
    "Look",
    "Interact",
    "Enter vehicle",
    "Fire",
    "Aim",
    "Sprint",
    "Jump",
  ]) {
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  }

  const shell = page.getByTestId("afterlight-game");
  await page.getByRole("button", { name: "Fire", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "SIGNAL-9 ammunition" })
      .getByText("23", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Enter vehicle", exact: true })
    .click();
  await expect(shell).toHaveAttribute("data-mode", "car");
  await expect(
    page.getByRole("button", { name: "Exit vehicle", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Boost", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Brake", exact: true }),
  ).toBeVisible();
});
