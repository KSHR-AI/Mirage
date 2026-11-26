import { redirect } from "next/navigation";
import { RegistryNotice } from "../gallery/RegistryNotice";
import { loadPublishedRegistry } from "../registry/load";
import { getCanonicalPlayPath } from "../registry/urls";

export const dynamic = "force-dynamic";

/** "Play a random run": any published run, chosen per visit. */
export default async function PlayPage() {
  const registry = await loadPublishedRegistry();
  if (registry.kind !== "ready") {
    return <RegistryNotice kind={registry.kind} message={registry.message} />;
  }
  redirect(getCanonicalPlayPath(pickRandom(registry.games)));
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
