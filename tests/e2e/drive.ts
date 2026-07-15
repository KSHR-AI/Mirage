import type { Page } from "@playwright/test";

interface DriveTraceEntry {
  readonly phase: string | null;
  readonly routeIndex: number;
  readonly x: number;
  readonly z: number;
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
      phase: element.getAttribute("data-phase"),
      routeIndex: Number(element.getAttribute("data-route-index")),
      x: Number(element.getAttribute("data-player-x")),
      z: Number(element.getAttribute("data-player-z")),
    }));
    if (values.routeIndex !== previousRoute) {
      trace.push(values);
      previousRoute = values.routeIndex;
    }
    if (values.phase === "complete") return trace;
    await page.waitForTimeout(50);
  }

  throw new Error(
    `Mission did not complete in ${timeout}ms: ${JSON.stringify(trace)}`,
  );
}
