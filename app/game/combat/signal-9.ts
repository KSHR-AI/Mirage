import type { ActorDamageRequest } from "../actors/lifecycle";
import type {
  ActorState,
  EntityId,
  InputFrame,
  Tick,
  Vec3,
  WeaponState,
} from "../core/contracts";
import { canActorDamage } from "./factions";
import {
  traceHitscan,
  type HitscanTrace,
  type PhysicsQueryPort,
} from "./physics-query";

export const SIGNAL_9_SPEC = {
  id: "signal-9",
  magazineCapacity: 24,
  defaultReserve: 72,
  cadenceTicks: 6,
  reloadTicks: 120,
  range: 120,
  damage: 34,
} as const;

export interface Signal9StateOptions {
  readonly magazine?: number;
  readonly magazineCapacity?: number;
  readonly reserve?: number;
}

export type Signal9Event =
  | {
      readonly type: "weapon-fired";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly weaponId: typeof SIGNAL_9_SPEC.id;
      readonly magazine: number;
    }
  | {
      readonly type: "weapon-dry-fired";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly weaponId: typeof SIGNAL_9_SPEC.id;
    }
  | {
      readonly type: "weapon-reload-started";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly weaponId: typeof SIGNAL_9_SPEC.id;
      readonly completesAtTick: Tick;
    }
  | {
      readonly type: "weapon-reloaded";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly weaponId: typeof SIGNAL_9_SPEC.id;
      readonly roundsLoaded: number;
    };

export interface Signal9Command {
  readonly tick: Tick;
  readonly ownerId: EntityId;
  readonly input: Pick<InputFrame, "firePressed" | "reloadPressed">;
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly actors: ReadonlyMap<EntityId, ActorState>;
  readonly physics: PhysicsQueryPort;
}

export interface Signal9Shot {
  readonly trace: HitscanTrace;
  readonly damage?: ActorDamageRequest;
}

export interface Signal9StepResult {
  readonly state: WeaponState;
  readonly events: readonly Signal9Event[];
  readonly shot?: Signal9Shot;
  readonly damage?: ActorDamageRequest;
}

function assertNonNegativeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertSignal9State(state: WeaponState) {
  if (state.id !== SIGNAL_9_SPEC.id) {
    throw new RangeError(`expected ${SIGNAL_9_SPEC.id} weapon state`);
  }
  assertNonNegativeInteger(state.magazine, "magazine");
  const capacity = signal9MagazineCapacity(state);
  if (state.magazine > capacity) {
    throw new RangeError("magazine exceeds Signal-9 capacity");
  }
  assertNonNegativeInteger(state.reserve, "reserve");
  assertNonNegativeInteger(state.cooldownTicks, "cooldownTicks");
  if (state.reloadingUntilTick !== undefined) {
    assertNonNegativeInteger(state.reloadingUntilTick, "reloadingUntilTick");
  }
}

function withoutReload(state: WeaponState): WeaponState {
  return {
    id: state.id,
    magazine: state.magazine,
    ...(state.magazineCapacity !== undefined
      ? { magazineCapacity: state.magazineCapacity }
      : {}),
    reserve: state.reserve,
    cooldownTicks: state.cooldownTicks,
  };
}

function completeReload(state: WeaponState) {
  const roundsLoaded = Math.min(
    signal9MagazineCapacity(state) - state.magazine,
    state.reserve,
  );
  return {
    state: {
      ...withoutReload(state),
      magazine: state.magazine + roundsLoaded,
      reserve: state.reserve - roundsLoaded,
    },
    roundsLoaded,
  };
}

function damageForTrace(
  trace: HitscanTrace,
  command: Signal9Command,
): ActorDamageRequest | undefined {
  const source = command.actors.get(command.ownerId);
  const target =
    trace.hit?.kind === "actor" && trace.hit.entityId !== undefined
      ? command.actors.get(trace.hit.entityId)
      : undefined;
  if (!source || !target || !canActorDamage(source, target)) {
    return undefined;
  }

  return {
    tick: command.tick,
    actorId: target.id,
    amount: SIGNAL_9_SPEC.damage,
    sourceId: source.id,
  };
}

export function createSignal9State(
  options: Signal9StateOptions = {},
): WeaponState {
  const magazineCapacity =
    options.magazineCapacity ?? SIGNAL_9_SPEC.magazineCapacity;
  assertNonNegativeInteger(magazineCapacity, "magazineCapacity");
  if (magazineCapacity < SIGNAL_9_SPEC.magazineCapacity) {
    throw new RangeError("magazineCapacity cannot be below standard capacity");
  }
  const state: WeaponState = {
    id: SIGNAL_9_SPEC.id,
    magazine: options.magazine ?? magazineCapacity,
    ...(magazineCapacity !== SIGNAL_9_SPEC.magazineCapacity
      ? { magazineCapacity }
      : {}),
    reserve: options.reserve ?? SIGNAL_9_SPEC.defaultReserve,
    cooldownTicks: 0,
  };
  assertSignal9State(state);
  return state;
}

export function signal9MagazineCapacity(state: WeaponState): number {
  const capacity = state.magazineCapacity ?? SIGNAL_9_SPEC.magazineCapacity;
  assertNonNegativeInteger(capacity, "magazineCapacity");
  return capacity;
}

export function stepSignal9(
  state: WeaponState,
  command: Signal9Command,
): Signal9StepResult {
  assertSignal9State(state);
  assertNonNegativeInteger(command.tick, "tick");

  const events: Signal9Event[] = [];
  let next: WeaponState = {
    ...state,
    cooldownTicks: Math.max(0, state.cooldownTicks - 1),
  };

  if (next.reloadingUntilTick !== undefined) {
    if (command.tick < next.reloadingUntilTick) {
      return { state: next, events };
    }

    const completed = completeReload(next);
    next = completed.state;
    events.push({
      type: "weapon-reloaded",
      tick: command.tick,
      actorId: command.ownerId,
      weaponId: SIGNAL_9_SPEC.id,
      roundsLoaded: completed.roundsLoaded,
    });
  }

  const owner = command.actors.get(command.ownerId);
  if (!owner || owner.life !== "alive") {
    return { state: next, events };
  }

  if (
    command.input.reloadPressed &&
    next.magazine < signal9MagazineCapacity(next) &&
    next.reserve > 0
  ) {
    const completesAtTick = command.tick + SIGNAL_9_SPEC.reloadTicks;
    next = { ...next, reloadingUntilTick: completesAtTick };
    events.push({
      type: "weapon-reload-started",
      tick: command.tick,
      actorId: command.ownerId,
      weaponId: SIGNAL_9_SPEC.id,
      completesAtTick,
    });
    return { state: next, events };
  }

  if (!command.input.firePressed || next.cooldownTicks > 0) {
    return { state: next, events };
  }
  if (next.magazine === 0) {
    events.push({
      type: "weapon-dry-fired",
      tick: command.tick,
      actorId: command.ownerId,
      weaponId: SIGNAL_9_SPEC.id,
    });
    return { state: next, events };
  }

  next = {
    ...next,
    magazine: next.magazine - 1,
    cooldownTicks: SIGNAL_9_SPEC.cadenceTicks,
  };
  const trace = traceHitscan(command.physics, {
    origin: command.origin,
    direction: command.direction,
    maxDistance: SIGNAL_9_SPEC.range,
    sourceEntityId: command.ownerId,
  });
  const damage = damageForTrace(trace, command);
  const shot: Signal9Shot = damage ? { trace, damage } : { trace };
  events.push({
    type: "weapon-fired",
    tick: command.tick,
    actorId: command.ownerId,
    weaponId: SIGNAL_9_SPEC.id,
    magazine: next.magazine,
  });

  return damage
    ? { state: next, events, shot, damage }
    : { state: next, events, shot };
}

export const stepSignal9Weapon = stepSignal9;
