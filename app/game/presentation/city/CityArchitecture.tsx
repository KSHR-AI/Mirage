"use client";

import { memo, useMemo } from "react";
import {
  createFacadeDetailPlan,
  createPoweredFacadeGlazing,
} from "./facade-details";
import { InstancedPrimitives } from "./InstancedPrimitives";
import { filterPoweredCityFeatures, type CityPowerState } from "./power";
import { liftFacadeColor } from "./facade-palette";
import type { BoxInstance, CityLayout } from "./types";

type CityArchitectureProps = {
  layout: CityLayout;
  powerState: CityPowerState;
  shadows: boolean;
};

export const CityArchitecture = memo(function CityArchitecture({
  layout,
  powerState,
  shadows,
}: CityArchitectureProps) {
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
  const mobileOpaqueDetails = useMemo(
    () => [
      ...facadeDetails.structure,
      ...plinths,
      ...cornices,
      ...layout.roofDetails,
    ],
    [cornices, facadeDetails.structure, layout.roofDetails, plinths],
  );
  const mobileFacadePanels = useMemo(
    () => [...facadeDetails.glazing, ...facadeDetails.frames],
    [facadeDetails.frames, facadeDetails.glazing],
  );
  const mobilePoweredPanels = useMemo(
    () => [...poweredFacadeGlazing, ...poweredNeonSigns],
    [poweredFacadeGlazing, poweredNeonSigns],
  );

  if (layout.quality === "mobile") {
    return (
      <group name="procedural-city-architecture">
        <group
          name="procedural-city-camera-collision"
          userData={{ cameraCollisionRoot: true }}
        >
          <InstancedPrimitives
            instances={layout.buildings}
            metalness={0.08}
            receiveShadow
            roughness={0.72}
          />
        </group>
        <group
          name="procedural-city-facade-detail"
          userData={{ cameraCollision: false }}
        >
          <InstancedPrimitives
            instances={mobileOpaqueDetails}
            metalness={0.14}
            receiveShadow
            roughness={0.7}
          />
          <InstancedPrimitives
            instances={mobileFacadePanels}
            material="basic"
          />
          <InstancedPrimitives
            depthWrite={false}
            instances={mobilePoweredPanels}
            material="basic"
            opacity={0.72}
            toneMapped={false}
            transparent
          />
        </group>
      </group>
    );
  }

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
              metalness={0.03}
              receiveShadow
              roughness={0.9}
            />
            <InstancedPrimitives
              castShadow={shadows}
              instances={facadeInstances.industrial}
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
