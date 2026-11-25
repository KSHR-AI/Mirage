import { DemoGallery } from "./gallery/DemoGallery";
import { loadPublishedRegistry } from "./registry/load";
import { loadSubmitPrompt } from "./registry/load-submit-prompt";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ run?: string | string[] }>;
};

export default async function Page({ searchParams }: PageProps) {
  const [registry, submitPrompt, { run }] = await Promise.all([
    loadPublishedRegistry(),
    loadSubmitPrompt(),
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
      submitPrompt={submitPrompt}
    />
  );
}
