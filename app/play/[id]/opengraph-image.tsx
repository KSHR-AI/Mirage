import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import {
  loadBenchmarkArt,
  loadBrandMark,
  loadRunCover,
  loadOgFonts,
  OG_SIZE,
} from "../../og/assets";
import { RunCard } from "../../og/cards";
import { loadPublishedRegistry } from "../../registry/load";

export const alt = "A MirageML Bench run card";
export const size = OG_SIZE;
export const contentType = "image/png";

// Every accepted run is known at build time, so its card is prerendered.
export async function generateStaticParams() {
  const registry = await loadPublishedRegistry();
  return registry.games.map((game) => ({ id: game.id }));
}

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
    loadRunCover(game),
    loadBrandMark(),
    loadOgFonts(),
  ]);

  return new ImageResponse(
    <RunCard
      game={game}
      cover={cover ?? (await loadBenchmarkArt())}
      mark={mark}
    />,
    { ...OG_SIZE, fonts },
  );
}
