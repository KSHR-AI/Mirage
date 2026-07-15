import { expect, test } from "@playwright/test";

test("removed platform gates remain unavailable", async ({ request }) => {
  for (const path of [
    "/api/billing/checkout",
    "/api/auth/sign-in",
    "/api/reactor/token",
    "/labs/lingbot",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});

test("block asset lab exposes deterministic quality budgets", async ({
  page,
}) => {
  await page.goto("/asset-lab");
  const lab = page.getByTestId("asset-lab");
  await expect(lab).toHaveAttribute("data-quality", "desktop");
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "mobile" }).click();
  await expect(lab).toHaveAttribute("data-quality", "mobile");
  await expect(page.getByText("32 PARTS / ASSET")).toBeVisible();
});

test("the first screen exposes one job and one action", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "mirage:afterlight:profile:v1",
      JSON.stringify({
        activeUpgradeId: "street-tune",
        bankedCash: 99_000,
        completedRuns: 12,
        selectedContractId: "afterlight-job",
        selectedOperationId: "north-beach-transfer",
        version: 1,
      }),
    );
  });
  await page.goto("/");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Hot Ride" })).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(dialog.getByRole("radiogroup")).toHaveCount(0);
  await expect(
    dialog.getByText(/BANKED|LOADOUT|OPERATION|CONTRACT/),
  ).toHaveCount(0);

  await dialog.getByRole("button", { name: "Play" }).click();
  const game = page.getByTestId("afterlight-game");
  await expect(game).toHaveAttribute("data-contract", "hot-ride");
  await expect(game).toHaveAttribute("data-loadout", "standard");
  await expect(game).toHaveAttribute("data-mode", "car");
});
