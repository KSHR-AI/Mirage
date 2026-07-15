import { expect, test } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";

test("offers a compact, playable touch driving surface", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  await expectRenderedCanvas(page);

  const game = page.getByTestId("afterlight-game");
  await expect(game).toHaveAttribute("data-contract", "hot-ride");
  await expect(game).toHaveAttribute("data-mode", "car");
  for (const label of ["Move", "Boost", "Brake"]) {
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  }
  for (const label of ["Look", "Interact", "Exit vehicle", "Fire", "Aim"]) {
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
  }

  const layout = await page.evaluate(() => {
    const controls = document.querySelector(
      '[aria-label="Touch game controls"]',
    );
    const objective = document.querySelector('[class*="objectivePrompt"]');
    const lowerHud = document.querySelector('[class*="simpleLowerHud"]');
    if (!(controls instanceof HTMLElement)) throw new Error("controls missing");
    const targets = [...controls.querySelectorAll("button")].map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    });
    const overlapCount = targets.flatMap((target, index) =>
      targets
        .slice(index + 1)
        .filter(
          (other) =>
            target.left < other.right &&
            target.right > other.left &&
            target.top < other.bottom &&
            target.bottom > other.top,
        ),
    ).length;
    const objectiveRect = objective?.getBoundingClientRect();
    const lowerRect = lowerHud?.getBoundingClientRect();
    return {
      lowerTop: lowerRect?.top ?? 0,
      objectiveBottom: objectiveRect?.bottom ?? innerHeight,
      overlapCount,
      targets,
    };
  });
  expect(layout.overlapCount).toBe(0);
  expect(layout.lowerTop - layout.objectiveBottom).toBeGreaterThan(100);
  expect(layout.targets).toHaveLength(3);
  for (const target of layout.targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  const move = page.getByRole("button", { name: "Move", exact: true });
  const startZ = Number(await game.getAttribute("data-player-z"));
  await move.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + 4,
        pointerId: 41,
        pointerType: "touch",
      }),
    );
  });
  await expect
    .poll(async () => Number(await game.getAttribute("data-player-z")), {
      timeout: 20_000,
    })
    .toBeLessThan(startZ - 2);
  await move.evaluate((element) => {
    element.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 41,
        pointerType: "touch",
      }),
    );
  });
});
