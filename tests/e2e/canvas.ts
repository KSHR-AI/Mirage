import { expect, type Page } from "@playwright/test";
import { renderedPixelStats } from "../../scripts/lib/png-stats.mjs";

export async function expectRenderedCanvas(page: Page): Promise<void> {
  const canvas = page.locator("#mirage-renderer canvas");
  await expect(canvas).toBeVisible();
  const bounds = await page.evaluate(() => {
    const element = document.querySelector("#mirage-renderer canvas");
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error("Rendered canvas is unavailable");
    }
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      x: rect.left,
      y: rect.top,
    };
  });
  const session = await page.context().newCDPSession(page);
  const capture = await session.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    clip: { ...bounds, scale: 1 },
    format: "png",
    fromSurface: true,
  });
  await session.detach();
  const stats = renderedPixelStats(Buffer.from(capture.data, "base64"));
  expect(stats.litRatio).toBeGreaterThan(0.12);
  expect(stats.bucketCount).toBeGreaterThan(4);
}
