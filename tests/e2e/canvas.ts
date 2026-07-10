import { inflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";

interface PixelStats {
  readonly bucketCount: number;
  readonly litRatio: number;
}

function paeth(left: number, up: number, upperLeft: number): number {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function renderedPixelStats(png: Buffer): PixelStats {
  const signature = "89504e470d0a1a0a";
  if (png.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Canvas screenshot is not a PNG");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let offset = 8;
  const imageData: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      imageData.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (
    width <= 0 ||
    height <= 0 ||
    bitDepth !== 8 ||
    channels === 0 ||
    interlace !== 0 ||
    imageData.length === 0
  ) {
    throw new Error(
      `Unsupported canvas PNG: ${width}x${height}, depth ${bitDepth}, type ${colorType}, interlace ${interlace}`,
    );
  }

  const decoded = inflateSync(Buffer.concat(imageData));
  const stride = width * channels;
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  const buckets = new Set<number>();
  const sampleStepX = Math.max(1, Math.floor(width / 64));
  const sampleStepY = Math.max(1, Math.floor(height / 40));
  let sourceOffset = 0;
  let litPixels = 0;
  let sampledPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = decoded[sourceOffset];
    sourceOffset += 1;
    for (let index = 0; index < stride; index += 1) {
      const value = decoded[sourceOffset + index];
      const left = index >= channels ? current[index - channels] : 0;
      const up = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : filter === 4
                  ? paeth(left, up, upperLeft)
                  : Number.NaN;
      if (!Number.isFinite(predictor)) {
        throw new Error(`Unsupported PNG row filter ${filter}`);
      }
      current[index] = (value + predictor) & 0xff;
    }
    sourceOffset += stride;

    if (y % sampleStepY === 0) {
      for (let x = 0; x < width; x += sampleStepX) {
        const index = x * channels;
        const luma =
          current[index] * 0.2126 +
          current[index + 1] * 0.7152 +
          current[index + 2] * 0.0722;
        if (luma > 8) litPixels += 1;
        buckets.add(Math.floor(luma / 12));
        sampledPixels += 1;
      }
    }
    previous.set(current);
  }

  return {
    bucketCount: buckets.size,
    litRatio: sampledPixels === 0 ? 0 : litPixels / sampledPixels,
  };
}

export async function expectRenderedCanvas(page: Page): Promise<void> {
  const canvas = page.locator("canvas#afterlight-renderer");
  await expect(canvas).toBeVisible();
  const stats = renderedPixelStats(await canvas.screenshot({ type: "png" }));
  expect(stats.litRatio).toBeGreaterThan(0.12);
  expect(stats.bucketCount).toBeGreaterThan(4);
}
