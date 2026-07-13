import { expect, test } from "@playwright/test";

const RETURNING_PLAYER_PROFILE = {
  activeUpgradeId: "reinforced-chassis",
  bankedCash: 21_000,
  bestRank: "A",
  bestTimeTicks: 18_000,
  completedOperationIds: ["mission-decoy"],
  completedRuns: 2,
  selectedOperationId: "mission-decoy",
  unlockedUpgradeIds: ["extended-magazine", "reinforced-chassis"],
  version: 1,
} as const;

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

test("workshop purchases persist and alter a new run", async ({ page }) => {
  await page.addInitScript((profile) => {
    if (!localStorage.getItem("mirage:afterlight:profile:v1")) {
      localStorage.setItem(
        "mirage:afterlight:profile:v1",
        JSON.stringify(profile),
      );
    }
  }, RETURNING_PLAYER_PROFILE);
  await page.goto("/");

  const operations = page.getByRole("radiogroup", {
    name: "Operation route",
  });
  await expect(operations.getByRole("radio")).toHaveCount(3);
  await operations.getByRole("radio", { name: /North Beach Transfer/ }).click();
  const loadouts = page.getByRole("radiogroup", { name: "Run loadout" });
  await expect(loadouts.getByRole("radio")).toHaveCount(5);
  await loadouts.getByRole("radio", { name: /Street tune/ }).click();
  await expect(
    loadouts.getByRole("radio", { name: /Street tune/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("$15,000 BANKED / BEST A")).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("radio", { name: /North Beach Transfer/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("radio", { name: /Street tune/ }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Start contract" }).click();

  const game = page.getByTestId("afterlight-game");
  await expect(game).toHaveAttribute("data-loadout", "street-tune");
  await expect(game).toHaveAttribute("data-banked-cash", "15000");
  await expect(game).toHaveAttribute("data-magazine", "24");
  await expect(game).toHaveAttribute("data-operation", "north-beach-transfer");
  await expect(game).toHaveAttribute("data-operation-vault-guards", "3");
  await expect(game).toHaveAttribute("data-operation-interceptors", "4");
  await expect(game).toHaveAttribute("data-vehicle-health", "100.00");
  await expect(game).toHaveAttribute("data-vehicle-target-speed", "29");
});

test("district contracts start in the action with authored prerequisites", async ({
  page,
}) => {
  await page.goto("/");

  const contracts = page.getByRole("radiogroup", { name: "Contract job" });
  await expect(contracts.getByRole("radio")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Start contract" }),
  ).toBeVisible({ timeout: 120_000 });
  const introLayout = await page.evaluate(() => {
    const dialog = document.querySelector(
      '[aria-labelledby="mirage-intro-title"]',
    );
    const footer = dialog?.querySelector("footer");
    const start = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start contract"),
    );
    const contractButtons = [
      ...document.querySelectorAll('[aria-label="Contract job"] button'),
    ];
    const bounds = (element: Element | undefined | null) => {
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          }
        : null;
    };
    return {
      buttons: contractButtons.map(bounds),
      footer: bounds(footer),
      start: bounds(start),
      viewport: { height: innerHeight, width: innerWidth },
    };
  });
  expect(introLayout.buttons).toHaveLength(5);
  expect(introLayout.footer).not.toBeNull();
  expect(introLayout.start).not.toBeNull();
  expect(introLayout.footer!.bottom).toBeLessThanOrEqual(
    introLayout.viewport.height,
  );
  expect(introLayout.start!.bottom).toBeLessThanOrEqual(
    introLayout.footer!.top,
  );
  for (const bounds of introLayout.buttons) {
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.left).toBeGreaterThanOrEqual(0);
    expect(bounds!.right).toBeLessThanOrEqual(introLayout.viewport.width);
  }
  await contracts.getByRole("radio", { name: /Vault Breach/ }).click();
  await expect(
    page.getByRole("heading", { name: "Vault Breach" }),
  ).toBeVisible();
  await expect(page.getByText(/Use the stolen credential/)).toBeVisible();
  await page.getByRole("button", { name: "Start contract" }).click();

  const game = page.getByTestId("afterlight-game");
  await expect(game).toHaveAttribute("data-contract", "vault-breach");
  await expect(game).toHaveAttribute("data-phase", "vault");
  await expect(game).toHaveAttribute(
    "data-contract-inventory",
    /afterlight-vault-credential/,
  );
  await expect(game).toHaveAttribute("data-player-x", "14.00");
  await expect(game).toHaveAttribute("data-player-z", "-32.00");
});
