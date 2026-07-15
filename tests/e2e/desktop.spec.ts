import { expect, test, type Page } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";

async function waitForTick(page: Page, tick: number): Promise<void> {
  const game = page.getByTestId("afterlight-game");
  await expect
    .poll(async () => Number(await game.getAttribute("data-tick")), {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(tick);
}

async function steerToward(
  page: Page,
  target: readonly [x: number, z: number],
  radius: number,
): Promise<void> {
  const game = page.getByTestId("afterlight-game");
  try {
    await expect
      .poll(
        async () => {
          const x = Number(await game.getAttribute("data-player-x"));
          const z = Number(await game.getAttribute("data-player-z"));
          const yaw = Number(await game.getAttribute("data-vehicle-yaw"));
          const speedKph = Number(await game.getAttribute("data-speed"));
          const desired = Math.atan2(-(target[0] - x), -(target[1] - z));
          const delta = Math.atan2(
            Math.sin(desired - yaw),
            Math.cos(desired - yaw),
          );
          const distance = Math.hypot(target[0] - x, target[1] - z);

          if (distance < radius + 6 && speedKph > 18) {
            await page.keyboard.up("w");
            await page.keyboard.down("Space");
          } else {
            await page.keyboard.up("Space");
            await page.keyboard.down("w");
          }

          if (delta > 0.07) {
            await page.keyboard.up("d");
            await page.keyboard.down("a");
          } else if (delta < -0.07) {
            await page.keyboard.up("a");
            await page.keyboard.down("d");
          } else {
            await page.keyboard.up("a");
            await page.keyboard.up("d");
          }
          return distance;
        },
        { intervals: [100], timeout: 25_000 },
      )
      .toBeLessThan(radius);
  } finally {
    await page.keyboard.up("a");
    await page.keyboard.up("d");
    await page.keyboard.up("Space");
    await page.keyboard.up("w");
  }
}

test("starts Hot Ride with immediate, coherent vehicle control", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Mirage: Hot Ride");
  await expect(
    page.getByRole("heading", { name: "MIRAGE", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("One car. One clean drop.")).toBeVisible();
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  await page.getByRole("button", { name: "Play" }).click();

  const game = page.getByTestId("afterlight-game");
  await expect(game).toHaveAttribute("data-contract", "hot-ride");
  await expect(game).toHaveAttribute("data-mode", "car");
  await expect(game).toHaveAttribute("data-opening-cinematic", "false");
  await expect(page.getByRole("heading", { name: "Hot Ride" })).toBeVisible();
  await expect(
    page.getByText("Deliver the coupe to the downtown buyer."),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: /ammunition/ })).toHaveCount(0);
  await expectRenderedCanvas(page);

  await page.keyboard.press("e");
  await expect(game).toHaveAttribute("data-mode", "car");

  const startZ = Number(await game.getAttribute("data-player-z"));
  const startTick = Number(await game.getAttribute("data-tick"));
  await page.keyboard.down("w");
  await waitForTick(page, startTick + 60);
  await page.keyboard.up("w");
  expect(Number(await game.getAttribute("data-player-z"))).toBeLessThan(
    startZ - 3,
  );

  const yawBeforeLeft = Number(await game.getAttribute("data-vehicle-yaw"));
  const leftTick = Number(await game.getAttribute("data-tick"));
  await page.keyboard.down("w");
  await page.keyboard.down("a");
  await waitForTick(page, leftTick + 24);
  await page.keyboard.up("a");
  await page.keyboard.up("w");
  const yawAfterLeft = Number(await game.getAttribute("data-vehicle-yaw"));
  expect(yawAfterLeft).toBeGreaterThan(yawBeforeLeft);
  await expect(game).toHaveAttribute(
    "data-camera-yaw",
    Number(await game.getAttribute("data-vehicle-yaw")).toFixed(4),
  );
});

test("drives the complete Hot Ride route and offers an immediate replay", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();

  await steerToward(page, [56, -84], 16);

  await expect(
    page.getByRole("heading", { name: "Car delivered." }),
  ).toBeVisible({ timeout: 20_000 });
  const debrief = page.getByRole("dialog", { name: "Car delivered." });
  await expect(debrief.getByText("$2,500")).toBeVisible();
  await expect(page.getByText("OPTIONAL")).toHaveCount(0);
  await page.getByRole("button", { name: "Replay job" }).click();
  await expect(page.getByTestId("afterlight-game")).toHaveAttribute(
    "data-mode",
    "car",
  );
  await expect(
    page.getByText("Deliver the coupe to the downtown buyer."),
  ).toBeVisible();
});
