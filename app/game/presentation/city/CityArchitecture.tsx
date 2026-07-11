"use client";

import { useTexture } from "@react-three/drei";
import { memo, useEffect, useMemo } from "react";
import { InstancedPrimitives } from "./InstancedPrimitives";
import { filterPoweredCityFeatures, type CityPowerState } from "./power";
import {
  createPbrTextureSet,
  disposePbrTextureSet,
  facadeTextureTier,
  liftFacadeColor,
  type FacadeTextureTier,
} from "./surface-textures";
import type { BoxInstance, BuildingInstance, CityLayout } from "./types";

type CityArchitectureProps = {
  layout: CityLayout;
  powerState: CityPowerState;
  shadows: boolean;
};

const CONCRETE_TEXTURE_ROOT = "/game-assets/textures/concrete-wall-007";
const FACADE_TIERS = ["low", "mid", "tower"] as const;

export const CityArchitecture = memo(function CityArchitecture({
  layout,
  powerState,
  shadows,
}: CityArchitectureProps) {
  const concrete = useTexture({
    arm: `${CONCRETE_TEXTURE_ROOT}/arm.jpg`,
    color: `${CONCRETE_TEXTURE_ROOT}/base-color.jpg`,
    normal: `${CONCRETE_TEXTURE_ROOT}/normal-gl.jpg`,
  });
  const facadeTextures = useMemo(() => {
    const sources = [concrete.color, concrete.normal, concrete.arm] as const;
    return {
      low: createPbrTextureSet(sources, [2, 2]),
      mid: createPbrTextureSet(sources, [2.5, 4]),
      tower: createPbrTextureSet(sources, [3, 6]),
    };
  }, [concrete.arm, concrete.color, concrete.normal]);
  useEffect(
    () => () => {
      FACADE_TIERS.forEach((tier) =>
        disposePbrTextureSet(facadeTextures[tier]),
      );
    },
    [facadeTextures],
  );
  const facadeBatches = useMemo(() => {
    const batches: Record<FacadeTextureTier, BuildingInstance[]> = {
      low: [],
      mid: [],
      tower: [],
    };
    layout.buildings.forEach((building) => {
      batches[facadeTextureTier(building.scale[1])].push({
        ...building,
        color: liftFacadeColor(building.color),
      });
    });
    return batches;
  }, [layout.buildings]);
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
  const poweredWindows = useMemo(
    () => filterPoweredCityFeatures(layout.windows, powerState),
    [layout.windows, powerState],
  );
  const poweredNeonSigns = useMemo(
    () => filterPoweredCityFeatures(layout.neonSigns, powerState),
    [layout.neonSigns, powerState],
  );

  return (
    <group
      name="procedural-city-architecture"
      userData={{ cameraCollisionRoot: true }}
    >
      {layout.quality === "desktop" ? (
        FACADE_TIERS.map((tier) => (
          <InstancedPrimitives
            castShadow={shadows}
            instances={facadeBatches[tier]}
            key={tier}
            map={facadeTextures[tier].map}
            metalness={0.05}
            normalMap={facadeTextures[tier].normalMap}
            normalScale={[0.42, 0.42]}
            receiveShadow
            roughness={0.9}
            roughnessMap={facadeTextures[tier].armMap}
          />
        ))
      ) : (
        <InstancedPrimitives
          instances={layout.buildings}
          metalness={0.08}
          receiveShadow
          roughness={0.72}
        />
      )}
      <InstancedPrimitives
        castShadow={shadows}
        instances={plinths}
        map={layout.quality === "desktop" ? facadeTextures.low.map : undefined}
        metalness={0.14}
        normalMap={
          layout.quality === "desktop"
            ? facadeTextures.low.normalMap
            : undefined
        }
        normalScale={[0.34, 0.34]}
        receiveShadow
        roughness={0.86}
        roughnessMap={
          layout.quality === "desktop" ? facadeTextures.low.armMap : undefined
        }
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
        instances={poweredWindows}
        material="basic"
        opacity={0.86}
        toneMapped={false}
        transparent
      />
      <InstancedPrimitives
        depthWrite={false}
        instances={poweredNeonSigns}
        material="basic"
        opacity={0.92}
        toneMapped={false}
        transparent
      />
    </group>
  );
});
