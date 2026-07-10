import { expect, test } from "@playwright/test";
import { expectRenderedCanvas } from "./canvas";

test("exposes a complete playable touch control set", async ({ page }) => {
  await page.addInitScript(() => {
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
