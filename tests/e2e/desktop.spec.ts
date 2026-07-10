import { expect, test } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";

test("plays the opening Afterlight loop with keyboard and mouse", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Mirage: The Afterlight Job");
  await expect(
    page.getByRole("heading", { name: "MIRAGE", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start the job" }).click();

  const shell = page.getByTestId("afterlight-game");
  await expect(shell).toHaveAttribute("data-mode", "foot");
  await expect(page.getByRole("heading", { name: "Boost" })).toBeVisible();
  await expectRenderedCanvas(page);
  await expect
    .poll(async () => Number(await shell.getAttribute("data-tick")), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  const before = Number(await shell.getAttribute("data-player-z"));
  await page.keyboard.down("w");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-player-z")), {
      timeout: 20_000,
    })
    .not.toBe(before);
  await page.keyboard.up("w");

  await page.keyboard.press("e");
  await expect(shell).toHaveAttribute("data-mode", "car");
  await expect(page.getByText("M/01 COUPE", { exact: true })).toBeVisible();
  await expect(page.getByText("1/3 required", { exact: true })).toBeVisible();
});
