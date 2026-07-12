"use client";

import { useTexture } from "@react-three/drei";
import { memo, useEffect, useMemo } from "react";
import {
  createFacadeDetailPlan,
  createPoweredFacadeGlazing,
} from "./facade-details";
import { InstancedPrimitives } from "./InstancedPrimitives";
import { filterPoweredCityFeatures, type CityPowerState } from "./power";
import {
  createColorTexture,
  createPbrTextureSet,
  disposePbrTextureSet,
  liftFacadeColor,
} from "./surface-textures";
import type { BoxInstance, CityLayout } from "./types";

type CityArchitectureProps = {
  layout: CityLayout;
  powerState: CityPowerState;
  shadows: boolean;
};

const CONCRETE_TEXTURE_ROOT = "/game-assets/textures/concrete-wall-007";
const CORRUGATED_TEXTURE_ROOT = "/game-assets/textures/corrugated-iron-02";

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
  const corrugatedColor = useTexture(
    `${CORRUGATED_TEXTURE_ROOT}/base-color.jpg`,
  );
  const facadeTextures = useMemo(() => {
    const concreteSources = [
      concrete.color,
      concrete.normal,
      concrete.arm,
    ] as const;
    return {
      concreteLow: createPbrTextureSet(concreteSources, [2, 2]),
      concreteMid: createPbrTextureSet(concreteSources, [2.5, 4]),
      corrugated: createColorTexture(corrugatedColor, [3, 7]),
    };
  }, [concrete.arm, concrete.color, concrete.normal, corrugatedColor]);
  useEffect(
    () => () => {
      disposePbrTextureSet(facadeTextures.concreteLow);
      disposePbrTextureSet(facadeTextures.concreteMid);
      facadeTextures.corrugated.dispose();
    },
    [facadeTextures],
  );
  const facadeInstances = useMemo(() => {
    const prepared = layout.buildings.map((building) => ({
      ...building,
      color: liftFacadeColor(building.color),
    }));
    return {
      industrial: prepared.filter(
        (building) => building.district === "industrial",
      ),
      masonry: prepared.filter(
        (building) => building.district !== "industrial",
      ),
    };
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
  const facadeDetails = useMemo(
    () =>
      createFacadeDetailPlan({
        buildings: layout.buildings,
        quality: layout.quality,
        windows: layout.windows,
      }),
    [layout.buildings, layout.quality, layout.windows],
  );
  const poweredFacadeGlazing = useMemo(
    () => createPoweredFacadeGlazing(facadeDetails.glazing, poweredWindows),
    [facadeDetails.glazing, poweredWindows],
  );

  return (
    <group name="procedural-city-architecture">
      <group
        name="procedural-city-camera-collision"
        userData={{ cameraCollisionRoot: true }}
      >
        {layout.quality === "desktop" ? (
          <>
            <InstancedPrimitives
              castShadow={shadows}
              instances={facadeInstances.masonry}
              map={facadeTextures.concreteMid.map}
              metalness={0.03}
              receiveShadow
              roughness={0.9}
            />
            <InstancedPrimitives
              castShadow={shadows}
              instances={facadeInstances.industrial}
              map={facadeTextures.corrugated}
              metalness={0.2}
              receiveShadow
              roughness={0.7}
            />
          </>
        ) : (
          <InstancedPrimitives
            instances={layout.buildings}
            metalness={0.08}
            receiveShadow
            roughness={0.72}
          />
        )}
      </group>
      <group
        name="procedural-city-facade-detail"
        userData={{ cameraCollision: false }}
      >
        <InstancedPrimitives
          instances={facadeDetails.glazing}
          material="basic"
          shape="plane"
        />
        <InstancedPrimitives
          instances={facadeDetails.frames}
          material="basic"
          shape="plane"
        />
        <InstancedPrimitives
          instances={facadeDetails.structure}
          material="basic"
        />
        <InstancedPrimitives
          castShadow={shadows}
          instances={plinths}
          map={
            layout.quality === "desktop"
              ? facadeTextures.concreteLow.map
              : undefined
          }
          metalness={0.14}
          receiveShadow
          roughness={0.86}
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
          instances={poweredFacadeGlazing}
          material="basic"
          opacity={0.5}
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
    </group>
  );
});
