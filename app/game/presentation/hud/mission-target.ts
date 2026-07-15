import { getAfterlightObjectivePrompt } from "../../content";
import { AFTERLIGHT_OBJECTIVE_IDS } from "../../missions/afterlight-job";
import type { AfterlightMissionDefinition } from "../../missions/afterlight-contracts";
import {
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_LANDMARKS,
} from "../../core/afterlight-state";
import type { GameState, Vec3 } from "../../core/contracts";

export interface AfterlightMissionTarget {
  readonly label: string;
  readonly objectiveId: string;
  readonly position: Vec3;
}

function distanceSquaredXZ(left: Vec3, right: Vec3): number {
  const x = left[0] - right[0];
  const z = left[2] - right[2];
  return x * x + z * z;
}

function activePosition(state: GameState): Vec3 {
  const hero = state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
  const player = state.actors.get(state.playerId);
  return hero?.occupiedBy === state.playerId
    ? hero.pose.position
    : (player?.pose.position ?? AFTERLIGHT_LANDMARKS.boostYard);
}

function nearestLivingKeyholderGuard(state: GameState): Vec3 | undefined {
  const origin = activePosition(state);
  return [
    AFTERLIGHT_ENTITY_IDS.keyholderGuardA,
    AFTERLIGHT_ENTITY_IDS.keyholderGuardB,
  ]
    .map((id) => state.actors.get(id))
    .filter((actor) => actor?.life === "alive")
    .sort(
      (left, right) =>
        distanceSquaredXZ(left!.pose.position, origin) -
        distanceSquaredXZ(right!.pose.position, origin),
    )[0]?.pose.position;
}

function courierPosition(state: GameState): Vec3 {
  return (
    state.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier)?.pose.position ??
    AFTERLIGHT_LANDMARKS.courierRouteStart
  );
}

function credentialPosition(state: GameState): Vec3 {
  const courier = courierPosition(state);
  return [courier[0] + 2.6, courier[1] + 0.1, courier[2] + 0.8];
}

function positionForObjective(state: GameState, objectiveId: string): Vec3 {
  switch (objectiveId) {
    case AFTERLIGHT_OBJECTIVE_IDS.deliverCoupe:
      return AFTERLIGHT_LANDMARKS.hotRideDrop;
    case AFTERLIGHT_OBJECTIVE_IDS.stealCoupe:
      return AFTERLIGHT_LANDMARKS.boostYard;
    case AFTERLIGHT_OBJECTIVE_IDS.learnDriving:
    case AFTERLIGHT_OBJECTIVE_IDS.reachMission:
      return AFTERLIGHT_LANDMARKS.missionIntercept;
    case AFTERLIGHT_OBJECTIVE_IDS.disableCourier:
      return courierPosition(state);
    case AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards:
      return nearestLivingKeyholderGuard(state) ?? credentialPosition(state);
    case AFTERLIGHT_OBJECTIVE_IDS.takeVaultCredential:
      return credentialPosition(state);
    case AFTERLIGHT_OBJECTIVE_IDS.openVault:
      return AFTERLIGHT_LANDMARKS.vaultReader;
    case AFTERLIGHT_OBJECTIVE_IDS.takeAfterlightCore:
      return AFTERLIGHT_LANDMARKS.vaultCore;
    case AFTERLIGHT_OBJECTIVE_IDS.clearVault:
      return AFTERLIGHT_LANDMARKS.vaultExit;
    case AFTERLIGHT_OBJECTIVE_IDS.primeBlackout:
    case AFTERLIGHT_OBJECTIVE_IDS.holdBlackout:
      return AFTERLIGHT_LANDMARKS.substationControl;
    case AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun:
      return AFTERLIGHT_LANDMARKS.bridgeLaunch;
    case AFTERLIGHT_OBJECTIVE_IDS.escapeAfterlightRun:
      return AFTERLIGHT_LANDMARKS.bridgeEscape;
    case AFTERLIGHT_OBJECTIVE_IDS.reachDebrief:
    case AFTERLIGHT_OBJECTIVE_IDS.deliverAfterlightCore:
      return AFTERLIGHT_LANDMARKS.safehouse;
    default:
      return AFTERLIGHT_LANDMARKS.boostYard;
  }
}

export function resolveAfterlightMissionTarget(
  state: GameState,
  definition: AfterlightMissionDefinition,
): AfterlightMissionTarget {
  const phase =
    definition.phases[state.mission.phaseIndex] ?? definition.phases[0];
  const completed = new Set(state.mission.completedObjectiveIds);
  const objective = phase.objectives.find(
    (candidate) => !candidate.optional && !completed.has(candidate.id),
  );
  const objectiveId = objective?.id ?? AFTERLIGHT_OBJECTIVE_IDS.stealCoupe;
  const prompt = getAfterlightObjectivePrompt(
    objectiveId as Parameters<typeof getAfterlightObjectivePrompt>[0],
  );

  return {
    objectiveId,
    label:
      objectiveId === AFTERLIGHT_OBJECTIVE_IDS.deliverCoupe
        ? (objective?.label ?? phase.chapter)
        : (prompt?.text ?? objective?.label ?? phase.chapter),
    position: positionForObjective(state, objectiveId),
  };
}
