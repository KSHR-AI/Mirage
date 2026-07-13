"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { BlockRouteDetails } from "./BlockRouteDetails";
import { CityArchitecture } from "./CityArchitecture";
import { CityAtmosphere } from "./CityAtmosphere";
import { CityLandmarks } from "./CityLandmarks";
import { CityStreetDetails } from "./CityStreetDetails";
import { CitySurface } from "./CitySurface";
import { SignatureCornerBuilding } from "./SignatureCornerBuilding";
import { createAuthoredRoutePlan } from "./authored-route-layout";
import { createBayCityLayout } from "./city-layout";
import { createPoweredCityPowerState, type CityPowerState } from "./power";
import {
  findSignatureCornerBuilding,
  replaceSignatureCornerBuilding,
} from "./signature-corner-layout";
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
  const [authoredRouteReady, setAuthoredRouteReady] = useState(false);
  const markAuthoredRouteReady = useCallback(
    () => setAuthoredRouteReady(true),
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
  const signatureCornerBuilding = useMemo(
    () => findSignatureCornerBuilding(resolvedLayout),
    [resolvedLayout],
  );
  const layoutWithoutSignatureCorner = useMemo(
    () => replaceSignatureCornerBuilding(resolvedLayout),
    [resolvedLayout],
  );
  const resolvedPowerState = useMemo(
    () =>
      powerState ??
      createPoweredCityPowerState(resolvedLayout.seed, 0, reducedMotion),
    [powerState, reducedMotion, resolvedLayout.seed],
  );
  const presentationLayout = layoutWithoutSignatureCorner;
  const authoredRoutePlan = useMemo(
    () => createAuthoredRoutePlan(presentationLayout),
    [presentationLayout],
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
        {signatureCornerBuilding ? (
          <SignatureCornerBuilding
            building={signatureCornerBuilding}
            quality={resolvedQuality}
            shadows={resolvedStaticShadows}
          />
        ) : null}
        <BlockRouteDetails
          onReady={markAuthoredRouteReady}
          plan={authoredRoutePlan}
          quality={resolvedQuality}
          shadows={resolvedStaticShadows}
        />
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
          licensedPropIds={
            authoredRouteReady ? authoredRoutePlan.licensedPropIds : []
          }
          licensedStreetlightIds={
            authoredRouteReady ? authoredRoutePlan.licensedStreetlightIds : []
          }
          powerState={resolvedPowerState}
          suppressedPropIds={
            authoredRouteReady ? authoredRoutePlan.suppressedPropIds : []
          }
        />
      </group>
    </>
  );
});
