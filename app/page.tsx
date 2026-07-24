import { HotDrop } from "./game/HotDrop";
import { HotDrop3D } from "./game3d/HotDrop3D";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { mode } = await searchParams;
  return mode === "2d" ? <HotDrop /> : <HotDrop3D />;
}
