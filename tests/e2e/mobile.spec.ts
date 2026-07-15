import { expect, test } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });
});

test("offers three large, non-overlapping touch controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start run" }).click();
  await expectRenderedCanvas(page);

  const game = page.getByTestId("mirage-game");
  await expect(game).toHaveAttribute("data-touch", "true");
  const controls = page.locator('[aria-label="Touch game controls"] button');
  await expect(controls).toHaveCount(3);
  expect(
    await controls.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    ),
  ).toEqual(["Steer", "Boost", "Brake"]);

  const layout = await controls.evaluateAll((buttons) => {
    const rects = buttons.map((button) => button.getBoundingClientRect());
    const overlaps = rects.flatMap((rect, index) =>
      rects
        .slice(index + 1)
        .filter(
          (other) =>
            rect.left < other.right &&
            rect.right > other.left &&
            rect.top < other.bottom &&
            rect.bottom > other.top,
        ),
    );
    return {
      overlaps: overlaps.length,
      sizes: rects.map((rect) => ({ height: rect.height, width: rect.width })),
    };
  });
  expect(layout.overlaps).toBe(0);
  for (const size of layout.sizes) {
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(size.width).toBeGreaterThanOrEqual(44);
  }
});

test("touch steering, boost, and brake alter the real simulation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start run" }).click();
  const game = page.getByTestId("mirage-game");
  const steer = page.getByRole("button", { name: "Steer" });
  const startYaw = Number(await game.getAttribute("data-player-yaw"));
  const startX = Number(await game.getAttribute("data-player-x"));

  await steer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: rect.right - 8,
        clientY: rect.top + rect.height / 2,
        pointerId: 7,
        pointerType: "touch",
      }),
    );
  });
  await page.waitForTimeout(800);
  await steer.evaluate((element) => {
    element.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 7,
        pointerType: "touch",
      }),
    );
  });
  expect(Number(await game.getAttribute("data-player-yaw"))).toBeGreaterThan(
    startYaw + 0.5,
  );
  expect(Number(await game.getAttribute("data-player-x"))).toBeGreaterThan(
    startX + 2,
  );

  const boost = page.getByRole("button", { name: "Boost" });
  await boost.dispatchEvent("pointerdown", {
    pointerId: 8,
    pointerType: "touch",
  });
  await page.waitForTimeout(700);
  const boostedSpeed = Number(await game.getAttribute("data-player-speed"));
  await boost.dispatchEvent("pointerup", {
    pointerId: 8,
    pointerType: "touch",
  });
  expect(boostedSpeed).toBeGreaterThan(15);

  const brake = page.getByRole("button", { name: "Brake" });
  await brake.dispatchEvent("pointerdown", {
    pointerId: 9,
    pointerType: "touch",
  });
  await page.waitForTimeout(700);
  const brakedSpeed = Number(await game.getAttribute("data-player-speed"));
  await brake.dispatchEvent("pointerup", {
    pointerId: 9,
    pointerType: "touch",
  });
  expect(brakedSpeed).toBeLessThan(boostedSpeed - 5);
});
