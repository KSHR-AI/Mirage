import { FoglinePursuit } from "../../runs/fogline-pursuit/FoglinePursuit";

export default async function FoglinePursuitPage({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string | string[] }>;
}) {
  const { embed } = await searchParams;
  return <FoglinePursuit autoStart={embed === "gallery"} />;
}
