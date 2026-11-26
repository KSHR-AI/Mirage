import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegistryNotice } from "../../gallery/RegistryNotice";
import { playBackLink } from "../../arena/match";
import { GamePlayer } from "../../player/GamePlayer";
import { loadPublishedRegistry } from "../../registry/load";
import { getModelLabel } from "../../registry/evidence";
import { getCanonicalPlayPath } from "../../registry/urls";

type GamePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: GamePageProps): Promise<Metadata> {
  const { id } = await params;
  const registry = await loadPublishedRegistry();
  const game = registry.games.find((candidate) => candidate.id === id);
  if (!game) return {};

  const title = `${game.title} — MirageML Bench`;
  // A share card names the run and its model; it grades nothing.
  const summary = `${getModelLabel(game)} · ${game.tagline}. Play it in your browser.`;

  return {
    title,
    description: game.description,
    alternates: {
      canonical: getCanonicalPlayPath(game),
    },
    openGraph: {
      title,
      description: summary,
      type: "website",
      url: getCanonicalPlayPath(game),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: summary,
    },
  };
}

export default async function GamePage({
  params,
  searchParams,
}: GamePageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const registry = await loadPublishedRegistry();
  if (registry.kind === "unavailable") {
    return <RegistryNotice kind="unavailable" message={registry.message} />;
  }

  const game = registry.games.find((candidate) => candidate.id === id);
  if (!game) notFound();
  return <GamePlayer game={game} back={playBackLink(query)} />;
}
