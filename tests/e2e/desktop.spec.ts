import { expect, test } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";
import { driveMission } from "./drive";

test("opens directly into one polished fixed-camera mission", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Mirage: The Drop");
  await expect(
    page.getByRole("heading", { name: "Mirage", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Drop" })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Start run" })).toBeEnabled();
  await expect(
    page.getByText(/Loadout|Contract|Upgrade|Afterlight/),
  ).toHaveCount(0);
  await expectRenderedCanvas(page);

  const game = page.getByTestId("mirage-game");
  await expect(game).toHaveAttribute("data-camera-mode", "fixed-isometric");
  await expect(game).toHaveAttribute("data-map-blocks", "36");
  await expect(game).toHaveAttribute("data-scene-ready", "true");
  await expect
    .poll(async () => Number(await game.getAttribute("data-draw-calls")))
    .toBeGreaterThan(0);
  expect(
    Number(await game.getAttribute("data-draw-calls")),
  ).toBeLessThanOrEqual(120);
});

test("starts moving immediately and gives predictable lane controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start run" }).click();
  const game = page.getByTestId("mirage-game");
  const startZ = Number(await game.getAttribute("data-player-z"));

  await expect
    .poll(async () => Number(await game.getAttribute("data-player-z")), {
      timeout: 6_000,
    })
    .toBeLessThan(startZ - 12);
  await expect(game).toHaveAttribute("data-route-index", "1", {
    timeout: 8_000,
  });

  const routeBefore = Number(await game.getAttribute("data-route-distance"));
  await page.keyboard.down("d");
  await page.waitForTimeout(650);
  await page.keyboard.up("d");
  const laneAfter = Number(await game.getAttribute("data-lane-offset"));
  const routeAfter = Number(await game.getAttribute("data-route-distance"));
  expect(laneAfter).toBeGreaterThan(3.2);
  expect(routeAfter).toBeGreaterThan(routeBefore + 4);

  await page.waitForTimeout(600);
  expect(Number(await game.getAttribute("data-lane-offset"))).toBeCloseTo(
    laneAfter,
    1,
  );
});

test("cannot steer off the road or strand the car", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start run" }).click();
  const game = page.getByTestId("mirage-game");
  const startRoute = Number(await game.getAttribute("data-route-distance"));
  await page.keyboard.down("d");
  try {
    await page.waitForTimeout(5_000);
  } finally {
    await page.keyboard.up("d");
  }
  expect(Number(await game.getAttribute("data-lane-offset"))).toBe(4);
  expect(
    Number(await game.getAttribute("data-route-distance")),
  ).toBeGreaterThan(startRoute + 40);
  expect(Number(await game.getAttribute("data-player-speed"))).toBeGreaterThan(
    0,
  );
});

test("completes The Drop with pursuit, ramp, scoring, and replay", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Start run" }).click();

  const trace = await driveMission(page);
  expect(trace.map((entry) => entry.routeIndex)).toEqual([0, 1, 2, 3, 4, 5]);

  const game = page.getByTestId("mirage-game");
  await expect(game).toHaveAttribute("data-phase", "complete");
  await expect(game).toHaveAttribute("data-ramp-used", "true");
  expect(
    Number(await game.getAttribute("data-boost-pickups")),
  ).toBeGreaterThanOrEqual(1);
  const dialog = page.getByRole("dialog", { name: "The drop is clean." });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Pier 11 / Package delivered")).toBeVisible();
  await expect(dialog.getByText("Score")).toBeVisible();
  await expect(dialog.getByText("Collisions")).toBeVisible();
  await expect(dialog.getByText("Near misses")).toBeVisible();

  await page.getByRole("button", { name: "Replay The Drop" }).click();
  await expect(game).toHaveAttribute("data-phase", "pickup");
  await expect(game).toHaveAttribute("data-route-index", "0");
});
