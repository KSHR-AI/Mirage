import type { Metadata } from "next";

import { AssetLab } from "./AssetLab";

export const metadata: Metadata = {
  title: "Mirage Block Asset Lab",
  description: "Deterministic visual inspection for Mirage procedural assets.",
};

export default function AssetLabPage() {
  return <AssetLab />;
}
