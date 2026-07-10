"use client";

import { memo, useMemo } from "react";
import { CityArchitecture } from "./CityArchitecture";
import { CityAtmosphere } from "./CityAtmosphere";
import { CityLandmarks } from "./CityLandmarks";
import { CityStreetDetails } from "./CityStreetDetails";
import { CitySurface } from "./CitySurface";
import { createBayCityLayout } from "./layout";
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
  position = [0, 0, 0],
  quality = "desktop",
  reducedMotion = false,
  rotationY = 0,
  seed = "mirage-afterlight-2407",
  shadows,
  visible = true,
}: BayCityWorldProps) {
  const resolvedLayout = useMemo(
    () => layout ?? createBayCityLayout({ quality, seed }),
    [layout, quality, seed],
  );
  const resolvedQuality = resolvedLayout.quality;
  const resolvedShadows = shadows ?? resolvedQuality === "desktop";

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
        <CitySurface layout={resolvedLayout} reducedMotion={reducedMotion} />
        <CityArchitecture layout={resolvedLayout} shadows={resolvedShadows} />
        <CityLandmarks
          activeZone={activeZone}
          missionProgress={missionProgress}
          quality={resolvedQuality}
          reducedMotion={reducedMotion}
          shadows={resolvedShadows}
        />
        <CityStreetDetails layout={resolvedLayout} />
      </group>
    </>
  );
});
