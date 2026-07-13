"use client";

import type { ModelGroupProps } from "../models/types";
import {
  visibleBlockParts,
  type BlockAssetDefinition,
  type BlockAssetQuality,
  type BlockShape,
} from "./block-asset";
import { BLOCK_MATERIALS } from "./block-materials";

export type BlockAssetModelProps = ModelGroupProps & {
  readonly asset: BlockAssetDefinition;
  readonly castShadow?: boolean;
  readonly quality?: BlockAssetQuality;
  readonly receiveShadow?: boolean;
};

function BlockGeometry({ shape }: { readonly shape: BlockShape }) {
  if (shape === "box") return <boxGeometry />;
  if (shape === "cone") return <coneGeometry args={[0.5, 1, 7]} />;
  if (shape === "cylinder") {
    return <cylinderGeometry args={[0.5, 0.5, 1, 8]} />;
  }
  if (shape === "icosahedron") return <icosahedronGeometry args={[0.5, 1]} />;
  if (shape === "plane") return <planeGeometry />;
  return <sphereGeometry args={[0.5, 10, 7]} />;
}

export function BlockAssetModel({
  asset,
  castShadow = true,
  quality = "desktop",
  receiveShadow = true,
  ...groupProps
}: BlockAssetModelProps) {
  return (
    <group {...groupProps} name={`block-asset-${asset.id}`}>
      {visibleBlockParts(asset, quality).map((part) => {
        const material = BLOCK_MATERIALS[part.material];
        return (
          <mesh
            castShadow={castShadow}
            key={part.id}
            name={`${asset.id}-${part.id}`}
            position={part.position}
            receiveShadow={receiveShadow}
            rotation={part.rotation ?? [0, 0, 0]}
            scale={part.scale}
          >
            <BlockGeometry shape={part.shape} />
            <meshStandardMaterial
              color={material.color}
              emissive={material.emissive}
              emissiveIntensity={material.emissiveIntensity}
              metalness={material.metalness}
              opacity={material.opacity}
              roughness={material.roughness}
              transparent={
                material.opacity !== undefined && material.opacity < 1
              }
            />
          </mesh>
        );
      })}
    </group>
  );
}
