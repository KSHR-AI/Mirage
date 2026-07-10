"use client";

import { memo, useMemo } from "react";
import { InstancedPrimitives } from "./InstancedPrimitives";
import type { BoxInstance, CityLayout } from "./types";

type CityArchitectureProps = {
  layout: CityLayout;
  shadows: boolean;
};

export const CityArchitecture = memo(function CityArchitecture({
  layout,
  shadows,
}: CityArchitectureProps) {
  const plinths = useMemo<BoxInstance[]>(
    () =>
      layout.buildings.map((building) => ({
        color: building.district === "painted-row" ? "#29383a" : "#17272d",
        id: `${building.id}-plinth`,
        position: [building.position[0], 0.88, building.position[2]],
        rotationY: building.rotationY,
        scale: [building.scale[0] * 1.035, 1.12, building.scale[2] * 1.035],
      })),
    [layout.buildings],
  );

  const cornices = useMemo<BoxInstance[]>(
    () =>
      layout.buildings.map((building) => ({
        color: building.district === "afterlight" ? "#63747a" : "#454e4d",
        id: `${building.id}-cornice`,
        position: [
          building.position[0],
          building.position[1] + building.scale[1] / 2 - 0.36,
          building.position[2],
        ],
        rotationY: building.rotationY,
        scale: [building.scale[0] * 1.035, 0.32, building.scale[2] * 1.035],
      })),
    [layout.buildings],
  );

  return (
    <group name="procedural-city-architecture">
      <InstancedPrimitives
        castShadow={shadows}
        instances={layout.buildings}
        metalness={0.08}
        receiveShadow
        roughness={0.72}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={plinths}
        metalness={0.14}
        receiveShadow
        roughness={0.64}
      />
      <InstancedPrimitives
        instances={cornices}
        metalness={0.2}
        roughness={0.58}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={layout.roofDetails}
        metalness={0.32}
        roughness={0.57}
      />
      <InstancedPrimitives
        depthWrite={false}
        instances={layout.windows}
        material="basic"
        opacity={0.86}
        toneMapped={false}
        transparent
      />
      <InstancedPrimitives
        depthWrite={false}
        instances={layout.neonSigns}
        material="basic"
        opacity={0.92}
        toneMapped={false}
        transparent
      />
    </group>
  );
});
