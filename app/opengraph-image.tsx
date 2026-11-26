import { ImageResponse } from "next/og";
import {
  loadBenchmarkArt,
  loadBrandMark,
  loadOgFonts,
  OG_SIZE,
} from "./og/assets";
import { SiteCard } from "./og/cards";
import { getRegistryStats } from "./registry/evidence";
import { loadPublishedRegistry } from "./registry/load";

export const alt = "MirageML Bench: can an LLM solve GTA?";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const [registry, backdrop, mark, fonts] = await Promise.all([
    loadPublishedRegistry(),
    loadBenchmarkArt(),
    loadBrandMark(),
    loadOgFonts(),
  ]);

  return new ImageResponse(
    <SiteCard
      stats={getRegistryStats(registry.games)}
      backdrop={backdrop}
      mark={mark}
    />,
    { ...OG_SIZE, fonts },
  );
}
