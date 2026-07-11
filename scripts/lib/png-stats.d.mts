export interface RenderedPixelStats {
  readonly bucketCount: number;
  readonly height: number;
  readonly litRatio: number;
  readonly width: number;
}

export function renderedPixelStats(png: Buffer): RenderedPixelStats;
