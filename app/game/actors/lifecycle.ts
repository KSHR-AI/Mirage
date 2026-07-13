import type {
  ActorKind,
  ActorState,
  EntityId,
  GameEvent,
  Pose,
  Tick,
} from "../core/contracts";

const ACTOR_MAX_HEALTH: Readonly<Record<ActorKind, number>> = {
  player: 100,
  civilian: 60,
  guard: 90,
  police: 100,
};

export const ACTOR_LIFECYCLE_TUNING = {
  downedTicks: 90,
  respawnDelayTicks: 120,
} as const;

type CoreActorLifecycleEvent = Extract<
  GameEvent,
  { readonly type: "actor-damaged" | "actor-downed" }
>;

export type ActorLifecycleEvent =
  | CoreActorLifecycleEvent
  | {
      readonly type: "actor-died";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly sourceId?: EntityId;
    }
  | {
      readonly type: "actor-respawn-started";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly checkpointId: string;
      readonly readyAtTick: Tick;
    }
  | {
      readonly type: "actor-respawned";
      readonly tick: Tick;
      readonly actorId: EntityId;
      readonly checkpointId: string;
    };

export interface ActorDamageRequest {
  readonly tick: Tick;
  readonly actorId: EntityId;
  readonly amount: number;
  readonly sourceId?: EntityId;
}

export interface CheckpointSpawn {
  readonly checkpointId: string;
  readonly pose: Pose;
  readonly health?: number;
}

export interface CheckpointRespawnOutput {
  readonly checkpointId: string;
  readonly readyAtTick: Tick;
  readonly actor: ActorState;
}

export interface ActorLifecycleState {
  readonly actor: ActorState;
  readonly downedAtTick?: Tick;
  readonly deadAtTick?: Tick;
  readonly lastDamageSourceId?: EntityId;
  readonly pendingRespawn?: CheckpointRespawnOutput;
}

export interface ActorLifecycleResult {
  readonly state: ActorLifecycleState;
  readonly events: readonly ActorLifecycleEvent[];
  readonly respawn?: CheckpointRespawnOutput;
}

export interface BeginRespawnRequest {
  readonly tick: Tick;
  readonly checkpoint: CheckpointSpawn;
  readonly delayTicks?: number;
}

function assertTick(tick: Tick) {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError("tick must be a non-negative safe integer");
  }
}

function clonePose(pose: Pose): Pose {
  return {
    position: [pose.position[0], pose.position[1], pose.position[2]],
    rotationY: pose.rotationY,
  };
}

function isFinitePose(pose: Pose) {
  return (
    pose.position.every(Number.isFinite) && Number.isFinite(pose.rotationY)
  );
}

function sourceFields(sourceId: EntityId | undefined) {
  return sourceId === undefined ? {} : { sourceId };
}

export function createActorLifecycleState(
  actor: ActorState,
): ActorLifecycleState {
  return { actor };
}

export function applyActorDamage(
  state: ActorLifecycleState,
  request: ActorDamageRequest,
): ActorLifecycleResult {
  assertTick(request.tick);
  if (request.actorId !== state.actor.id) {
    throw new RangeError("damage actorId does not match lifecycle actor");
  }
  if (!Number.isFinite(request.amount) || request.amount < 0) {
    throw new RangeError("damage amount must be finite and non-negative");
  }
  if (!Number.isFinite(state.actor.health) || state.actor.health < 0) {
    throw new RangeError("actor health must be finite and non-negative");
  }
  if (request.amount === 0 || state.actor.life !== "alive") {
    return { state, events: [] };
  }

  const currentHealth = Math.max(0, state.actor.health);
  const amount = Math.min(currentHealth, request.amount);
  const health = currentHealth - amount;
  const downed = health === 0;
  const actor: ActorState = {
    ...state.actor,
    health,
    life: downed ? "down" : "alive",
  };
  const damageEvent: CoreActorLifecycleEvent = {
    type: "actor-damaged",
    tick: request.tick,
    actorId: actor.id,
    amount,
    ...sourceFields(request.sourceId),
  };

  if (!downed) {
    return {
      state: { ...state, actor, lastDamageSourceId: request.sourceId },
      events: [damageEvent],
    };
  }

  const downedEvent: CoreActorLifecycleEvent = {
    type: "actor-downed",
    tick: request.tick,
    actorId: actor.id,
    ...sourceFields(request.sourceId),
  };

  return {
    state: {
      actor,
      downedAtTick: request.tick,
      lastDamageSourceId: request.sourceId,
    },
    events: amount > 0 ? [damageEvent, downedEvent] : [downedEvent],
  };
}

export function advanceActorLifecycle(
  state: ActorLifecycleState,
  tick: Tick,
  downedTicks: number = ACTOR_LIFECYCLE_TUNING.downedTicks,
): ActorLifecycleResult {
  assertTick(tick);
  if (!Number.isSafeInteger(downedTicks) || downedTicks < 0) {
    throw new RangeError("downedTicks must be a non-negative safe integer");
  }

  if (
    state.actor.life === "down" &&
    state.downedAtTick !== undefined &&
    tick >= state.downedAtTick + downedTicks
  ) {
    const actor: ActorState = { ...state.actor, life: "dead", health: 0 };
    const event: ActorLifecycleEvent = {
      type: "actor-died",
      tick,
      actorId: actor.id,
      ...sourceFields(state.lastDamageSourceId),
    };
    return {
      state: { ...state, actor, deadAtTick: tick },
      events: [event],
    };
  }

  if (state.actor.life === "respawning" && state.pendingRespawn !== undefined) {
    const respawn = state.pendingRespawn;
    if (tick < respawn.readyAtTick) {
      return { state, events: [], respawn };
    }

    return {
      state: { actor: respawn.actor },
      events: [
        {
          type: "actor-respawned",
          tick,
          actorId: respawn.actor.id,
          checkpointId: respawn.checkpointId,
        },
      ],
      respawn,
    };
  }

  return { state, events: [] };
}

export function beginCheckpointRespawn(
  state: ActorLifecycleState,
  request: BeginRespawnRequest,
): ActorLifecycleResult {
  assertTick(request.tick);
  const delayTicks =
    request.delayTicks ?? ACTOR_LIFECYCLE_TUNING.respawnDelayTicks;
  if (!Number.isSafeInteger(delayTicks) || delayTicks < 0) {
    throw new RangeError("delayTicks must be a non-negative safe integer");
  }
  if (request.checkpoint.checkpointId.trim().length === 0) {
    throw new RangeError("checkpointId must not be empty");
  }
  if (!isFinitePose(request.checkpoint.pose)) {
    throw new RangeError("checkpoint pose must be finite");
  }
  if (state.actor.life === "respawning" && state.pendingRespawn) {
    return { state, events: [], respawn: state.pendingRespawn };
  }
  if (state.actor.life !== "dead") {
    return { state, events: [] };
  }

  const health =
    request.checkpoint.health ?? ACTOR_MAX_HEALTH[state.actor.kind];
  if (!Number.isFinite(health) || health <= 0) {
    throw new RangeError("respawn health must be finite and positive");
  }
  const readyAtTick = request.tick + delayTicks;
  assertTick(readyAtTick);
  const actor: ActorState = {
    ...state.actor,
    pose: clonePose(request.checkpoint.pose),
    velocity: [0, 0, 0],
    health,
    life: "alive",
  };
  const respawn: CheckpointRespawnOutput = {
    checkpointId: request.checkpoint.checkpointId,
    readyAtTick,
    actor,
  };

  return {
    state: {
      actor: { ...state.actor, life: "respawning", velocity: [0, 0, 0] },
      pendingRespawn: respawn,
    },
    events: [
      {
        type: "actor-respawn-started",
        tick: request.tick,
        actorId: state.actor.id,
        checkpointId: respawn.checkpointId,
        readyAtTick,
      },
    ],
    respawn,
  };
}
