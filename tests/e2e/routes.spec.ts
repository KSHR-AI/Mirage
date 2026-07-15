import { expect, test } from "@playwright/test";

test("obsolete prototype routes and platform gates stay removed", async ({
  request,
}) => {
  for (const path of [
    "/asset-lab",
    "/api/billing/checkout",
    "/api/auth/sign-in",
    "/api/reactor/token",
    "/labs/lingbot",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});

test("old saved profiles cannot reopen the former game", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "mirage:afterlight:profile:v1",
      JSON.stringify({
        bankedCash: 99_000,
        completedRuns: 12,
        selectedContractId: "afterlight-job",
        version: 1,
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Start run" })).toBeVisible();
  await expect(
    page.getByText(/Banked|Loadout|Contract|Afterlight/),
  ).toHaveCount(0);
});
