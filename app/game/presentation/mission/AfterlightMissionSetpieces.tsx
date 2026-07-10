"use client";

import { memo, useMemo } from "react";
import { createAfterlightSetpiecePlan } from "./plan";
import { MissionInteractionCues } from "./InteractionCues";
import { SetpieceLights } from "./SetpieceLights";
import {
  BlackoutMissionSetpiece,
  BoostYardSetpiece,
  BridgePursuitSetpiece,
  CourierEncounterSetpiece,
  MarinSafehouseSetpiece,
  VaultMissionSetpiece,
} from "./SetpieceModels";
import type {
  AfterlightMissionSetpiecePlan,
  AfterlightMissionSetpiecesProps,
} from "./types";

function SetpieceModel({
  plan,
}: {
  readonly plan: AfterlightMissionSetpiecePlan;
}) {
  switch (plan.kind) {
    case "boost":
      return <BoostYardSetpiece plan={plan} />;
    case "courier":
      return <CourierEncounterSetpiece plan={plan} />;
    case "vault":
      return <VaultMissionSetpiece plan={plan} />;
    case "blackout":
      return <BlackoutMissionSetpiece plan={plan} />;
    case "pursuit":
      return <BridgePursuitSetpiece plan={plan} />;
    case "safehouse":
      return <MarinSafehouseSetpiece plan={plan} />;
    case "none":
      return null;
  }
}

export const AfterlightMissionSetpieces = memo(
  function AfterlightMissionSetpieces({
    blackout,
    completedObjectiveIds,
    encounterVariant,
    inventory,
    phaseId,
    quality,
    reducedMotion,
    visible = true,
  }: AfterlightMissionSetpiecesProps) {
    const plan = useMemo(
      () =>
        createAfterlightSetpiecePlan({
          blackout,
          completedObjectiveIds,
          encounterVariant,
          inventory,
          phaseId,
          quality,
          reducedMotion,
        }),
      [
        blackout,
        completedObjectiveIds,
        encounterVariant,
        inventory,
        phaseId,
        quality,
        reducedMotion,
      ],
    );

    if (!visible || plan.kind === "none") return null;

    return (
      <group
        name={`afterlight-mission-setpieces-${plan.phaseId}`}
        userData={{
          encounterVariant: plan.encounter.id,
          estimatedDrawCalls: plan.estimatedDrawCalls,
          phaseId: plan.phaseId,
        }}
      >
        <SetpieceModel plan={plan} />
        <MissionInteractionCues
          cues={plan.cues}
          reducedMotion={plan.reducedMotion}
        />
        <SetpieceLights lights={plan.lights} />
      </group>
    );
  },
);
