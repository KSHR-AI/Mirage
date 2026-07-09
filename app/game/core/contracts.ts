export const CONTRACT_VERSION = 1 as const;
export const SIMULATION_HZ = 60 as const;
export const SIMULATION_DT = 1 / SIMULATION_HZ;
export const AI_DECISION_INTERVAL_TICKS = 6 as const;

export type EntityId = number;
export type Tick = number;
export type Vec2 = readonly [x: number, y: number];
export type Vec3 = readonly [x: number, y: number, z: number];

export type InputSource = "keyboard" | "touch" | "gamepad" | "replay";

export interface InputFrame {
  readonly source: InputSource;
  readonly move: Vec2;
  readonly look: Vec2;
  readonly throttle: number;
  readonly steer: number;
  readonly brake: boolean;
  readonly sprint: boolean;
  readonly aim: boolean;
  readonly jumpPressed: boolean;
  readonly interactPressed: boolean;
  readonly firePressed: boolean;
  readonly reloadPressed: boolean;
  readonly pausePressed: boolean;
}

export const EMPTY_INPUT_FRAME: InputFrame = {
  source: "keyboard",
  move: [0, 0],
  look: [0, 0],
  throttle: 0,
  steer: 0,
  brake: false,
  sprint: false,
  aim: false,
  jumpPressed: false,
  interactPressed: false,
  firePressed: false,
  reloadPressed: false,
  pausePressed: false,
};

export type ActorKind = "player" | "civilian" | "guard" | "police";
export type ActorLifeState = "alive" | "down" | "dead" | "respawning";
export type Faction = "player" | "civilian" | "afterlight" | "police";
export type VehicleKind = "hero" | "traffic" | "courier" | "police";
export type VehicleLifeState = "active" | "disabled" | "destroyed";
export type PoliceMode = "patrol" | "respond" | "pursue" | "search" | "return";

export interface Pose {
  readonly position: Vec3;
  readonly rotationY: number;
}

export interface ActorState {
  readonly id: EntityId;
  readonly kind: ActorKind;
  readonly faction: Faction;
  readonly pose: Pose;
  readonly velocity: Vec3;
  readonly health: number;
  readonly life: ActorLifeState;
  readonly equippedWeaponId?: string;
}

export interface VehicleState {
  readonly id: EntityId;
  readonly kind: VehicleKind;
  readonly pose: Pose;
  readonly velocity: Vec3;
  readonly health: number;
  readonly life: VehicleLifeState;
  readonly occupiedBy?: EntityId;
  readonly routeId?: string;
}

export interface WeaponState {
  readonly id: string;
  readonly magazine: number;
  readonly reserve: number;
  readonly cooldownTicks: number;
  readonly reloadingUntilTick?: Tick;
}

export interface HeatState {
  readonly value: number;
  readonly wantedLevel: 0 | 1 | 2 | 3;
  readonly mode: PoliceMode;
  readonly lastSeenPosition?: Vec3;
  readonly unseenTicks: number;
}

export type GameEvent =
  | {
      readonly type: "actor-damaged";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly amount: number;
      readonly sourceId?: EntityId;
    }
  | {
      readonly type: "actor-downed";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly sourceId?: EntityId;
    }
  | {
      readonly type: "vehicle-damaged";
      readonly tick: Tick;
      readonly vehicleId: EntityId;
      readonly amount: number;
      readonly sourceId?: EntityId;
    }
  | {
      readonly type: "vehicle-disabled";
      readonly tick: Tick;
      readonly vehicleId: EntityId;
    }
  | {
      readonly type: "crime-witnessed";
      readonly tick: Tick;
      readonly crime: CrimeKind;
      readonly position: Vec3;
      readonly witnessIds: readonly EntityId[];
    }
  | {
      readonly type: "interaction";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly tag: string;
      readonly targetId?: EntityId;
    }
  | {
      readonly type: "item-collected";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly itemId: string;
    }
  | {
      readonly type: "objective-completed";
      readonly tick: Tick;
      readonly missionId: string;
      readonly objectiveId: string;
    }
  | {
      readonly type: "checkpoint-reached";
      readonly tick: Tick;
      readonly checkpointId: string;
    }
  | {
      readonly type: "setpiece-triggered";
      readonly tick: Tick;
      readonly setpieceId: string;
    };

export type CrimeKind = "vehicle-theft" | "assault" | "gunfire" | "core-theft";

export type ObjectiveTrigger =
  | {
      readonly type: "event";
      readonly event: GameEvent["type"];
      readonly count?: number;
      readonly tag?: string;
    }
  | {
      readonly type: "volume";
      readonly center: Vec3;
      readonly radius: number;
      readonly actor: ActorKind | VehicleKind;
      readonly dwellTicks?: number;
    }
  | { readonly type: "inventory"; readonly itemId: string }
  | { readonly type: "heat-mode"; readonly mode: PoliceMode }
  | { readonly type: "elapsed"; readonly ticks: number }
  | {
      readonly type: "all" | "any";
      readonly children: readonly ObjectiveTrigger[];
    };

export interface ObjectiveDefinition {
  readonly id: string;
  readonly label: string;
  readonly trigger: ObjectiveTrigger;
  readonly optional?: boolean;
  readonly reward: number;
}

export interface MissionPhaseDefinition {
  readonly id: string;
  readonly chapter: string;
  readonly location: string;
  readonly objectives: readonly ObjectiveDefinition[];
  readonly checkpointAfter?: string;
  readonly heatFloor?: number;
  readonly onEnterEvents?: readonly GameEvent[];
}

export interface MissionDefinition {
  readonly id: string;
  readonly title: string;
  readonly phases: readonly MissionPhaseDefinition[];
}

export interface MissionProgress {
  readonly missionId: string;
  readonly phaseIndex: number;
  readonly completedObjectiveIds: readonly string[];
  readonly completedCheckpointIds: readonly string[];
  readonly completed: boolean;
  readonly failed: boolean;
  readonly startedAtTick: Tick;
}

export interface GameState {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly tick: Tick;
  readonly seed: number;
  readonly paused: boolean;
  readonly playerId: EntityId;
  readonly actors: ReadonlyMap<EntityId, ActorState>;
  readonly vehicles: ReadonlyMap<EntityId, VehicleState>;
  readonly weapons: ReadonlyMap<string, WeaponState>;
  readonly inventory: ReadonlySet<string>;
  readonly heat: HeatState;
  readonly mission: MissionProgress;
  readonly cash: number;
  readonly checkpointId: string;
}

export interface RenderSnapshot {
  readonly previousTick: Tick;
  readonly currentTick: Tick;
  readonly alpha: number;
  readonly actors: readonly ActorState[];
  readonly vehicles: readonly VehicleState[];
  readonly heat: HeatState;
  readonly mission: MissionProgress;
  readonly cash: number;
}

export interface GameRuntime {
  readonly state: GameState;
  command(input: InputFrame): void;
  advance(): readonly GameEvent[];
  snapshot(alpha: number): RenderSnapshot;
  save(): SaveGameV1;
  hash(): string;
}

export interface SaveGameV1 {
  readonly version: 1;
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly seed: number;
  readonly checkpointId: string;
  readonly mission: MissionProgress;
  readonly player: {
    readonly health: number;
    readonly pose: Pose;
    readonly equippedWeaponId?: string;
  };
  readonly cash: number;
  readonly inventory: readonly string[];
  readonly unlockId?: "reinforced-chassis" | "extended-magazine";
  readonly bestTimeTicks?: number;
  readonly bestRank?: "S" | "A" | "B" | "C";
}

export interface AssetManifestEntry {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly sourceUrl: string;
  readonly author: string;
  readonly license: string;
  readonly acquiredAt: string;
  readonly modifications: string;
  readonly aiProvenance?: string;
}

export interface AssetManifestV1 {
  readonly version: 1;
  readonly generatedAt: string;
  readonly entries: readonly AssetManifestEntry[];
}

export interface TelemetryEventV1 {
  readonly version: 1;
  readonly event:
    | "game-ready"
    | "mission-phase"
    | "game-complete"
    | "client-error"
    | "webgl-lost"
    | "performance-sample";
  readonly release: string;
  readonly sessionId: string;
  readonly tick?: Tick;
  readonly value?: string | number;
}
