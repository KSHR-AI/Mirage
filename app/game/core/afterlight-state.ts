import { createSignal9State, SIGNAL_9_SPEC } from "../combat";
import {
  AFTERLIGHT_CHECKPOINT_IDS,
  AFTERLIGHT_DEFAULT_SEED,
  createAfterlightJob,
} from "../missions/afterlight-job";
import { createMissionProgress } from "../missions/reducer";
import { createHeatState } from "../ai/police/heat";
import { CONTRACT_VERSION } from "./contracts";
import type {
  ActorState,
  EntityId,
  GameState,
  Pose,
  Vec3,
  VehicleState,
} from "./contracts";

export const AFTERLIGHT_ENTITY_IDS = Object.freeze({
  player: 1,
  heroCoupe: 100,
  courier: 110,
  keyholderGuardA: 201,
  keyholderGuardB: 202,
  vaultGuardA: 211,
  vaultGuardB: 212,
  vaultGuardC: 213,
  vaultGuardD: 214,
  policeA: 301,
  policeB: 302,
  policeC: 303,
  policeD: 304,
} as const satisfies Readonly<Record<string, EntityId>>);

export const AFTERLIGHT_START_CHECKPOINT_ID =
  "afterlight:checkpoint:start" as const;

export interface AfterlightCheckpointDefinition {
  readonly id: string;
  readonly pose: Pose;
  readonly vehiclePose?: Pose;
}

export const AFTERLIGHT_CHECKPOINTS: Readonly<
  Record<string, AfterlightCheckpointDefinition>
> = Object.freeze({
  [AFTERLIGHT_START_CHECKPOINT_ID]: Object.freeze({
    id: AFTERLIGHT_START_CHECKPOINT_ID,
    pose: Object.freeze({
      position: [64, 1.15, 74] as Vec3,
      rotationY: Math.PI,
    }),
    vehiclePose: Object.freeze({
      position: [68, 0.72, 70] as Vec3,
      rotationY: Math.PI,
    }),
  }),
  [AFTERLIGHT_CHECKPOINT_IDS.keyholder]: Object.freeze({
    id: AFTERLIGHT_CHECKPOINT_IDS.keyholder,
    pose: Object.freeze({
      position: [70, 1.15, 48] as Vec3,
      rotationY: -2.35,
    }),
    vehiclePose: Object.freeze({
      position: [70, 0.72, 50] as Vec3,
      rotationY: Math.PI,
    }),
  }),
  [AFTERLIGHT_CHECKPOINT_IDS.vault]: Object.freeze({
    id: AFTERLIGHT_CHECKPOINT_IDS.vault,
    pose: Object.freeze({
      position: [14, 1.15, -32] as Vec3,
      rotationY: Math.PI,
    }),
    vehiclePose: Object.freeze({
      position: [20, 0.72, -28] as Vec3,
      rotationY: Math.PI,
    }),
  }),
  [AFTERLIGHT_CHECKPOINT_IDS.blackout]: Object.freeze({
    id: AFTERLIGHT_CHECKPOINT_IDS.blackout,
    pose: Object.freeze({
      position: [-64, 1.15, -36] as Vec3,
      rotationY: Math.PI / 2,
    }),
    vehiclePose: Object.freeze({
      position: [-58, 0.72, -32] as Vec3,
      rotationY: Math.PI / 2,
    }),
  }),
  [AFTERLIGHT_CHECKPOINT_IDS.run]: Object.freeze({
    id: AFTERLIGHT_CHECKPOINT_IDS.run,
    pose: Object.freeze({
      position: [0, 1.15, -106] as Vec3,
      rotationY: 0,
    }),
    vehiclePose: Object.freeze({
      position: [0, 0.72, -108] as Vec3,
      rotationY: 0,
    }),
  }),
  [AFTERLIGHT_CHECKPOINT_IDS.debrief]: Object.freeze({
    id: AFTERLIGHT_CHECKPOINT_IDS.debrief,
    pose: Object.freeze({
      position: [0, 1.15, -224] as Vec3,
      rotationY: 0,
    }),
    vehiclePose: Object.freeze({
      position: [3, 0.72, -222] as Vec3,
      rotationY: 0,
    }),
  }),
});

export const AFTERLIGHT_LANDMARKS = Object.freeze({
  boostYard: [68, 0.72, 70] as Vec3,
  missionIntercept: [70, 1.15, 42] as Vec3,
  courierRouteStart: [70, 0.72, 42] as Vec3,
  vaultReader: [14, 1.15, -42] as Vec3,
  vaultExit: [14, 1.15, -30] as Vec3,
  substationControl: [-70, 1.15, -42] as Vec3,
  bridgeLaunch: [0, 0.72, -114] as Vec3,
  bridgeEscape: [0, 1.15, -218] as Vec3,
  safehouse: [0, 1.15, -232] as Vec3,
});

function actor(
  id: EntityId,
  kind: ActorState["kind"],
  faction: ActorState["faction"],
  position: Vec3,
  rotationY: number,
  health: number,
  equippedWeaponId?: string,
): ActorState {
  return {
    id,
    kind,
    faction,
    pose: { position, rotationY },
    velocity: [0, 0, 0],
    health,
    life: "alive",
    ...(equippedWeaponId ? { equippedWeaponId } : {}),
  };
}

function vehicle(
  id: EntityId,
  kind: VehicleState["kind"],
  position: Vec3,
  rotationY: number,
  health: number,
  routeId?: string,
): VehicleState {
  return {
    id,
    kind,
    pose: { position, rotationY },
    velocity: [0, 0, 0],
    health,
    life: "active",
    ...(routeId ? { routeId } : {}),
  };
}

export function createInitialAfterlightActors(): ReadonlyMap<
  EntityId,
  ActorState
> {
  const ids = AFTERLIGHT_ENTITY_IDS;
  return new Map([
    [
      ids.player,
      actor(
        ids.player,
        "player",
        "player",
        [64, 1.15, 74],
        Math.PI,
        100,
        SIGNAL_9_SPEC.id,
      ),
    ],
    [
      ids.keyholderGuardA,
      actor(
        ids.keyholderGuardA,
        "guard",
        "afterlight",
        [66, 1.15, 36],
        Math.PI / 2,
        90,
        SIGNAL_9_SPEC.id,
      ),
    ],
    [
      ids.keyholderGuardB,
      actor(
        ids.keyholderGuardB,
        "guard",
        "afterlight",
        [74, 1.15, 36],
        -Math.PI / 2,
        90,
        SIGNAL_9_SPEC.id,
      ),
    ],
    [
      ids.vaultGuardA,
      actor(ids.vaultGuardA, "guard", "afterlight", [10, 1.15, -48], 0, 90),
    ],
    [
      ids.vaultGuardB,
      actor(
        ids.vaultGuardB,
        "guard",
        "afterlight",
        [18, 1.15, -48],
        Math.PI,
        90,
      ),
    ],
    [
      ids.vaultGuardC,
      actor(
        ids.vaultGuardC,
        "guard",
        "afterlight",
        [10, 1.15, -36],
        -Math.PI / 2,
        90,
      ),
    ],
    [
      ids.vaultGuardD,
      actor(
        ids.vaultGuardD,
        "guard",
        "afterlight",
        [18, 1.15, -36],
        Math.PI,
        90,
      ),
    ],
    [
      ids.policeA,
      actor(ids.policeA, "police", "police", [-86, 1.15, 78], 0, 100),
    ],
    [
      ids.policeB,
      actor(ids.policeB, "police", "police", [86, 1.15, 10], 0, 100),
    ],
    [
      ids.policeC,
      actor(ids.policeC, "police", "police", [-82, 1.15, -72], 0, 100),
    ],
    [
      ids.policeD,
      actor(ids.policeD, "police", "police", [82, 1.15, -82], 0, 100),
    ],
  ]);
}

export function createInitialAfterlightVehicles(): ReadonlyMap<
  EntityId,
  VehicleState
> {
  const ids = AFTERLIGHT_ENTITY_IDS;
  return new Map([
    [
      ids.heroCoupe,
      vehicle(ids.heroCoupe, "hero", [68, 0.72, 70], Math.PI, 100),
    ],
    [
      ids.courier,
      vehicle(
        ids.courier,
        "courier",
        [70, 0.72, 42],
        Math.PI,
        120,
        "courier-embarcadero",
      ),
    ],
  ]);
}

export function createInitialAfterlightState(
  seed = AFTERLIGHT_DEFAULT_SEED,
): GameState {
  const definition = createAfterlightJob(seed);

  return {
    contractVersion: CONTRACT_VERSION,
    tick: 0,
    seed,
    paused: false,
    playerId: AFTERLIGHT_ENTITY_IDS.player,
    actors: createInitialAfterlightActors(),
    vehicles: createInitialAfterlightVehicles(),
    weapons: new Map([[SIGNAL_9_SPEC.id, createSignal9State()]]),
    inventory: new Set(),
    heat: createHeatState(),
    mission: createMissionProgress(definition, 0),
    cash: 0,
    checkpointId: AFTERLIGHT_START_CHECKPOINT_ID,
  };
}

export function afterlightCheckpoint(
  checkpointId: string,
): AfterlightCheckpointDefinition {
  return (
    AFTERLIGHT_CHECKPOINTS[checkpointId] ??
    AFTERLIGHT_CHECKPOINTS[AFTERLIGHT_START_CHECKPOINT_ID]
  );
}
