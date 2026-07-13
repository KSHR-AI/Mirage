"use client";

import { BlockAssetModel, BLOCK_HYDRANT } from "../blocks";
import type { StreetProp } from "./types";

const MISSION_HYDRANTS: readonly StreetProp[] = Object.freeze([
  {
    color: "#8f2e28",
    id: "licensed-hydrant-boost",
    kind: "hydrant",
    position: [62.3, 0.32, 52],
    rotationY: -0.4,
  },
  {
    color: "#8f2e28",
    id: "licensed-hydrant-keyholder",
    kind: "hydrant",
    position: [62, 0.32, 34.3],
    rotationY: 0.7,
  },
  {
    color: "#8f2e28",
    id: "licensed-hydrant-vault",
    kind: "hydrant",
    position: [21.7, 0.32, -34.3],
    rotationY: -1.1,
  },
  {
    color: "#8f2e28",
    id: "licensed-hydrant-blackout",
    kind: "hydrant",
    position: [-62.3, 0.32, -34.3],
    rotationY: 0.2,
  },
  {
    color: "#8f2e28",
    id: "licensed-hydrant-bridge",
    kind: "hydrant",
    position: [6.3, 0.32, -92],
    rotationY: 1.3,
  },
]);

export function BlockHydrants({ limit }: { readonly limit: number }) {
  const hydrants = MISSION_HYDRANTS.slice(0, limit);

  return (
    <group name="block-hydrants">
      {hydrants.map((hydrant) => (
        <BlockAssetModel
          asset={BLOCK_HYDRANT}
          castShadow={false}
          key={hydrant.id}
          position={hydrant.position}
          receiveShadow
          rotation={[0, hydrant.rotationY, 0]}
          scale={0.82}
        />
      ))}
    </group>
  );
}
