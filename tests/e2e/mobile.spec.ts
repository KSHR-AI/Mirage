import { expect, test } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";

test("exposes a complete playable touch control set", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });
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

  const layout = await page.evaluate(() => {
    const hud = document.querySelector('[aria-label="Afterlight mission HUD"]');
    const mission = hud?.querySelector('section[aria-live="polite"]');
    const lower = hud?.querySelector("footer");
    const controls = document.querySelector(
      '[aria-label="Touch game controls"]',
    );
    if (!(mission instanceof HTMLElement)) throw new Error("Mission missing");
    if (!(lower instanceof HTMLElement)) throw new Error("Lower HUD missing");
    if (!(controls instanceof HTMLElement)) {
      throw new Error("Touch controls missing");
    }

    const missionRect = mission.getBoundingClientRect();
    const lowerRect = lower.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    const targetRects = [...controls.querySelectorAll("button")].map(
      (button) => {
        const bounds = button.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          height: bounds.height,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          width: bounds.width,
        };
      },
    );
    const overlapCount = targetRects.flatMap((candidate, index) =>
      targetRects
        .slice(index + 1)
        .filter(
          (other) =>
            candidate.left < other.right &&
            candidate.right > other.left &&
            candidate.top < other.bottom &&
            candidate.bottom > other.top,
        ),
    ).length;
    const visibleObjectives = [...mission.querySelectorAll("li")].filter(
      (element) => {
        const bounds = element.getBoundingClientRect();
        return (
          getComputedStyle(element).display !== "none" && bounds.height > 0
        );
      },
    ).length;

    return {
      controlsHeight: controlsRect.height,
      lowerHeight: lowerRect.height,
      lowerTouchGap: controlsRect.top - lowerRect.bottom,
      missionHeight: missionRect.height,
      missionWidthRatio: missionRect.width / innerWidth,
      overlapCount,
      sceneBandRatio: (lowerRect.top - missionRect.bottom) / innerHeight,
      targetRects,
      visibleObjectives,
    };
  });

  expect(layout.missionHeight).toBeLessThanOrEqual(132);
  expect(layout.missionWidthRatio).toBeLessThanOrEqual(0.8);
  expect(layout.sceneBandRatio).toBeGreaterThanOrEqual(0.4);
  expect(layout.visibleObjectives).toBeGreaterThanOrEqual(1);
  expect(layout.visibleObjectives).toBeLessThanOrEqual(2);
  expect(layout.lowerHeight).toBeLessThanOrEqual(70);
  expect(layout.controlsHeight).toBeLessThanOrEqual(104);
  expect(layout.lowerTouchGap).toBeGreaterThanOrEqual(8);
  expect(layout.overlapCount).toBe(0);
  expect(layout.targetRects).toHaveLength(8);
  for (const target of layout.targetRects) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  const shell = page.getByTestId("afterlight-game");
  const dispatchStick = async (
    label: "Move" | "Look",
    phase: "pointerdown" | "pointerup",
    xScale: number,
    yScale: number,
  ) => {
    await page.getByRole("button", { name: label, exact: true }).evaluate(
      (element, event) => {
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(
          new PointerEvent(event.phase, {
            bubbles: true,
            clientX: rect.left + rect.width * event.xScale,
            clientY: rect.top + rect.height * event.yScale,
            pointerId: event.label === "Move" ? 41 : 42,
            pointerType: "touch",
          }),
        );
      },
      { label, phase, xScale, yScale },
    );
  };

  const zBeforeMove = Number(await shell.getAttribute("data-player-z"));
  await dispatchStick("Move", "pointerdown", 0.5, 0.08);
  await expect
    .poll(async () => Number(await shell.getAttribute("data-player-z")), {
      timeout: 20_000,
    })
    .not.toBe(zBeforeMove);
  await dispatchStick("Move", "pointerup", 0.5, 0.08);

  const yawBeforeLook = Number(await shell.getAttribute("data-player-yaw"));
  const cameraYawBeforeLook = Number(
    await shell.getAttribute("data-camera-yaw"),
  );
  await dispatchStick("Look", "pointerdown", 0.92, 0.5);
  await expect
    .poll(
      async () => Math.abs(Number(await shell.getAttribute("data-look-x"))),
      {
        timeout: 20_000,
      },
    )
    .toBeGreaterThan(0.1);
  await expect
    .poll(async () => Number(await shell.getAttribute("data-player-yaw")), {
      timeout: 20_000,
    })
    .toBe(yawBeforeLook);
  await expect
    .poll(async () => Number(await shell.getAttribute("data-camera-yaw")), {
      timeout: 20_000,
    })
    .not.toBe(cameraYawBeforeLook);
  await dispatchStick("Look", "pointerup", 0.92, 0.5);

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
