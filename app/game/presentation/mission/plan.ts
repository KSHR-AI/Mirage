import { AFTERLIGHT_LANDMARKS } from "../../core/afterlight-state";
import type { Vec3 } from "../../core/contracts";
import {
  AFTERLIGHT_ENCOUNTER_VARIANTS,
  AFTERLIGHT_ITEMS,
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
  AFTERLIGHT_TAGS,
  selectAfterlightEncounter,
  type AfterlightEncounterVariant,
} from "../../missions/afterlight-job";
import type { GameQualityTier } from "../../performance";
import type {
  AfterlightMissionSetpiecePlan,
  BlackoutSetpiecePlan,
  BoostSetpiecePlan,
  CourierSetpiecePlan,
  CreateAfterlightSetpiecePlanOptions,
  InteractionCuePlan,
  MissionStringCollection,
  PursuitRoadblockPlan,
  PursuitSetpiecePlan,
  SafehouseSetpiecePlan,
  SetpieceLightPlan,
  SetpieceQualityBudget,
  VaultSetpiecePlan,
} from "./types";
import { HOT_RIDE_CONTRACT_ID } from "../../missions/afterlight-contracts";

export const INTERACTION_COLORS = Object.freeze({
  coral: "#ff6b57",
  lime: "#d8ff62",
  white: "#f5f7f5",
} as const);

export const INTERACTION_MEANINGS = Object.freeze({
  coral: "action-target",
  lime: "interaction-ready",
  white: "route-or-delivery",
} as const);

// These are the authored city-zone anchors. Core mission volumes are being
// migrated centrally; keeping the temporary bridge here prevents visual drift.
export const AFTERLIGHT_SETPIECE_ANCHORS = Object.freeze({
  boostYard: AFTERLIGHT_LANDMARKS.boostYard,
  missionIntercept: AFTERLIGHT_LANDMARKS.missionIntercept,
  courierYard: [70, 0.3, 42] as Vec3,
  vaultReader: [14, 0.3, -42] as Vec3,
  vaultExit: [14, 1.15, -31] as Vec3,
  substationControl: [-70, 0.3, -42] as Vec3,
  bridgeLaunch: [0, 0.3, -114] as Vec3,
  bridgeEscape: [0, 1.15, -218] as Vec3,
  safehouse: [0, 1.15, -232] as Vec3,
});

export const SETPIECE_QUALITY_BUDGETS: Readonly<
  Record<GameQualityTier, SetpieceQualityBudget>
> = Object.freeze({
  low: Object.freeze({
    quality: "low",
    modelQuality: "mobile",
    decorationLevel: 0,
    maxDrawCalls: 46,
    maxLights: 0,
  }),
  medium: Object.freeze({
    quality: "medium",
    modelQuality: "desktop",
    decorationLevel: 1,
    maxDrawCalls: 58,
    maxLights: 1,
  }),
  high: Object.freeze({
    quality: "high",
    modelQuality: "desktop",
    decorationLevel: 2,
    maxDrawCalls: 72,
    maxLights: 2,
  }),
});

const DRAW_CALL_ESTIMATES = Object.freeze({
  boost: [34, 42, 48],
  courier: [38, 48, 56],
  vault: [30, 40, 49],
  blackout: [28, 38, 46],
  pursuit: [22, 30, 38],
  safehouse: [25, 34, 42],
} as const);

const ROADBLOCK_LAYOUTS: Readonly<
  Record<AfterlightEncounterVariant["id"], readonly PursuitRoadblockPlan[]>
> = Object.freeze({
  "embarcadero-switch": Object.freeze([
    roadblock("embarcadero-a", [-3.4, 0.56, -128], 0.08, "west"),
    roadblock("embarcadero-b", [3.4, 0.56, -154], -0.08, "east"),
    roadblock("embarcadero-c", [0, 0.56, -181], 0, "center"),
    roadblock("embarcadero-d", [-3.4, 0.56, -204], 0.08, "west"),
  ]),
  "mission-decoy": Object.freeze([
    roadblock("mission-a", [3.4, 0.56, -130], -0.08, "east"),
    roadblock("mission-b", [-3.4, 0.56, -166], 0.08, "west"),
    roadblock("mission-c", [3.4, 0.56, -201], -0.08, "east"),
  ]),
  "north-beach-transfer": Object.freeze([
    roadblock("north-beach-a", [0, 0.56, -126], 0, "center"),
    roadblock("north-beach-b", [-3.4, 0.56, -146], 0.08, "west"),
    roadblock("north-beach-c", [3.4, 0.56, -166], -0.08, "east"),
    roadblock("north-beach-d", [0, 0.56, -186], 0, "center"),
    roadblock("north-beach-e", [-3.4, 0.56, -206], 0.08, "west"),
  ]),
});

function roadblock(
  id: string,
  position: Vec3,
  rotationY: number,
  blockedLane: PursuitRoadblockPlan["blockedLane"],
): PursuitRoadblockPlan {
  return Object.freeze({ id, position, rotationY, blockedLane });
}

function has(collection: MissionStringCollection, value: string): boolean {
  if ("has" in collection) return collection.has(value);
  return collection.includes(value);
}

function offset(position: Vec3, x: number, y: number, z: number): Vec3 {
  return [position[0] + x, position[1] + y, position[2] + z];
}

function estimate(
  kind: keyof typeof DRAW_CALL_ESTIMATES,
  budget: SetpieceQualityBudget,
  reducedMotion: boolean,
): number {
  const base = DRAW_CALL_ESTIMATES[kind][budget.decorationLevel];
  return Math.max(0, base - (reducedMotion ? 2 : 0));
}

function cue(
  id: string,
  kind: InteractionCuePlan["kind"],
  tone: InteractionCuePlan["tone"],
  position: Vec3,
  radius: number,
  interactionTag?: string,
): InteractionCuePlan {
  return Object.freeze({
    id,
    kind,
    tone,
    position,
    radius,
    ...(interactionTag ? { interactionTag } : {}),
  });
}

function light(
  id: string,
  color: string,
  position: Vec3,
  intensity: number,
  distance: number,
): SetpieceLightPlan {
  return Object.freeze({ id, color, position, intensity, distance });
}

function boundedLights(
  budget: SetpieceQualityBudget,
  candidates: readonly SetpieceLightPlan[],
): readonly SetpieceLightPlan[] {
  return Object.freeze(candidates.slice(0, budget.maxLights));
}

export function resolveAfterlightEncounterVariant(
  encounterVariant:
    | AfterlightEncounterVariant
    | AfterlightEncounterVariant["id"],
): AfterlightEncounterVariant {
  if (typeof encounterVariant !== "string") return encounterVariant;
  return (
    AFTERLIGHT_ENCOUNTER_VARIANTS.find(
      (candidate) => candidate.id === encounterVariant,
    ) ?? selectAfterlightEncounter(0)
  );
}

export function withAfterlightCourierPosition(
  encounter: AfterlightEncounterVariant,
  courierPosition: Vec3 | undefined,
): AfterlightEncounterVariant {
  if (!courierPosition) return encounter;
  return Object.freeze({ ...encounter, courierSpawn: courierPosition });
}

function createBoostPlan(
  options: CreateAfterlightSetpiecePlanOptions,
  encounter: AfterlightEncounterVariant,
  quality: SetpieceQualityBudget,
): BoostSetpiecePlan {
  const hotRide = options.contractId === HOT_RIDE_CONTRACT_ID;
  const stolen = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
  );
  const reachedMission = has(
    options.completedObjectiveIds,
    hotRide
      ? AFTERLIGHT_OBJECTIVE_IDS.deliverCoupe
      : AFTERLIGHT_OBJECTIVE_IDS.reachMission,
  );
  const routeGatePosition = hotRide
    ? AFTERLIGHT_LANDMARKS.hotRideDrop
    : AFTERLIGHT_SETPIECE_ANCHORS.missionIntercept;
  const cues: InteractionCuePlan[] = [];

  if (!stolen && !hotRide) {
    cues.push(
      cue(
        "boost-enter-coupe",
        "interact",
        "lime",
        offset(AFTERLIGHT_SETPIECE_ANCHORS.boostYard, 0, 0.08, 0),
        2.8,
        AFTERLIGHT_TAGS.stealCoupe,
      ),
    );
  } else if (!reachedMission) {
    cues.push(
      cue(
        "boost-reach-mission",
        "destination",
        "white",
        routeGatePosition,
        8.5,
      ),
    );
  }

  return Object.freeze({
    kind: "boost",
    phaseId: options.phaseId,
    anchor: AFTERLIGHT_SETPIECE_ANCHORS.boostYard,
    encounter,
    quality,
    reducedMotion: options.reducedMotion,
    cues: Object.freeze(cues),
    lights: boundedLights(quality, [
      light(
        "boost-yard-worklight",
        INTERACTION_COLORS.white,
        offset(AFTERLIGHT_SETPIECE_ANCHORS.boostYard, -4.5, 5.2, -3.8),
        22,
        16,
      ),
    ]),
    estimatedDrawCalls: estimate("boost", quality, options.reducedMotion),
    heroCoupeVisible: !hotRide && !stolen,
    routeGateVisible: (hotRide || stolen) && !reachedMission,
    routeGatePosition,
  });
}

function createCourierPlan(
  options: CreateAfterlightSetpiecePlanOptions,
  encounter: AfterlightEncounterVariant,
  quality: SetpieceQualityBudget,
): CourierSetpiecePlan {
  const disabled = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
  );
  const guardsDefeated = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards,
  );
  const hasCredential = has(
    options.inventory,
    AFTERLIGHT_ITEMS.vaultCredential,
  );
  const courierPosition = encounter.courierSpawn;
  const cues: InteractionCuePlan[] = [];

  if (!disabled) {
    cues.push(cue("courier-disable", "target", "coral", courierPosition, 4.3));
  } else if (guardsDefeated && !hasCredential) {
    cues.push(
      cue(
        "courier-take-credential",
        "target",
        "lime",
        offset(courierPosition, 2.6, 0.1, 0.8),
        1.5,
      ),
    );
  }

  return Object.freeze({
    kind: "courier",
    phaseId: options.phaseId,
    anchor: AFTERLIGHT_SETPIECE_ANCHORS.courierYard,
    encounter,
    quality,
    reducedMotion: options.reducedMotion,
    cues: Object.freeze(cues),
    lights: boundedLights(quality, [
      light(
        "courier-security-wash",
        disabled ? INTERACTION_COLORS.coral : INTERACTION_COLORS.white,
        offset(courierPosition, -3.8, 4.6, -2.5),
        18,
        14,
      ),
      light(
        "courier-credential-wash",
        INTERACTION_COLORS.lime,
        offset(courierPosition, 2.6, 2.1, 0.8),
        9,
        7,
      ),
    ]),
    estimatedDrawCalls: estimate("courier", quality, options.reducedMotion),
    courierPosition,
    courierDisabled: disabled,
    credentialVisible: disabled && guardsDefeated && !hasCredential,
    dressing: encounter.id,
  });
}

function createVaultPlan(
  options: CreateAfterlightSetpiecePlanOptions,
  encounter: AfterlightEncounterVariant,
  quality: SetpieceQualityBudget,
): VaultSetpiecePlan {
  const hasCredential = has(
    options.inventory,
    AFTERLIGHT_ITEMS.vaultCredential,
  );
  const doorOpen = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.openVault,
  );
  const hasBonds = has(options.inventory, AFTERLIGHT_ITEMS.bearerBonds);
  const hasCore = has(options.inventory, AFTERLIGHT_ITEMS.afterlightCore);
  const clearVault = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.clearVault,
  );
  const cues: InteractionCuePlan[] = [];

  if (!doorOpen) {
    cues.push(
      cue(
        "vault-reader",
        hasCredential ? "interact" : "target",
        hasCredential ? "lime" : "coral",
        AFTERLIGHT_SETPIECE_ANCHORS.vaultReader,
        1.4,
        hasCredential ? AFTERLIGHT_TAGS.openVault : undefined,
      ),
    );
  } else if (!hasCore) {
    cues.push(
      cue("vault-core", "target", "lime", AFTERLIGHT_LANDMARKS.vaultCore, 1.35),
    );
  } else if (!clearVault) {
    cues.push(
      cue(
        "vault-exit",
        "destination",
        "white",
        AFTERLIGHT_SETPIECE_ANCHORS.vaultExit,
        4.8,
      ),
    );
  }

  return Object.freeze({
    kind: "vault",
    phaseId: options.phaseId,
    anchor: AFTERLIGHT_SETPIECE_ANCHORS.vaultReader,
    encounter,
    quality,
    reducedMotion: options.reducedMotion,
    cues: Object.freeze(cues),
    lights: boundedLights(quality, [
      light(
        "vault-reader-light",
        hasCredential ? INTERACTION_COLORS.lime : INTERACTION_COLORS.coral,
        offset(AFTERLIGHT_SETPIECE_ANCHORS.vaultReader, 0, 2.4, 0.4),
        12,
        8,
      ),
      light(
        "vault-core-light",
        INTERACTION_COLORS.white,
        offset(AFTERLIGHT_SETPIECE_ANCHORS.vaultReader, 5.8, 2.6, 0),
        14,
        9,
      ),
    ]),
    estimatedDrawCalls: estimate("vault", quality, options.reducedMotion),
    doorOpen,
    readerReady: hasCredential && !doorOpen,
    bearerBondsVisible: doorOpen && !hasBonds,
    coreVisible: doorOpen && !hasCore,
    exitGateVisible: hasCore && !clearVault,
  });
}

function createBlackoutPlan(
  options: CreateAfterlightSetpiecePlanOptions,
  encounter: AfterlightEncounterVariant,
  quality: SetpieceQualityBudget,
): BlackoutSetpiecePlan {
  const primed = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.primeBlackout,
  );
  const overloadComplete = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.holdBlackout,
  );
  const cues: InteractionCuePlan[] = [];

  if (!primed) {
    cues.push(
      cue(
        "substation-prime",
        "interact",
        "lime",
        AFTERLIGHT_SETPIECE_ANCHORS.substationControl,
        1.8,
        AFTERLIGHT_TAGS.primeBlackout,
      ),
    );
  } else if (!options.blackout && !overloadComplete) {
    cues.push(
      cue(
        "substation-overload",
        "target",
        "coral",
        AFTERLIGHT_SETPIECE_ANCHORS.substationControl,
        2.2,
      ),
    );
  }

  const activeLights = options.blackout
    ? []
    : [
        light(
          "substation-control-light",
          primed ? INTERACTION_COLORS.coral : INTERACTION_COLORS.lime,
          offset(AFTERLIGHT_SETPIECE_ANCHORS.substationControl, 0, 3.2, 0),
          18,
          11,
        ),
        light(
          "substation-transformer-light",
          INTERACTION_COLORS.white,
          offset(AFTERLIGHT_SETPIECE_ANCHORS.substationControl, 4.5, 4.5, -1.5),
          14,
          13,
        ),
      ];

  return Object.freeze({
    kind: "blackout",
    phaseId: options.phaseId,
    anchor: AFTERLIGHT_SETPIECE_ANCHORS.substationControl,
    encounter,
    quality,
    reducedMotion: options.reducedMotion,
    cues: Object.freeze(cues),
    lights: boundedLights(quality, activeLights),
    estimatedDrawCalls: estimate("blackout", quality, options.reducedMotion),
    primed,
    blackout: options.blackout,
    overloadComplete,
  });
}

function createPursuitPlan(
  options: CreateAfterlightSetpiecePlanOptions,
  encounter: AfterlightEncounterVariant,
  quality: SetpieceQualityBudget,
): PursuitSetpiecePlan {
  const launched = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun,
  );
  const escaped = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.escapeAfterlightRun,
  );
  const qualityCount = [2, 3, 5][quality.decorationLevel];
  const roadblockCount = Math.min(
    qualityCount,
    encounter.interceptorCount,
    ROADBLOCK_LAYOUTS[encounter.id].length,
  );
  const roadblocks =
    launched && !escaped
      ? ROADBLOCK_LAYOUTS[encounter.id].slice(0, roadblockCount)
      : [];
  const cues: InteractionCuePlan[] = [];

  if (!launched) {
    cues.push(
      cue(
        "afterlight-run-launch",
        "destination",
        "lime",
        AFTERLIGHT_SETPIECE_ANCHORS.bridgeLaunch,
        3.2,
      ),
    );
  } else if (!escaped) {
    cues.push(
      cue(
        "afterlight-run-escape",
        "destination",
        "white",
        AFTERLIGHT_SETPIECE_ANCHORS.bridgeEscape,
        10.5,
      ),
    );
  }

  return Object.freeze({
    kind: "pursuit",
    phaseId: options.phaseId,
    anchor: AFTERLIGHT_SETPIECE_ANCHORS.bridgeLaunch,
    encounter,
    quality,
    reducedMotion: options.reducedMotion,
    cues: Object.freeze(cues),
    lights: boundedLights(quality, [
      light(
        "bridge-cordon-light",
        INTERACTION_COLORS.coral,
        [-5.8, 4.2, -149],
        24,
        19,
      ),
      light(
        "bridge-escape-light",
        INTERACTION_COLORS.white,
        offset(AFTERLIGHT_SETPIECE_ANCHORS.bridgeEscape, 0, 5.5, 0),
        18,
        18,
      ),
    ]),
    estimatedDrawCalls: estimate("pursuit", quality, options.reducedMotion),
    launched,
    escaped,
    roadblocks: Object.freeze(roadblocks),
  });
}

function createSafehousePlan(
  options: CreateAfterlightSetpiecePlanOptions,
  encounter: AfterlightEncounterVariant,
  quality: SetpieceQualityBudget,
): SafehouseSetpiecePlan {
  const reached = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.reachDebrief,
  );
  const delivered = has(
    options.completedObjectiveIds,
    AFTERLIGHT_OBJECTIVE_IDS.deliverAfterlightCore,
  );
  const carryingCore = has(options.inventory, AFTERLIGHT_ITEMS.afterlightCore);
  const bondsRetained = has(options.inventory, AFTERLIGHT_ITEMS.bearerBonds);
  const cues: InteractionCuePlan[] = [];

  if (!reached) {
    cues.push(
      cue(
        "safehouse-arrival",
        "destination",
        "white",
        AFTERLIGHT_SETPIECE_ANCHORS.safehouse,
        8.5,
      ),
    );
  } else if (carryingCore && !delivered) {
    cues.push(
      cue(
        "safehouse-deliver-core",
        "destination",
        "lime",
        AFTERLIGHT_SETPIECE_ANCHORS.safehouse,
        2.2,
      ),
    );
  } else if (!delivered) {
    cues.push(
      cue(
        "safehouse-core-missing",
        "target",
        "coral",
        AFTERLIGHT_SETPIECE_ANCHORS.safehouse,
        2.2,
      ),
    );
  }

  return Object.freeze({
    kind: "safehouse",
    phaseId: options.phaseId,
    anchor: AFTERLIGHT_SETPIECE_ANCHORS.safehouse,
    encounter,
    quality,
    reducedMotion: options.reducedMotion,
    cues: Object.freeze(cues),
    lights: boundedLights(quality, [
      light(
        "safehouse-porch-light",
        delivered ? INTERACTION_COLORS.lime : INTERACTION_COLORS.white,
        offset(AFTERLIGHT_SETPIECE_ANCHORS.safehouse, -3.5, 4.2, 1.4),
        18,
        14,
      ),
      light(
        "safehouse-drop-light",
        INTERACTION_COLORS.lime,
        offset(AFTERLIGHT_SETPIECE_ANCHORS.safehouse, 0, 2.3, 0),
        11,
        7,
      ),
    ]),
    estimatedDrawCalls: estimate("safehouse", quality, options.reducedMotion),
    reached,
    carryingCore,
    delivered,
    bondsRetained,
  });
}

export function createAfterlightSetpiecePlan(
  options: CreateAfterlightSetpiecePlanOptions,
): AfterlightMissionSetpiecePlan {
  const encounter = resolveAfterlightEncounterVariant(options.encounterVariant);
  const quality = SETPIECE_QUALITY_BUDGETS[options.quality];

  switch (options.phaseId) {
    case AFTERLIGHT_PHASE_IDS.boost:
      return createBoostPlan(options, encounter, quality);
    case AFTERLIGHT_PHASE_IDS.keyholder:
      return createCourierPlan(options, encounter, quality);
    case AFTERLIGHT_PHASE_IDS.vault:
      return createVaultPlan(options, encounter, quality);
    case AFTERLIGHT_PHASE_IDS.blackout:
      return createBlackoutPlan(options, encounter, quality);
    case AFTERLIGHT_PHASE_IDS.run:
      return createPursuitPlan(options, encounter, quality);
    case AFTERLIGHT_PHASE_IDS.debrief:
      return createSafehousePlan(options, encounter, quality);
    default:
      return Object.freeze({
        kind: "none",
        phaseId: options.phaseId,
        encounter,
        quality,
        reducedMotion: options.reducedMotion,
        cues: Object.freeze([]) as readonly [],
        lights: Object.freeze([]) as readonly [],
        estimatedDrawCalls: 0,
      });
  }
}
