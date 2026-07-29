import { DemoGallery } from "./gallery/DemoGallery";
import { loadPublishedRegistry } from "./registry/load";

export const dynamic = "force-dynamic";

export default async function Page() {
  const registry = await loadPublishedRegistry();
  return (
    <DemoGallery
      games={registry.games}
      registryState={{
        kind: registry.kind,
        message: registry.message,
      }}
    />
  );
}
