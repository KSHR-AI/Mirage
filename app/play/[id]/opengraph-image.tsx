import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import {
  loadBenchmarkArt,
  loadBrandMark,
  loadMirageHostedCover,
  loadOgFonts,
  OG_SIZE,
} from "../../og/assets";
import { RunCard } from "../../og/cards";
import { loadPublishedRegistry } from "../../registry/load";

export const alt = "A MirageML Bench run card";
export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, registry] = await Promise.all([
    params,
    loadPublishedRegistry(),
  ]);
  const game = registry.games.find((candidate) => candidate.id === id);
  if (!game) notFound();

  const [cover, mark, fonts] = await Promise.all([
    loadMirageHostedCover(game),
    loadBrandMark(),
    loadOgFonts(),
  ]);

  return new ImageResponse(
    <RunCard
      game={game}
      backdrop={cover ?? (await loadBenchmarkArt())}
      mark={mark}
    />,
    { ...OG_SIZE, fonts },
  );
}
