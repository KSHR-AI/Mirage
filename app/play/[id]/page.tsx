import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegistryNotice } from "../../gallery/RegistryNotice";
import { GamePlayer } from "../../player/GamePlayer";
import { loadPublishedRegistry } from "../../registry/load";
import { getCanonicalPlayPath } from "../../registry/urls";

type GamePageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: GamePageProps): Promise<Metadata> {
  const { id } = await params;
  const registry = await loadPublishedRegistry();
  const game = registry.games.find((candidate) => candidate.id === id);
  if (!game) return {};

  return {
    title: `${game.title} — Mirage`,
    description: game.description,
    alternates: {
      canonical: getCanonicalPlayPath(game),
    },
  };
}

export default async function GamePage({ params }: GamePageProps) {
  const { id } = await params;
  const registry = await loadPublishedRegistry();
  if (registry.kind === "unavailable") {
    return <RegistryNotice kind="unavailable" message={registry.message} />;
  }

  const game = registry.games.find((candidate) => candidate.id === id);
  if (!game) notFound();
  return <GamePlayer game={game} />;
}
