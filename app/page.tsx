import { DemoGallery } from "./gallery/DemoGallery";
import { loadPublishedRegistry } from "./registry/load";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ run?: string | string[] }>;
};

export default async function Page({ searchParams }: PageProps) {
  const [registry, { run }] = await Promise.all([
    loadPublishedRegistry(),
    searchParams,
  ]);
  return (
    <DemoGallery
      games={registry.games}
      registryState={{
        kind: registry.kind,
        message: registry.message,
      }}
      initialRunId={typeof run === "string" ? run : null}
    />
  );
}
