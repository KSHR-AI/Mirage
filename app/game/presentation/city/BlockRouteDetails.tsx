"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";

import { InstancedPrimitives } from "./InstancedPrimitives";
import type { AuthoredRoutePlan } from "./authored-route-layout";
import { createBlockRouteAssetPlan } from "./block-route-assets";
import { shouldShowRouteStreetLife } from "./route-street-life";
import type { CityQuality } from "./types";

export function BlockRouteDetails({
  onReady,
  plan,
  quality,
  shadows,
}: {
  readonly onReady?: () => void;
  readonly plan: AuthoredRoutePlan;
  readonly quality: CityQuality;
  readonly shadows: boolean;
}) {
  const closeDetailRef = useRef<Group>(null);
  const assets = useMemo(() => createBlockRouteAssetPlan(plan), [plan]);
  const mobileCoreOpaque = useMemo(
    () => [
      ...assets.facadeWalls,
      ...assets.facadeDoors,
      ...assets.facadeTrim,
      ...assets.streetlightPoles,
      ...assets.streetlightArms,
      ...assets.streetlightHeads,
      ...assets.binBodies,
      ...assets.binLids,
      ...assets.barrierBodies,
    ],
    [assets],
  );
  const mobileCloseOpaque = useMemo(
    () => [
      ...plan.curbFaces,
      ...plan.sidewalkSeams,
      ...plan.surfacePatches,
      ...plan.manholes,
      ...plan.drains,
      ...plan.drainSlats,
      ...plan.storefrontFrames,
      ...plan.storefrontArchitecture,
      ...plan.storefrontBackdrops,
      ...plan.storefrontDisplays,
      ...plan.awnings,
      ...plan.signFrames,
      ...plan.parkingMeterPoles,
      ...plan.parkingMeterHeads,
      ...plan.bollards,
      ...plan.benchFrames,
      ...plan.benchSlats,
      ...plan.planterPots,
      ...plan.planterCrowns,
      ...plan.utilityCabinets,
      ...plan.utilityPanels,
    ],
    [plan],
  );
  const mobileCloseSignals = useMemo(
    () => [
      ...plan.curbPaint,
      ...plan.storefrontLightPanels,
      ...plan.signs,
      ...plan.signGlyphs,
    ],
    [plan],
  );

  useEffect(() => onReady?.(), [onReady]);
  useFrame(({ camera }) => {
    const detail = closeDetailRef.current;
    if (!detail) return;
    const visible = shouldShowRouteStreetLife(
      camera.position.x,
      camera.position.z,
    );
    if (detail.visible !== visible) detail.visible = visible;
  });

  if (quality === "mobile") {
    return (
      <group name="block-route-details" userData={{ cameraCollision: false }}>
        <InstancedPrimitives
          instances={mobileCoreOpaque}
          metalness={0.18}
          receiveShadow
          roughness={0.66}
        />
        <InstancedPrimitives
          instances={assets.facadeGlass}
          metalness={0.12}
          opacity={0.68}
          roughness={0.2}
          transparent
        />
        <InstancedPrimitives
          instances={assets.barrierStripes}
          material="basic"
          toneMapped={false}
        />
        <group
          name="block-route-corridor-finish"
          ref={closeDetailRef}
          visible={false}
        >
          <InstancedPrimitives
            instances={mobileCloseOpaque}
            metalness={0.12}
            receiveShadow
            roughness={0.7}
          />
          <InstancedPrimitives
            instances={mobileCloseSignals}
            material="basic"
            toneMapped={false}
          />
          <InstancedPrimitives
            depthWrite={false}
            instances={plan.storefrontGlass}
            material="basic"
            opacity={0.28}
            toneMapped={false}
            transparent
          />
        </group>
      </group>
    );
  }

  return (
    <group name="block-route-details" userData={{ cameraCollision: false }}>
      <InstancedPrimitives
        castShadow={shadows}
        instances={assets.facadeWalls}
        receiveShadow
        roughness={0.82}
      />
      <InstancedPrimitives
        instances={assets.facadeGlass}
        metalness={0.16}
        opacity={0.72}
        roughness={0.18}
        transparent
      />
      <InstancedPrimitives
        instances={assets.facadeDoors}
        metalness={0.35}
        roughness={0.48}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={assets.facadeTrim}
        receiveShadow
        roughness={0.6}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={assets.escapePlatforms}
        metalness={0.72}
        receiveShadow
        roughness={0.36}
      />
      <InstancedPrimitives
        instances={assets.escapeRails}
        metalness={0.78}
        roughness={0.3}
      />
      <InstancedPrimitives
        instances={assets.streetlightPoles}
        metalness={0.7}
        roughness={0.38}
      />
      <InstancedPrimitives
        instances={assets.streetlightArms}
        metalness={0.7}
        roughness={0.38}
      />
      <InstancedPrimitives
        instances={assets.streetlightHeads}
        metalness={0.34}
        roughness={0.42}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={assets.binBodies}
        receiveShadow
        roughness={0.7}
      />
      <InstancedPrimitives
        instances={assets.binLids}
        metalness={0.3}
        roughness={0.56}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={assets.barrierBodies}
        receiveShadow
        roughness={0.86}
      />
      <InstancedPrimitives
        instances={assets.barrierStripes}
        material="basic"
        toneMapped={false}
      />

      <group
        name="block-route-corridor-finish"
        ref={closeDetailRef}
        visible={false}
      >
        <InstancedPrimitives
          instances={plan.curbFaces}
          metalness={0.08}
          receiveShadow
          roughness={0.78}
        />
        <InstancedPrimitives instances={plan.sidewalkSeams} material="basic" />
        <InstancedPrimitives
          instances={plan.surfacePatches}
          metalness={0.08}
          receiveShadow
          roughness={0.68}
        />
        <InstancedPrimitives
          instances={plan.manholes}
          metalness={0.78}
          receiveShadow
          roughness={0.34}
          shape="cylinder"
        />
        <InstancedPrimitives
          instances={plan.drains}
          metalness={0.72}
          receiveShadow
          roughness={0.28}
        />
        <InstancedPrimitives
          instances={plan.drainSlats}
          metalness={0.9}
          receiveShadow
          roughness={0.2}
        />
        <InstancedPrimitives
          instances={plan.curbPaint}
          material="basic"
          toneMapped={false}
        />
        <InstancedPrimitives
          castShadow={shadows}
          instances={plan.storefrontFrames}
          metalness={0.38}
          receiveShadow
          roughness={0.42}
        />
        <InstancedPrimitives
          instances={plan.storefrontArchitecture}
          metalness={0.06}
          receiveShadow
          roughness={0.78}
        />
        <InstancedPrimitives
          emissive="#6c4a3c"
          emissiveIntensity={0.28}
          instances={plan.storefrontBackdrops}
          roughness={0.72}
        />
        <InstancedPrimitives
          instances={plan.storefrontDisplays}
          material="basic"
        />
        <InstancedPrimitives
          fog={false}
          instances={plan.storefrontLightPanels}
          material="basic"
          toneMapped={false}
        />
        <InstancedPrimitives
          depthWrite={false}
          instances={plan.storefrontGlass}
          material="basic"
          opacity={0.28}
          toneMapped={false}
          transparent
        />
        <InstancedPrimitives
          castShadow={shadows}
          instances={plan.awnings}
          metalness={0.2}
          receiveShadow
          roughness={0.5}
        />
        <InstancedPrimitives
          instances={plan.signFrames}
          metalness={0.42}
          roughness={0.34}
        />
        <InstancedPrimitives
          instances={plan.signs}
          material="basic"
          toneMapped={false}
        />
        <InstancedPrimitives
          fog={false}
          instances={plan.signGlyphs}
          material="basic"
          toneMapped={false}
        />
        <InstancedPrimitives
          instances={plan.parkingMeterPoles}
          metalness={0.68}
          roughness={0.4}
          shape="cylinder"
        />
        <InstancedPrimitives
          instances={plan.parkingMeterHeads}
          metalness={0.55}
          roughness={0.38}
        />
        <InstancedPrimitives
          instances={plan.bollards}
          metalness={0.46}
          receiveShadow
          roughness={0.5}
          shape="cylinder"
        />
        <InstancedPrimitives
          instances={plan.benchFrames}
          metalness={0.62}
          receiveShadow
          roughness={0.46}
        />
        <InstancedPrimitives
          instances={plan.benchSlats}
          receiveShadow
          roughness={0.76}
        />
        <InstancedPrimitives
          instances={plan.planterPots}
          receiveShadow
          roughness={0.82}
          shape="cylinder"
        />
        <InstancedPrimitives
          instances={plan.planterCrowns}
          receiveShadow
          roughness={0.9}
          shape="icosahedron"
        />
        <InstancedPrimitives
          instances={plan.utilityCabinets}
          metalness={0.34}
          receiveShadow
          roughness={0.58}
        />
        <InstancedPrimitives
          instances={plan.utilityPanels}
          metalness={0.65}
          roughness={0.35}
        />
        {plan.practicalLights.map((light) => (
          <pointLight
            color={light.color}
            decay={2}
            distance={light.distance}
            intensity={light.intensity}
            key={light.id}
            position={light.position}
          />
        ))}
      </group>
    </group>
  );
}
