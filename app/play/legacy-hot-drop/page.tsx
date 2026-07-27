import { HotDrop } from "../../game/HotDrop";
import { HotDrop3D } from "../../game3d/HotDrop3D";

export default async function LegacyHotDropPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string | string[];
    embed?: string | string[];
  }>;
}) {
  const { mode, embed } = await searchParams;
  return mode === "2d" ? (
    <HotDrop />
  ) : (
    <HotDrop3D autoStart={embed === "benchmark"} />
  );
}
