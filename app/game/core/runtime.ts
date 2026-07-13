import {
  CONTRACT_VERSION,
  EMPTY_INPUT_FRAME,
  SIMULATION_DT,
  SIMULATION_HZ,
} from "./contracts";
import type {
  ActorState,
  GameEvent,
  GameRuntime,
  GameState,
  HeatState,
  InputFrame,
  MissionProgress,
  Pose,
  RenderSnapshot,
  SaveGameV1,
  Tick,
  Vec2,
  Vec3,
  VehicleState,
  WeaponState,
} from "./contracts";
import { RngStreams, type SeededRng } from "./rng";

export interface RuntimeStepContext {
  readonly dt: typeof SIMULATION_DT;
  readonly hz: typeof SIMULATION_HZ;
  readonly tick: Tick;
  readonly input: InputFrame;
  readonly rng: RngStreams;
  random(streamName: string): SeededRng;
  emit(event: GameEvent): void;
}

export interface RuntimeStepResult {
  readonly state: GameState;
  readonly events?: readonly GameEvent[];
}

export type RuntimeStep = (
  state: GameState,
  input: InputFrame,
  context: RuntimeStepContext,
) => GameState | RuntimeStepResult;

export interface GameRuntimeOptions {
  readonly initialState: GameState;
  readonly step?: RuntimeStep;
}

const defaultStep: RuntimeStep = (state) => state;

const rejectCollectionMutation = (): never => {
  throw new TypeError("Game state collections are immutable");
};

function immutableMap<K, V>(
  entries: Iterable<readonly [K, V]>,
): ReadonlyMap<K, V> {
  const target = new Map(entries);
  const proxy: ReadonlyMap<K, V> = new Proxy(target, {
    get(map, property) {
      if (property === "set" || property === "delete" || property === "clear") {
        return rejectCollectionMutation;
      }
      if (property === "forEach") {
        return (
          callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
          thisArg?: unknown,
        ) =>
          map.forEach((value, key) =>
            callback.call(thisArg, value, key, proxy),
          );
      }

      const member = Reflect.get(map, property, map) as unknown;
      return typeof member === "function" ? member.bind(map) : member;
    },
  });

  return Object.freeze(proxy);
}

function immutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const target = new Set(values);
  const proxy: ReadonlySet<T> = new Proxy(target, {
    get(set, property) {
      if (property === "add" || property === "delete" || property === "clear") {
        return rejectCollectionMutation;
      }
      if (property === "forEach") {
        return (
          callback: (value: T, key: T, set: ReadonlySet<T>) => void,
          thisArg?: unknown,
        ) =>
          set.forEach((value) => callback.call(thisArg, value, value, proxy));
      }

      const member = Reflect.get(set, property, set) as unknown;
      return typeof member === "function" ? member.bind(set) : member;
    },
  });

  return Object.freeze(proxy);
}

function cloneVec2(value: Vec2): Vec2 {
  return Object.freeze([value[0], value[1]]) as Vec2;
}

function cloneVec3(value: Vec3): Vec3 {
  return Object.freeze([value[0], value[1], value[2]]) as Vec3;
}

function clonePose(value: Pose): Pose {
  return Object.freeze({
    position: cloneVec3(value.position),
    rotationY: value.rotationY,
  });
}

function cloneActor(value: ActorState): ActorState {
  return Object.freeze({
    ...value,
    pose: clonePose(value.pose),
    velocity: cloneVec3(value.velocity),
  });
}

function cloneVehicle(value: VehicleState): VehicleState {
  return Object.freeze({
    ...value,
    pose: clonePose(value.pose),
    velocity: cloneVec3(value.velocity),
  });
}

function cloneWeapon(value: WeaponState): WeaponState {
  return Object.freeze({ ...value });
}

function cloneHeat(value: HeatState): HeatState {
  return Object.freeze({
    ...value,
    ...(value.lastSeenPosition
      ? { lastSeenPosition: cloneVec3(value.lastSeenPosition) }
      : {}),
  });
}

function cloneMission(value: MissionProgress): MissionProgress {
  return Object.freeze({
    ...value,
    completedObjectiveIds: Object.freeze([...value.completedObjectiveIds]),
    completedCheckpointIds: Object.freeze([...value.completedCheckpointIds]),
  });
}

function cloneInput(value: InputFrame): InputFrame {
  return Object.freeze({
    ...value,
    move: cloneVec2(value.move),
    look: cloneVec2(value.look),
  });
}

function cloneState(value: GameState): GameState {
  const actors = immutableMap(
    [...value.actors].map(([id, actor]) => [id, cloneActor(actor)] as const),
  );
  const vehicles = immutableMap(
    [...value.vehicles].map(
      ([id, vehicle]) => [id, cloneVehicle(vehicle)] as const,
    ),
  );
  const weapons = immutableMap(
    [...value.weapons].map(
      ([id, weapon]) => [id, cloneWeapon(weapon)] as const,
    ),
  );
  const inventory = immutableSet(value.inventory);

  return Object.freeze({
    ...value,
    actors,
    vehicles,
    weapons,
    inventory,
    heat: cloneHeat(value.heat),
    mission: cloneMission(value.mission),
  });
}

function cloneEvent(event: GameEvent): GameEvent {
  if (event.type === "crime-witnessed") {
    return Object.freeze({
      ...event,
      position: cloneVec3(event.position),
      witnessIds: Object.freeze([...event.witnessIds]),
    });
  }

  return Object.freeze({ ...event });
}

function isStepResult(
  value: GameState | RuntimeStepResult,
): value is RuntimeStepResult {
  return "state" in value;
}

function interpolate(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function interpolateAngle(from: number, to: number, alpha: number): number {
  if (alpha === 0) return from;
  if (alpha === 1) return to;

  const fullTurn = Math.PI * 2;
  const delta =
    ((((to - from + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
  return from + delta * alpha;
}

function interpolateVec3(from: Vec3, to: Vec3, alpha: number): Vec3 {
  return Object.freeze([
    interpolate(from[0], to[0], alpha),
    interpolate(from[1], to[1], alpha),
    interpolate(from[2], to[2], alpha),
  ]) as Vec3;
}

function interpolatePose(from: Pose, to: Pose, alpha: number): Pose {
  return Object.freeze({
    position: interpolateVec3(from.position, to.position, alpha),
    rotationY: interpolateAngle(from.rotationY, to.rotationY, alpha),
  });
}

function interpolateActor(
  previous: ActorState | undefined,
  current: ActorState,
  alpha: number,
): ActorState {
  if (!previous) return cloneActor(current);

  return Object.freeze({
    ...current,
    pose: interpolatePose(previous.pose, current.pose, alpha),
    velocity: interpolateVec3(previous.velocity, current.velocity, alpha),
  });
}

function interpolateVehicle(
  previous: VehicleState | undefined,
  current: VehicleState,
  alpha: number,
): VehicleState {
  if (!previous) return cloneVehicle(current);

  return Object.freeze({
    ...current,
    pose: interpolatePose(previous.pose, current.pose, alpha),
    velocity: interpolateVec3(previous.velocity, current.velocity, alpha),
  });
}

function clampAlpha(alpha: number): number {
  if (Number.isNaN(alpha)) return 0;
  return Math.min(1, Math.max(0, alpha));
}

function canonicalStringify(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (Number.isNaN(value)) return '"$number:NaN"';
      if (value === Number.POSITIVE_INFINITY) return '"$number:Infinity"';
      if (value === Number.NEGATIVE_INFINITY) return '"$number:-Infinity"';
      return Object.is(value, -0) ? "0" : String(value);
    case "string":
      return JSON.stringify(value);
    case "undefined":
      return '"$undefined"';
    case "bigint":
      return JSON.stringify(`$bigint:${String(value)}`);
    case "symbol":
      return JSON.stringify(`$symbol:${String(value.description)}`);
    case "function":
      return JSON.stringify(`$function:${value.name}`);
    default:
      break;
  }

  const object = value as object;
  if (seen.has(object)) {
    throw new TypeError("Cannot hash cyclic state");
  }
  seen.add(object);

  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalStringify(item, seen)).join(",")}]`;
    }

    if (value instanceof Map) {
      const entries = [...value].map(([key, item]) => {
        const canonicalKey = canonicalStringify(key, seen);
        const canonicalValue = canonicalStringify(item, seen);
        return [canonicalKey, canonicalValue] as const;
      });
      entries.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        const left = `${leftKey}:${leftValue}`;
        const right = `${rightKey}:${rightValue}`;
        return left < right ? -1 : left > right ? 1 : 0;
      });
      return `{"$map":[${entries
        .map(([key, item]) => `[${key},${item}]`)
        .join(",")}]}`;
    }

    if (value instanceof Set) {
      const items = [...value].map((item) => canonicalStringify(item, seen));
      items.sort();
      return `{"$set":[${items.join(",")}]}`;
    }

    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalStringify(record[key], seen)}`,
      );
    return `{${entries.join(",")}}`;
  } finally {
    seen.delete(object);
  }
}

function stableStringify(value: unknown): string {
  return canonicalStringify(value, new WeakSet());
}

function fnv1a(value: string, initial: number): number {
  let hash = initial >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    hash = Math.imul(hash ^ (codeUnit & 0xff), 0x01000193);
    hash = Math.imul(hash ^ (codeUnit >>> 8), 0x01000193);
  }
  return hash >>> 0;
}

export function stableHash(value: unknown): string {
  const canonical = stableStringify(value);
  const high = fnv1a(canonical, 0x811c9dc5);
  const low = fnv1a(canonical, 0x9e3779b9);
  return `${high.toString(16).padStart(8, "0")}${low
    .toString(16)
    .padStart(8, "0")}`;
}

export function hashGameState(state: GameState): string {
  return stableHash(state);
}

export class DeterministicGameRuntime implements GameRuntime {
  readonly dt = SIMULATION_DT;
  readonly hz = SIMULATION_HZ;
  readonly rng: RngStreams;

  private readonly step: RuntimeStep;
  private readonly inputQueue: InputFrame[] = [];
  private readonly pendingEvents: GameEvent[] = [];
  private currentState: GameState;
  private previousState: GameState;

  constructor(initialState: GameState, step?: RuntimeStep);
  constructor(options: GameRuntimeOptions);
  constructor(
    initialStateOrOptions: GameState | GameRuntimeOptions,
    step?: RuntimeStep,
  ) {
    const options =
      "initialState" in initialStateOrOptions
        ? initialStateOrOptions
        : { initialState: initialStateOrOptions, step };

    if (options.initialState.contractVersion !== CONTRACT_VERSION) {
      throw new Error(
        `Unsupported game contract version: ${options.initialState.contractVersion}`,
      );
    }

    this.currentState = cloneState(options.initialState);
    this.previousState = this.currentState;
    this.step = options.step ?? defaultStep;
    this.rng = new RngStreams(this.currentState.seed);
  }

  get state(): GameState {
    return this.currentState;
  }

  get queuedInputCount(): number {
    return this.inputQueue.length;
  }

  command(input: InputFrame): void {
    this.inputQueue.push(cloneInput(input));
  }

  queueEvent(event: GameEvent): void {
    this.pendingEvents.push(cloneEvent(event));
  }

  drainEvents(): readonly GameEvent[] {
    if (this.pendingEvents.length === 0) return Object.freeze([]);
    return Object.freeze(this.pendingEvents.splice(0));
  }

  advance(): readonly GameEvent[] {
    const queuedInput = this.inputQueue.shift();
    const input = queuedInput ?? cloneInput(EMPTY_INPUT_FRAME);

    if (input.pausePressed) {
      const previous = this.currentState;
      this.previousState = previous;
      this.currentState = cloneState({
        ...previous,
        paused: !previous.paused,
      });
      return this.drainEvents();
    }

    if (this.currentState.paused) {
      return this.drainEvents();
    }

    const previous = this.currentState;
    const nextTick = previous.tick + 1;
    if (!Number.isSafeInteger(nextTick)) {
      if (queuedInput) this.inputQueue.unshift(queuedInput);
      throw new RangeError("Game tick exceeded the safe integer range");
    }

    const rngSnapshot = this.rng.snapshot();
    const eventCount = this.pendingEvents.length;
    const context: RuntimeStepContext = Object.freeze({
      dt: SIMULATION_DT,
      hz: SIMULATION_HZ,
      tick: nextTick,
      input,
      rng: this.rng,
      random: (streamName: string) => this.rng.stream(streamName),
      emit: (event: GameEvent) => this.pendingEvents.push(cloneEvent(event)),
    });

    try {
      const result = this.step(previous, input, context);
      const steppedState = isStepResult(result) ? result.state : result;
      const resultEvents = isStepResult(result) ? result.events : undefined;
      const nextState = cloneState({
        ...steppedState,
        contractVersion: CONTRACT_VERSION,
        tick: nextTick,
        seed: previous.seed,
        paused: false,
      });
      const nextEvents = resultEvents?.map(cloneEvent);

      this.previousState = previous;
      this.currentState = nextState;
      if (nextEvents) {
        this.pendingEvents.push(...nextEvents);
      }
    } catch (error) {
      this.rng.restore(rngSnapshot);
      this.pendingEvents.splice(eventCount);
      if (queuedInput) this.inputQueue.unshift(queuedInput);
      throw error;
    }

    return this.drainEvents();
  }

  snapshot(alpha: number): RenderSnapshot {
    const interpolationAlpha = clampAlpha(alpha);
    const actors = [...this.currentState.actors.values()]
      .sort((left, right) => left.id - right.id)
      .map((actor) =>
        interpolateActor(
          this.previousState.actors.get(actor.id),
          actor,
          interpolationAlpha,
        ),
      );
    const vehicles = [...this.currentState.vehicles.values()]
      .sort((left, right) => left.id - right.id)
      .map((vehicle) =>
        interpolateVehicle(
          this.previousState.vehicles.get(vehicle.id),
          vehicle,
          interpolationAlpha,
        ),
      );

    return Object.freeze({
      previousTick: this.previousState.tick,
      currentTick: this.currentState.tick,
      alpha: interpolationAlpha,
      actors: Object.freeze(actors),
      vehicles: Object.freeze(vehicles),
      heat: cloneHeat(this.currentState.heat),
      mission: cloneMission(this.currentState.mission),
      cash: this.currentState.cash,
    });
  }

  save(): SaveGameV1 {
    const player = this.currentState.actors.get(this.currentState.playerId);
    if (!player) {
      throw new Error(
        `Cannot save: player ${this.currentState.playerId} is missing`,
      );
    }

    const savedPlayer = Object.freeze({
      health: player.health,
      pose: clonePose(player.pose),
      ...(player.equippedWeaponId
        ? { equippedWeaponId: player.equippedWeaponId }
        : {}),
    });

    return Object.freeze({
      version: 1,
      contractVersion: CONTRACT_VERSION,
      seed: this.currentState.seed,
      checkpointId: this.currentState.checkpointId,
      mission: cloneMission(this.currentState.mission),
      player: savedPlayer,
      cash: this.currentState.cash,
      inventory: Object.freeze([...this.currentState.inventory].sort()),
    });
  }

  hash(): string {
    return hashGameState(this.currentState);
  }
}

export function createGameRuntime(
  initialState: GameState,
  step?: RuntimeStep,
): DeterministicGameRuntime;
export function createGameRuntime(
  options: GameRuntimeOptions,
): DeterministicGameRuntime;
export function createGameRuntime(
  initialStateOrOptions: GameState | GameRuntimeOptions,
  step?: RuntimeStep,
): DeterministicGameRuntime {
  if ("initialState" in initialStateOrOptions) {
    return new DeterministicGameRuntime(initialStateOrOptions);
  }

  return new DeterministicGameRuntime(initialStateOrOptions, step);
}
