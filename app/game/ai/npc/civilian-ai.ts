import type { EntityId, Tick, Vec3 } from "../../core/contracts";
import { deriveSeed, type RngSeed } from "../../core/rng";
import {
  getOutgoingEdges,
  type RoadGraph,
  type RoadGraphEdge,
  type SidewalkRoadNode,
} from "../../world/road-graph";
import { distanceSquaredXZ } from "./math";
import {
  evaluateThreats,
  PerceptionBudget,
  type ThreatStimulus,
} from "./perception";
import type { PhysicsQueryPort } from "./physics-query";

export type CivilianAiState =
  | "wander"
  | "wait-cross"
  | "cross"
  | "flee"
  | "cower";

export interface CivilianAiConfig {
  readonly capacity: number;
  readonly perceptionChecksPerTick: number;
  readonly walkSpeed: number;
  readonly crossSpeed: number;
  readonly fleeSpeed: number;
  readonly arrivalDistance: number;
  readonly waitCrossMinTicks: number;
  readonly waitCrossMaxTicks: number;
  readonly minimumFleeTicks: number;
  readonly threatMemoryTicks: number;
  readonly cowerTicks: number;
  readonly eyeHeight: number;
  readonly collisionMask?: number;
}

export const DEFAULT_CIVILIAN_AI_CONFIG: CivilianAiConfig = Object.freeze({
  capacity: 128,
  perceptionChecksPerTick: 12,
  walkSpeed: 1.7,
  crossSpeed: 2,
  fleeSpeed: 4.8,
  arrivalDistance: 0.6,
  waitCrossMinTicks: 24,
  waitCrossMaxTicks: 90,
  minimumFleeTicks: 120,
  threatMemoryTicks: 90,
  cowerTicks: 180,
  eyeHeight: 1.6,
});

export interface CivilianSpawn {
  readonly actorId: EntityId;
  readonly nodeId: string;
  readonly spawnTick?: Tick;
}

export interface CivilianActorFrame {
  readonly actorId: EntityId;
  readonly position: Vec3;
}

export interface CivilianUpdateContext {
  readonly tick: Tick;
  readonly actors: readonly CivilianActorFrame[];
  readonly threats?: readonly ThreatStimulus[];
  readonly crosswalkOpen?: (edge: RoadGraphEdge, tick: Tick) => boolean;
}

export interface CivilianMoveIntent {
  readonly target: Vec3;
  readonly speed: number;
  readonly edgeId: string;
  readonly targetNodeId: string;
}

export interface CivilianIntent {
  readonly actorId: EntityId;
  readonly poolSlot: number;
  readonly state: CivilianAiState;
  readonly move?: CivilianMoveIntent;
  readonly lookAt?: Vec3;
  readonly cower: boolean;
  readonly threatId?: string;
}

export interface CivilianAiSnapshot {
  readonly actorId: EntityId;
  readonly poolSlot: number;
  readonly state: CivilianAiState;
  readonly stateEnteredTick: Tick;
  readonly nodeId: string;
  readonly targetNodeId?: string;
  readonly threatId?: string;
  readonly lastThreatPosition?: Vec3;
}

export interface CivilianAiSystemOptions {
  readonly graph: RoadGraph;
  readonly seed: RngSeed;
  readonly physics?: PhysicsQueryPort;
  readonly config?: Partial<CivilianAiConfig>;
}

interface CivilianRecord {
  readonly actorId: EntityId;
  readonly poolSlot: number;
  state: CivilianAiState;
  stateEnteredTick: Tick;
  nodeId: string;
  previousNodeId?: string;
  edge?: RoadGraphEdge;
  waitUntilTick: Tick;
  choiceIndex: number;
  threatId?: string;
  lastThreatPosition?: Vec3;
  lastThreatTick: Tick;
  cowerUntilTick: Tick;
}

function mergeConfig(
  overrides: Partial<CivilianAiConfig> | undefined,
): CivilianAiConfig {
  const config = { ...DEFAULT_CIVILIAN_AI_CONFIG, ...overrides };
  const integerKeys = [
    "capacity",
    "perceptionChecksPerTick",
    "waitCrossMinTicks",
    "waitCrossMaxTicks",
    "minimumFleeTicks",
    "threatMemoryTicks",
    "cowerTicks",
  ] as const;
  for (const key of integerKeys) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0) {
      throw new RangeError(`${key} must be a non-negative safe integer`);
    }
  }
  if (config.waitCrossMaxTicks < config.waitCrossMinTicks) {
    throw new RangeError("waitCrossMaxTicks must be >= waitCrossMinTicks");
  }
  for (const key of [
    "walkSpeed",
    "crossSpeed",
    "fleeSpeed",
    "arrivalDistance",
    "eyeHeight",
  ] as const) {
    if (!Number.isFinite(config[key]) || config[key] < 0) {
      throw new RangeError(`${key} must be non-negative and finite`);
    }
  }
  return Object.freeze(config);
}

function sidewalkNode(graph: RoadGraph, nodeId: string): SidewalkRoadNode {
  const node = graph.nodes.get(nodeId);
  if (!node || node.kind !== "sidewalk") {
    throw new Error(`Civilian node must be a sidewalk node: ${nodeId}`);
  }
  return node;
}

function edgeTarget(graph: RoadGraph, edge: RoadGraphEdge): SidewalkRoadNode {
  return sidewalkNode(graph, edge.to);
}

function deterministicInteger(
  seed: RngSeed,
  stream: string,
  minInclusive: number,
  maxInclusive: number,
): number {
  if (maxInclusive === minInclusive) return minInclusive;
  const width = maxInclusive - minInclusive + 1;
  return minInclusive + (deriveSeed(seed, stream) % width);
}

export class CivilianAiSystem {
  readonly graph: RoadGraph;
  readonly config: CivilianAiConfig;
  readonly capacity: number;
  readonly #seed: RngSeed;
  readonly #physics?: PhysicsQueryPort;
  readonly #perception: PerceptionBudget;
  readonly #slots: Array<CivilianRecord | undefined>;
  readonly #actorSlots = new Map<EntityId, number>();
  readonly #freeSlots: number[];
  #lastUpdateTick: Tick | undefined;
  #cacheValid = false;
  #lastIntents: readonly CivilianIntent[] = Object.freeze([]);

  constructor(options: CivilianAiSystemOptions) {
    this.graph = options.graph;
    this.config = mergeConfig(options.config);
    this.capacity = this.config.capacity;
    this.#seed = options.seed;
    this.#physics = options.physics;
    this.#perception = new PerceptionBudget(
      this.config.perceptionChecksPerTick,
    );
    this.#slots = Array.from({ length: this.capacity });
    this.#freeSlots = Array.from(
      { length: this.capacity },
      (_, index) => index,
    );
  }

  get size(): number {
    return this.#actorSlots.size;
  }

  spawn(spawn: CivilianSpawn): number | null {
    if (this.#actorSlots.has(spawn.actorId)) {
      throw new Error(`Civilian ${spawn.actorId} is already active`);
    }
    sidewalkNode(this.graph, spawn.nodeId);
    const poolSlot = this.#freeSlots.shift();
    if (poolSlot === undefined) return null;
    const spawnTick = spawn.spawnTick ?? 0;
    if (!Number.isSafeInteger(spawnTick) || spawnTick < 0) {
      throw new RangeError("Civilian spawnTick must be non-negative");
    }
    this.#slots[poolSlot] = {
      actorId: spawn.actorId,
      poolSlot,
      state: "wander",
      stateEnteredTick: spawnTick,
      nodeId: spawn.nodeId,
      waitUntilTick: spawnTick,
      choiceIndex: 0,
      lastThreatTick: -1,
      cowerUntilTick: spawnTick,
    };
    this.#actorSlots.set(spawn.actorId, poolSlot);
    this.#invalidateTickCache();
    return poolSlot;
  }

  acquire(spawn: CivilianSpawn): number | null {
    return this.spawn(spawn);
  }

  despawn(actorId: EntityId): boolean {
    const poolSlot = this.#actorSlots.get(actorId);
    if (poolSlot === undefined) return false;
    this.#actorSlots.delete(actorId);
    this.#slots[poolSlot] = undefined;
    this.#freeSlots.push(poolSlot);
    this.#freeSlots.sort((first, second) => first - second);
    this.#invalidateTickCache();
    return true;
  }

  release(actorId: EntityId): boolean {
    return this.despawn(actorId);
  }

  has(actorId: EntityId): boolean {
    return this.#actorSlots.has(actorId);
  }

  get(actorId: EntityId): CivilianAiSnapshot | null {
    const poolSlot = this.#actorSlots.get(actorId);
    if (poolSlot === undefined) return null;
    const record = this.#slots[poolSlot] as CivilianRecord;
    return this.#snapshot(record);
  }

  snapshots(): readonly CivilianAiSnapshot[] {
    return Object.freeze(
      this.#activeRecords().map((record) => this.#snapshot(record)),
    );
  }

  update(context: CivilianUpdateContext): readonly CivilianIntent[] {
    if (!Number.isSafeInteger(context.tick) || context.tick < 0) {
      throw new RangeError("Civilian update tick must be non-negative");
    }
    if (
      this.#lastUpdateTick !== undefined &&
      context.tick < this.#lastUpdateTick
    ) {
      throw new Error("Civilian updates cannot move backwards in time");
    }
    if (context.tick === this.#lastUpdateTick && this.#cacheValid) {
      return this.#lastIntents;
    }

    const frames = new Map<EntityId, CivilianActorFrame>();
    for (const frame of context.actors) {
      if (frames.has(frame.actorId)) {
        throw new Error(`Duplicate civilian frame for ${frame.actorId}`);
      }
      frames.set(frame.actorId, frame);
    }

    const active = this.#activeRecords().filter((record) =>
      frames.has(record.actorId),
    );
    const perceived = new Set(
      this.#perception.select(
        context.tick,
        active.map((record) => record.actorId),
      ),
    );
    const threats = context.threats ?? [];
    const intents: CivilianIntent[] = [];

    for (const record of active) {
      const frame = frames.get(record.actorId) as CivilianActorFrame;
      if (perceived.has(record.actorId)) {
        const threat = evaluateThreats(threats, {
          actorId: record.actorId,
          actorPosition: frame.position,
          tick: context.tick,
          physics: this.#physics,
          collisionMask: this.config.collisionMask,
          eyeHeight: this.config.eyeHeight,
        });
        if (threat) this.#reactToThreat(record, threat.stimulus, context.tick);
      }

      this.#advanceState(record, frame, context);
      intents.push(this.#intent(record));
    }

    this.#lastUpdateTick = context.tick;
    this.#cacheValid = true;
    this.#lastIntents = Object.freeze(intents);
    return this.#lastIntents;
  }

  #reactToThreat(
    record: CivilianRecord,
    threat: ThreatStimulus,
    tick: Tick,
  ): void {
    record.threatId = threat.id;
    record.lastThreatPosition = threat.position;
    record.lastThreatTick = tick;
    if (record.state === "cower") {
      record.cowerUntilTick = Math.max(
        record.cowerUntilTick,
        tick + this.config.cowerTicks,
      );
      return;
    }
    if (record.state !== "flee") {
      record.edge = undefined;
      this.#transition(record, "flee", tick);
    }
  }

  #advanceState(
    record: CivilianRecord,
    frame: CivilianActorFrame,
    context: CivilianUpdateContext,
  ): void {
    const tick = context.tick;

    if (record.state === "cower") {
      if (
        tick >= record.cowerUntilTick &&
        tick - record.lastThreatTick > this.config.threatMemoryTicks
      ) {
        record.threatId = undefined;
        record.lastThreatPosition = undefined;
        this.#transition(record, "wander", tick);
      }
      return;
    }

    if (record.edge && this.#hasArrived(frame.position, record.edge)) {
      record.previousNodeId = record.nodeId;
      record.nodeId = record.edge.to;
      record.edge = undefined;
      if (record.state === "cross") this.#transition(record, "wander", tick);
    }

    if (record.state === "flee") {
      const threatIsStale =
        tick - record.lastThreatTick > this.config.threatMemoryTicks;
      const fledLongEnough =
        tick - record.stateEnteredTick >= this.config.minimumFleeTicks;
      if (threatIsStale && fledLongEnough) {
        this.#beginCower(record, tick);
        return;
      }
      if (!record.edge) {
        record.edge = this.#chooseEscapeEdge(record);
        if (!record.edge) this.#beginCower(record, tick);
      }
      return;
    }

    if (record.state === "wait-cross") {
      if (
        record.edge &&
        tick >= record.waitUntilTick &&
        (context.crosswalkOpen?.(record.edge, tick) ?? true)
      ) {
        this.#transition(record, "cross", tick);
      }
      return;
    }

    if (!record.edge) {
      const edge = this.#chooseWanderEdge(record);
      if (!edge) return;
      record.edge = edge;
      if (edge.kind === "crosswalk") {
        record.waitUntilTick =
          tick +
          deterministicInteger(
            this.#seed,
            `civilian:${record.actorId}:cross:${record.choiceIndex}`,
            this.config.waitCrossMinTicks,
            this.config.waitCrossMaxTicks,
          );
        this.#transition(record, "wait-cross", tick);
      }
    }
  }

  #chooseWanderEdge(record: CivilianRecord): RoadGraphEdge | undefined {
    const outgoing = getOutgoingEdges(this.graph, record.nodeId).filter(
      (edge) => edge.mode === "pedestrian",
    );
    if (outgoing.length === 0) return undefined;
    const forward = outgoing.filter(
      (edge) => edge.to !== record.previousNodeId,
    );
    const choices = (forward.length > 0 ? forward : outgoing).sort(
      (first, second) => first.id.localeCompare(second.id),
    );
    const choice =
      choices[
        deriveSeed(
          this.#seed,
          `civilian:${record.actorId}:wander:${record.choiceIndex}`,
        ) % choices.length
      ];
    record.choiceIndex += 1;
    return choice;
  }

  #chooseEscapeEdge(record: CivilianRecord): RoadGraphEdge | undefined {
    if (!record.lastThreatPosition) return undefined;
    const outgoing = getOutgoingEdges(this.graph, record.nodeId).filter(
      (edge) => edge.mode === "pedestrian",
    );
    const ranked = outgoing
      .map((edge) => ({
        edge,
        distance: distanceSquaredXZ(
          edgeTarget(this.graph, edge).position,
          record.lastThreatPosition as Vec3,
        ),
        tie: deriveSeed(
          this.#seed,
          `civilian:${record.actorId}:flee:${record.choiceIndex}:${edge.id}`,
        ),
      }))
      .sort(
        (first, second) =>
          second.distance - first.distance ||
          first.tie - second.tie ||
          first.edge.id.localeCompare(second.edge.id),
      );
    record.choiceIndex += 1;
    return ranked[0]?.edge;
  }

  #hasArrived(position: Vec3, edge: RoadGraphEdge): boolean {
    const target = edgeTarget(this.graph, edge).position;
    return (
      distanceSquaredXZ(position, target) <= this.config.arrivalDistance ** 2
    );
  }

  #beginCower(record: CivilianRecord, tick: Tick): void {
    record.edge = undefined;
    record.cowerUntilTick = tick + this.config.cowerTicks;
    this.#transition(record, "cower", tick);
  }

  #transition(
    record: CivilianRecord,
    state: CivilianAiState,
    tick: Tick,
  ): void {
    if (record.state === state) return;
    record.state = state;
    record.stateEnteredTick = tick;
  }

  #intent(record: CivilianRecord): CivilianIntent {
    const target = record.edge
      ? edgeTarget(this.graph, record.edge).position
      : undefined;
    const speed =
      record.state === "flee"
        ? this.config.fleeSpeed
        : record.state === "cross"
          ? this.config.crossSpeed
          : this.config.walkSpeed;
    const moving =
      target &&
      record.edge &&
      (record.state === "wander" ||
        record.state === "cross" ||
        record.state === "flee");

    return Object.freeze({
      actorId: record.actorId,
      poolSlot: record.poolSlot,
      state: record.state,
      move: moving
        ? Object.freeze({
            target,
            speed,
            edgeId: record.edge?.id as string,
            targetNodeId: record.edge?.to as string,
          })
        : undefined,
      lookAt: record.state === "wait-cross" ? target : undefined,
      cower: record.state === "cower",
      threatId: record.threatId,
    });
  }

  #snapshot(record: CivilianRecord): CivilianAiSnapshot {
    return Object.freeze({
      actorId: record.actorId,
      poolSlot: record.poolSlot,
      state: record.state,
      stateEnteredTick: record.stateEnteredTick,
      nodeId: record.nodeId,
      targetNodeId: record.edge?.to,
      threatId: record.threatId,
      lastThreatPosition: record.lastThreatPosition,
    });
  }

  #activeRecords(): CivilianRecord[] {
    return [...this.#actorSlots.entries()]
      .sort(([first], [second]) => first - second)
      .map(([, poolSlot]) => this.#slots[poolSlot] as CivilianRecord);
  }

  #invalidateTickCache(): void {
    this.#cacheValid = false;
    this.#lastIntents = Object.freeze([]);
  }
}

export { CivilianAiSystem as CivilianPool };
