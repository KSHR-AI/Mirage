import { DemoGallery } from "./gallery/DemoGallery";
import { HotDrop } from "./game/HotDrop";
import { HotDrop3D } from "./game3d/HotDrop3D";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { mode } = await searchParams;

  // Preserve the original direct-game URLs while the gallery is the default.
  if (mode === "2d") return <HotDrop />;
  if (mode === "game" || mode === "3d") return <HotDrop3D />;

  return <DemoGallery />;
}
