import type { Page } from "@playwright/test";

interface DriveTraceEntry {
  readonly phase: string | null;
  readonly routeIndex: number;
  readonly x: number;
  readonly z: number;
}

export async function driveMission(
  page: Page,
  timeout = 150_000,
): Promise<readonly DriveTraceEntry[]> {
  const game = page.getByTestId("mirage-game");
  const trace: DriveTraceEntry[] = [];
  let heldSteer = "";
  let braking = false;
  let boosting = false;
  let previousRoute = -1;
  const startedAt = Date.now();

  const setKey = async (key: string, down: boolean) => {
    if (down) await page.keyboard.down(key);
    else await page.keyboard.up(key);
  };

  try {
    while (Date.now() - startedAt < timeout) {
      const values = await game.evaluate((element) => ({
        phase: element.getAttribute("data-phase"),
        routeIndex: Number(element.getAttribute("data-route-index")),
        targetX: Number(element.getAttribute("data-target-x")),
        targetZ: Number(element.getAttribute("data-target-z")),
        x: Number(element.getAttribute("data-player-x")),
        yaw: Number(element.getAttribute("data-player-yaw")),
        z: Number(element.getAttribute("data-player-z")),
      }));
      if (values.routeIndex !== previousRoute) {
        trace.push({
          phase: values.phase,
          routeIndex: values.routeIndex,
          x: values.x,
          z: values.z,
        });
        previousRoute = values.routeIndex;
      }
      if (values.phase === "complete") return trace;

      const desiredX = [2, 4].includes(values.routeIndex)
        ? Math.min(values.targetX, values.x + 14)
        : values.targetX;
      const desiredZ = [0, 1].includes(values.routeIndex)
        ? Math.max(values.targetZ, values.z - 14)
        : values.routeIndex === 3
          ? Math.min(values.targetZ, values.z + 14)
          : values.targetZ;
      const targetYaw = Math.atan2(desiredX - values.x, -(desiredZ - values.z));
      let angle = targetYaw - values.yaw;
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;
      const nextSteer = Math.abs(angle) < 0.05 ? "" : angle > 0 ? "d" : "a";
      if (nextSteer !== heldSteer) {
        if (heldSteer) await setKey(heldSteer, false);
        if (nextSteer) await setKey(nextSteer, true);
        heldSteer = nextSteer;
      }
      const nextBraking = Math.abs(angle) > 0.3;
      if (nextBraking !== braking) {
        await setKey("s", nextBraking);
        braking = nextBraking;
      }
      const nextBoosting = Math.abs(angle) < 0.08;
      if (nextBoosting !== boosting) {
        await setKey("w", nextBoosting);
        boosting = nextBoosting;
      }
      await page.waitForTimeout(40);
    }
  } finally {
    if (heldSteer) await setKey(heldSteer, false);
    if (braking) await setKey("s", false);
    if (boosting) await setKey("w", false);
  }
  throw new Error(
    `Mission did not complete in ${timeout}ms: ${JSON.stringify(trace)}`,
  );
}
