import type { Page } from "@playwright/test";

interface DriveTraceEntry {
  readonly collisions: number;
  readonly phase: string | null;
  readonly routeIndex: number;
  readonly routeDistance: number;
}

function targetLane(routeDistance: number): number {
  if (routeDistance < 70) return 0;
  if (routeDistance < 112) return 4;
  if (routeDistance < 156) return -4;
  if (routeDistance < 200) return 0;
  if (routeDistance < 218) return 4;
  if (routeDistance < 246) return 0;
  if (routeDistance < 268) return 4;
  return -4;
}

export async function driveMission(
  page: Page,
  timeout = 60_000,
): Promise<readonly DriveTraceEntry[]> {
  const game = page.getByTestId("mirage-game");
  const trace: DriveTraceEntry[] = [];
  let previousRoute = -1;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const values = await game.evaluate((element) => ({
      collisions: Number(element.getAttribute("data-collisions")),
      laneOffset: Number(element.getAttribute("data-lane-offset")),
      laneTarget: Number(element.getAttribute("data-lane-target")),
      phase: element.getAttribute("data-phase"),
      routeDistance: Number(element.getAttribute("data-route-distance")),
      routeIndex: Number(element.getAttribute("data-route-index")),
    }));
    if (values.routeIndex !== previousRoute) {
      trace.push(values);
      previousRoute = values.routeIndex;
    }
    if (values.phase === "complete") return trace;
    if (values.phase === "busted") {
      throw new Error(`Clean route was busted: ${JSON.stringify(values)}`);
    }

    const difference = targetLane(values.routeDistance) - values.laneTarget;
    if (Math.abs(difference) >= 1.25) {
      const key = difference > 0 ? "d" : "a";
      await page.keyboard.down(key);
      await page.waitForTimeout(250);
      await page.keyboard.up(key);
      await page.waitForTimeout(200);
    } else {
      await page.waitForTimeout(50);
    }
  }

  throw new Error(
    `Mission did not complete in ${timeout}ms: ${JSON.stringify(trace)}`,
  );
}
