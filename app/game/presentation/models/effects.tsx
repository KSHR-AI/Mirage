"use client";

import { getModelGeometryDetail } from "./appearance";
import type { ModelGroupProps, ModelQuality } from "./types";

export interface MuzzleFlashProps extends ModelGroupProps {
  readonly active: boolean;
  readonly quality?: ModelQuality;
  readonly intensity?: number;
  readonly color?: string;
}

export function MuzzleFlash({
  active,
  color = "#ffd46b",
  intensity = 1,
  quality = "desktop",
  ...groupProps
}: MuzzleFlashProps) {
  const detail = getModelGeometryDetail(quality);
  if (!active) return null;
  return (
    <group {...groupProps}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry
          args={[0.11 * intensity, 0.38 * intensity, detail.radialSegments]}
        />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]} scale={[1, 0.32, 1]}>
        <octahedronGeometry args={[0.18 * intensity, 0]} />
        <meshBasicMaterial color="#fff2c2" toneMapped={false} />
      </mesh>
      {quality === "desktop" ? (
        <pointLight
          color={color}
          decay={2}
          distance={3.2}
          intensity={2.4 * intensity}
        />
      ) : null}
    </group>
  );
}
