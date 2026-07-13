import { expect, test } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";

test("plays the opening Afterlight loop with keyboard and mouse", async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  await page.addInitScript(() => {
    let pointerLocked = false;
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(Document.prototype, "pointerLockElement", {
      configurable: true,
      get: () =>
        pointerLocked ? document.querySelector(".game-input-surface") : null,
    });
    Object.defineProperty(HTMLElement.prototype, "requestPointerLock", {
      configurable: true,
      value: function requestPointerLock() {
        pointerLocked = true;
        document.dispatchEvent(new Event("pointerlockchange"));
      },
    });
    Object.defineProperty(Document.prototype, "exitPointerLock", {
      configurable: true,
      value: function exitPointerLock() {
        pointerLocked = false;
        document.dispatchEvent(new Event("pointerlockchange"));
      },
    });
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Mirage: The Afterlight Job");
  await expect(
    page.getByRole("heading", { name: "MIRAGE", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start the job" }).click();

  const decodedAudioDurations = await page.evaluate(async () => {
    const context = new AudioContext();
    const decode = async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${response.status} loading ${path}`);
      return (await context.decodeAudioData(await response.arrayBuffer()))
        .duration;
    };
    const durations = await Promise.all([
      decode("/game-assets/audio/weapons/pistol-fire-01.ogg"),
      decode("/game-assets/audio/ambience/urban-rain-loop.ogg"),
    ]);
    await context.close();
    return durations;
  });
  expect(decodedAudioDurations[0]).toBeGreaterThan(0.1);
  expect(decodedAudioDurations[1]).toBeGreaterThan(5);

  const shell = page.getByTestId("afterlight-game");
  const inputSurface = page.locator(".game-input-surface");
  const dispatchPointer = async (
    type: "pointerdown" | "pointerup",
    button: number,
  ) =>
    page.evaluate(
      ({ eventType, eventButton }) => {
        const surface = document.querySelector(".game-input-surface");
        if (!surface) throw new Error("missing game input surface");
        surface.dispatchEvent(
          new PointerEvent(eventType, {
            bubbles: true,
            button: eventButton,
            pointerId: 1,
            pointerType: "mouse",
          }),
        );
      },
      { eventButton: button, eventType: type },
    );
  await expect(shell).toHaveAttribute("data-mode", "foot");
  await inputSurface.click({ force: true, position: { x: 640, y: 360 } });
  await expect(shell).toHaveAttribute("data-pointer-locked", "true");
  await expect(page.getByRole("heading", { name: "Boost" })).toBeVisible();
  await expect
    .poll(async () => Number(await shell.getAttribute("data-tick")), {
      timeout: 120_000,
    })
    .toBeGreaterThan(0);
  await expectRenderedCanvas(page);

  const groundedY = Number(await shell.getAttribute("data-player-y"));
  await page.keyboard.press("Space");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-player-y")), {
      timeout: 120_000,
    })
    .toBeGreaterThan(groundedY + 0.12);
  await expect
    .poll(
      async () =>
        Math.abs(Number(await shell.getAttribute("data-player-y")) - groundedY),
      { timeout: 120_000 },
    )
    .toBeLessThan(0.03);

  const yawBeforeLook = Number(await shell.getAttribute("data-player-yaw"));
  const cameraYawBeforeLook = Number(
    await shell.getAttribute("data-camera-yaw"),
  );
  const magazineBeforeLook = Number(await shell.getAttribute("data-magazine"));
  await inputSurface.dispatchEvent("pointermove", {
    movementX: 140,
    movementY: -30,
    pointerId: 1,
    pointerType: "mouse",
  });
  // Free-look moves the camera without snapping an idle actor's body.
  await expect(shell).toHaveAttribute(
    "data-player-yaw",
    yawBeforeLook.toFixed(4),
  );
  await expect
    .poll(async () => Number(await shell.getAttribute("data-camera-yaw")))
    .not.toBe(cameraYawBeforeLook);
  const walkingCameraYaw = Number(await shell.getAttribute("data-camera-yaw"));
  await expect(shell).toHaveAttribute(
    "data-magazine",
    String(magazineBeforeLook),
  );

  await dispatchPointer("pointerdown", 2);
  await expect(shell).toHaveAttribute("data-aiming", "true");
  await expect(shell).toHaveAttribute(
    "data-magazine",
    String(magazineBeforeLook),
  );
  await dispatchPointer("pointerup", 2);

  await inputSurface.click({ force: true, position: { x: 640, y: 360 } });
  await expect
    .poll(async () => Number(await shell.getAttribute("data-magazine")))
    .toBeLessThan(magazineBeforeLook);

  const before = Number(await shell.getAttribute("data-player-z"));
  const beforeX = Number(await shell.getAttribute("data-player-x"));
  const strideStartTick = Number(await shell.getAttribute("data-tick"));
  await page.keyboard.down("w");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-tick")), {
      timeout: 120_000,
    })
    .toBeGreaterThanOrEqual(strideStartTick + 60);
  await page.keyboard.up("w");
  const afterStride = Number(await shell.getAttribute("data-player-z"));
  const afterStrideX = Number(await shell.getAttribute("data-player-x"));
  const strideDistance = Math.hypot(
    afterStrideX - beforeX,
    afterStride - before,
  );
  const strideX = afterStrideX - beforeX;
  const strideZ = afterStride - before;
  const forwardTravel =
    strideX * Math.sin(walkingCameraYaw) + strideZ * Math.cos(walkingCameraYaw);
  const lateralTravel =
    strideX * Math.cos(walkingCameraYaw) - strideZ * Math.sin(walkingCameraYaw);
  expect(strideDistance).toBeGreaterThan(3);
  expect(strideDistance).toBeLessThan(5.2);
  expect(forwardTravel).toBeGreaterThan(3);
  expect(Math.abs(lateralTravel)).toBeLessThan(0.35);

  const restingYaw = Number(await shell.getAttribute("data-player-yaw"));
  const restStartTick = Number(await shell.getAttribute("data-tick"));
  await expect
    .poll(async () => Number(await shell.getAttribute("data-tick")), {
      timeout: 120_000,
    })
    .toBeGreaterThanOrEqual(restStartTick + 20);
  expect(Number(await shell.getAttribute("data-player-yaw"))).toBeCloseTo(
    restingYaw,
    2,
  );

  const returnStartTick = Number(await shell.getAttribute("data-tick"));
  await page.keyboard.down("s");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-tick")), {
      timeout: 120_000,
    })
    .toBeGreaterThanOrEqual(returnStartTick + 60);
  await page.keyboard.up("s");

  await page.keyboard.press("e");
  await expect(shell).toHaveAttribute("data-mode", "car");
  await expect(page.getByText("M/01 COUPE", { exact: true })).toBeVisible();
  await expect(page.getByText("1/3 required", { exact: true })).toBeVisible();

  await page.keyboard.down("w");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-speed")))
    .toBeGreaterThan(1);
  await page.keyboard.up("w");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement === null))
    .toBe(true);
  const sensitivity = page.getByRole("slider", { name: "Look sensitivity" });
  await expect(sensitivity).toHaveValue("100");
  await sensitivity.fill("150");
  await page.getByRole("switch", { name: "Invert vertical look: off" }).click();
  const keyboardBindings = page.getByLabel("Keyboard bindings");
  await keyboardBindings
    .getByRole("button", { name: "Change Forward key. Current key W" })
    .click();
  await page.keyboard.press("i");
  await expect(
    keyboardBindings.getByRole("button", {
      name: "Change Forward key. Current key I",
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("mirage:controls:v1");
        if (!raw) return null;
        const controls = JSON.parse(raw);
        return {
          forward: controls.keyboardBindings?.["move-forward"],
          invertLookY: controls.invertLookY,
          lookSensitivity: controls.lookSensitivity,
        };
      }),
    )
    .toEqual({
      forward: "KeyI",
      invertLookY: true,
      lookSensitivity: 1.5,
    });
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(shell).toHaveAttribute("data-pointer-locked", "true");
});

test("keeps mouse-look and camera-relative movement in a narrow desktop window", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 722, height: 825 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start the job" }).click();

  const shell = page.getByTestId("afterlight-game");
  const inputSurface = page.locator(".game-input-surface");
  await expect(shell).toHaveAttribute("data-opening-cinematic", "true");
  await expect(page.locator('[aria-label="Touch game controls"]')).toHaveCount(
    0,
  );

  const yawBefore = Number(await shell.getAttribute("data-camera-yaw"));
  await inputSurface.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: 430,
    clientY: 410,
    pointerId: 77,
    pointerType: "mouse",
  });
  await inputSurface.dispatchEvent("pointermove", {
    bubbles: true,
    clientX: 550,
    clientY: 410,
    movementX: 120,
    pointerId: 77,
    pointerType: "mouse",
  });
  await inputSurface.dispatchEvent("pointerup", {
    bubbles: true,
    button: 0,
    clientX: 550,
    clientY: 410,
    pointerId: 77,
    pointerType: "mouse",
  });
  await expect(shell).toHaveAttribute("data-opening-cinematic", "false");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-camera-yaw")))
    .not.toBe(yawBefore);

  const cameraYaw = Number(await shell.getAttribute("data-camera-yaw"));
  const startX = Number(await shell.getAttribute("data-player-x"));
  const startZ = Number(await shell.getAttribute("data-player-z"));
  const startTick = Number(await shell.getAttribute("data-tick"));
  await page.keyboard.down("w");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-tick")), {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(startTick + 60);
  await page.keyboard.up("w");

  const travelX = Number(await shell.getAttribute("data-player-x")) - startX;
  const travelZ = Number(await shell.getAttribute("data-player-z")) - startZ;
  const forwardTravel =
    travelX * Math.sin(cameraYaw) + travelZ * Math.cos(cameraYaw);
  const lateralTravel =
    travelX * Math.cos(cameraYaw) - travelZ * Math.sin(cameraYaw);
  expect(forwardTravel).toBeGreaterThan(3);
  expect(Math.abs(lateralTravel)).toBeLessThan(0.5);
});
