import { expect, test } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";

test("plays the opening Afterlight loop with keyboard and mouse", async ({
  page,
}) => {
  test.setTimeout(210_000);
  await page.addInitScript(() => {
    let pointerLocked = false;
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
        return Promise.resolve();
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
  await expectRenderedCanvas(page);
  await expect
    .poll(async () => Number(await shell.getAttribute("data-tick")), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  const groundedY = Number(await shell.getAttribute("data-player-y"));
  await page.keyboard.press("Space");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-player-y")), {
      timeout: 20_000,
    })
    .toBeGreaterThan(groundedY + 0.12);
  await expect
    .poll(
      async () =>
        Math.abs(Number(await shell.getAttribute("data-player-y")) - groundedY),
      { timeout: 20_000 },
    )
    .toBeLessThan(0.03);

  const yawBeforeLook = Number(await shell.getAttribute("data-player-yaw"));
  const magazineBeforeLook = Number(await shell.getAttribute("data-magazine"));
  await inputSurface.dispatchEvent("pointermove", {
    movementX: 140,
    movementY: -30,
    pointerId: 1,
    pointerType: "mouse",
  });
  await expect
    .poll(async () => Number(await shell.getAttribute("data-player-yaw")))
    .not.toBe(yawBeforeLook);
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

  await page.keyboard.down("w");
  await expect
    .poll(async () => Number(await shell.getAttribute("data-speed")))
    .toBeGreaterThan(1);
  await page.keyboard.up("w");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  await expect(shell).toHaveAttribute("data-pointer-locked", "false");
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
