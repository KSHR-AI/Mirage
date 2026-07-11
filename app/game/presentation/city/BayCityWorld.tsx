"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { ModelAssetBoundary } from "../models/ModelAssetBoundary";
import { AuthoredDowntownBuildings } from "./AuthoredDowntownBuildings";
import { CityArchitecture } from "./CityArchitecture";
import { CityAtmosphere } from "./CityAtmosphere";
import { CityLandmarks } from "./CityLandmarks";
import { CityStreetDetails } from "./CityStreetDetails";
import { CitySurface } from "./CitySurface";
import { replaceProceduralDowntownBlocks } from "./authored-downtown-layout";
import { createBayCityLayout } from "./city-layout";
import { createPoweredCityPowerState, type CityPowerState } from "./power";
import type {
  CityLayout,
  CityMissionZoneId,
  CityQuality,
  CityVec3,
} from "./types";

export type BayCityWorldProps = {
  activeZone?: CityMissionZoneId | null;
  layout?: CityLayout;
  missionProgress?: number;
  powerState?: CityPowerState;
  position?: CityVec3;
  quality?: CityQuality;
  reducedMotion?: boolean;
  rotationY?: number;
  seed?: number | string;
  shadows?: boolean;
  visible?: boolean;
};

export const BayCityWorld = memo(function BayCityWorld({
  activeZone = null,
  layout,
  missionProgress = 0,
  powerState,
  position = [0, 0, 0],
  quality = "desktop",
  reducedMotion = false,
  rotationY = 0,
  seed = "mirage-afterlight-2407",
  shadows,
  visible = true,
}: BayCityWorldProps) {
  const [authoredDowntownReady, setAuthoredDowntownReady] = useState(false);
  const markAuthoredDowntownReady = useCallback(
    () => setAuthoredDowntownReady(true),
    [],
  );
  const resolvedLayout = useMemo(
    () => layout ?? createBayCityLayout({ quality, seed }),
    [layout, quality, seed],
  );
  const resolvedQuality = resolvedLayout.quality;
  const resolvedShadows = shadows ?? resolvedQuality === "desktop";
  const resolvedStaticShadows =
    resolvedShadows && resolvedQuality === "desktop";
  const useAuthoredDowntown = authoredDowntownReady;
  const resolvedPowerState = useMemo(
    () =>
      powerState ??
      createPoweredCityPowerState(resolvedLayout.seed, 0, reducedMotion),
    [powerState, reducedMotion, resolvedLayout.seed],
  );
  const presentationLayout = useMemo(
    () =>
      useAuthoredDowntown
        ? replaceProceduralDowntownBlocks(resolvedLayout)
        : resolvedLayout,
    [resolvedLayout, useAuthoredDowntown],
  );

  return (
    <>
      <CityAtmosphere
        quality={resolvedQuality}
        seed={resolvedLayout.seed}
        shadows={resolvedShadows}
      />
      <group
        name="mirage-bay-city-world"
        position={position}
        rotation={[0, rotationY, 0]}
        visible={visible}
      >
        <CitySurface
          layout={presentationLayout}
          reducedMotion={reducedMotion}
        />
        <CityArchitecture
          layout={presentationLayout}
          powerState={resolvedPowerState}
          shadows={resolvedStaticShadows}
        />
        <ModelAssetBoundary fallback={null}>
          <AuthoredDowntownBuildings
            onReady={markAuthoredDowntownReady}
            powerState={resolvedPowerState}
            shadows={resolvedStaticShadows}
          />
        </ModelAssetBoundary>
        <CityLandmarks
          activeZone={activeZone}
          missionProgress={missionProgress}
          powerState={resolvedPowerState}
          quality={resolvedQuality}
          reducedMotion={reducedMotion}
          shadows={resolvedStaticShadows}
        />
        <CityStreetDetails
          layout={presentationLayout}
          powerState={resolvedPowerState}
        />
      </group>
    </>
  );
});
