import { expect, type Page } from "@playwright/test";
import { renderedPixelStats } from "../../scripts/lib/png-stats.mjs";

export async function expectRenderedCanvas(page: Page): Promise<void> {
  const canvas = page.locator("canvas#afterlight-renderer");
  await expect(canvas).toBeVisible();
  const stats = renderedPixelStats(await canvas.screenshot({ type: "png" }));
  expect(stats.litRatio).toBeGreaterThan(0.12);
  expect(stats.bucketCount).toBeGreaterThan(4);
}
