import { redirect } from "next/navigation";
import { RegistryNotice } from "../gallery/RegistryNotice";
import { loadPublishedRegistry } from "../registry/load";
import { getCanonicalPlayPath } from "../registry/urls";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const registry = await loadPublishedRegistry();
  if (registry.kind !== "ready") {
    return <RegistryNotice kind={registry.kind} message={registry.message} />;
  }
  redirect(getCanonicalPlayPath(registry.games[0]));
}
