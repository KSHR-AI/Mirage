import { describe, expect, it } from "vitest";

import type { ActorState } from "../core/contracts";
import {
  ACTOR_LIFECYCLE_TUNING,
  advanceActorLifecycle,
  applyActorDamage,
  beginCheckpointRespawn,
  createActorLifecycleState,
} from "./lifecycle";

const actor: ActorState = {
  id: 1,
  kind: "player",
  faction: "player",
  pose: { position: [1, 2, 3], rotationY: 0.25 },
  velocity: [4, 5, 6],
  health: 100,
  life: "alive",
  equippedWeaponId: "signal-9",
};

function downActor(tick = 10) {
  return applyActorDamage(createActorLifecycleState(actor), {
    tick,
    actorId: actor.id,
    amount: 100,
    sourceId: 9,
  }).state;
}

function deadActor(tick = 10) {
  return advanceActorLifecycle(
    downActor(tick),
    tick + ACTOR_LIFECYCLE_TUNING.downedTicks,
  ).state;
}

describe("actor damage and life", () => {
  it("applies nonlethal damage without mutating the contract actor", () => {
    const initial = createActorLifecycleState(actor);
    const result = applyActorDamage(initial, {
      tick: 5,
      actorId: actor.id,
      amount: 25,
      sourceId: 9,
    });

    expect(result.state.actor).toEqual({ ...actor, health: 75 });
    expect(result.events).toEqual([
      {
        type: "actor-damaged",
        tick: 5,
        actorId: actor.id,
        amount: 25,
        sourceId: 9,
      },
    ]);
    expect(actor.health).toBe(100);
    expect(initial.actor).toBe(actor);
  });

  it("clamps lethal damage and emits damage before down", () => {
    const result = applyActorDamage(createActorLifecycleState(actor), {
      tick: 10,
      actorId: actor.id,
      amount: 500,
      sourceId: 9,
    });

    expect(result.state.actor.health).toBe(0);
    expect(result.state.actor.life).toBe("down");
    expect(result.state.downedAtTick).toBe(10);
    expect(result.events).toEqual([
      {
        type: "actor-damaged",
        tick: 10,
        actorId: actor.id,
        amount: 100,
        sourceId: 9,
      },
      { type: "actor-downed", tick: 10, actorId: actor.id, sourceId: 9 },
    ]);
  });

  it("ignores zero damage and actors that are no longer alive", () => {
    const initial = createActorLifecycleState(actor);
    expect(
      applyActorDamage(initial, {
        tick: 1,
        actorId: actor.id,
        amount: 0,
      }),
    ).toEqual({ state: initial, events: [] });

    const down = downActor();
    expect(
      applyActorDamage(down, {
        tick: 11,
        actorId: actor.id,
        amount: 10,
      }),
    ).toEqual({ state: down, events: [] });
  });

  it("rejects malformed damage commands", () => {
    const initial = createActorLifecycleState(actor);
    expect(() =>
      applyActorDamage(initial, {
        tick: 1,
        actorId: 2,
        amount: 10,
      }),
    ).toThrow("damage actorId");
    expect(() =>
      applyActorDamage(initial, {
        tick: 1,
        actorId: actor.id,
        amount: -1,
      }),
    ).toThrow("damage amount");
    expect(() =>
      applyActorDamage(initial, {
        tick: Number.NaN,
        actorId: actor.id,
        amount: 1,
      }),
    ).toThrow("tick");
    expect(() =>
      applyActorDamage(
        createActorLifecycleState({ ...actor, health: Number.NaN }),
        { tick: 1, actorId: actor.id, amount: 1 },
      ),
    ).toThrow("actor health");
  });

  it("transitions from down to dead on the exact boundary tick", () => {
    const down = downActor(10);
    const early = advanceActorLifecycle(
      down,
      10 + ACTOR_LIFECYCLE_TUNING.downedTicks - 1,
    );
    expect(early).toEqual({ state: down, events: [] });

    const dead = advanceActorLifecycle(
      down,
      10 + ACTOR_LIFECYCLE_TUNING.downedTicks,
    );
    expect(dead.state.actor.life).toBe("dead");
    expect(dead.state.deadAtTick).toBe(10 + ACTOR_LIFECYCLE_TUNING.downedTicks);
    expect(dead.events).toEqual([
      {
        type: "actor-died",
        tick: 10 + ACTOR_LIFECYCLE_TUNING.downedTicks,
        actorId: actor.id,
        sourceId: 9,
      },
    ]);
  });

  it("supports a deterministic custom down duration", () => {
    const result = advanceActorLifecycle(downActor(10), 10, 0);
    expect(result.state.actor.life).toBe("dead");
  });
});

describe("checkpoint respawn", () => {
  it("returns a checkpoint-ready actor and enters respawning state", () => {
    const mutablePosition: [number, number, number] = [20, 1, -5];
    const result = beginCheckpointRespawn(deadActor(), {
      tick: 200,
      checkpoint: {
        checkpointId: "afterlight:vault",
        pose: { position: mutablePosition, rotationY: 1.5 },
      },
    });
    mutablePosition[0] = 999;

    expect(result.state.actor.life).toBe("respawning");
    expect(result.state.actor.velocity).toEqual([0, 0, 0]);
    expect(result.respawn).toEqual({
      checkpointId: "afterlight:vault",
      readyAtTick: 200 + ACTOR_LIFECYCLE_TUNING.respawnDelayTicks,
      actor: {
        ...actor,
        pose: { position: [20, 1, -5], rotationY: 1.5 },
        velocity: [0, 0, 0],
        health: 100,
        life: "alive",
      },
    });
    expect(result.events).toEqual([
      {
        type: "actor-respawn-started",
        tick: 200,
        actorId: actor.id,
        checkpointId: "afterlight:vault",
        readyAtTick: 200 + ACTOR_LIFECYCLE_TUNING.respawnDelayTicks,
      },
    ]);
  });

  it("holds until ready and completes on the exact ready tick", () => {
    const started = beginCheckpointRespawn(deadActor(), {
      tick: 200,
      delayTicks: 5,
      checkpoint: {
        checkpointId: "garage",
        pose: { position: [0, 0, 0], rotationY: 0 },
      },
    });

    const early = advanceActorLifecycle(started.state, 204);
    expect(early.state).toBe(started.state);
    expect(early.events).toEqual([]);
    expect(early.respawn).toBe(started.respawn);

    const complete = advanceActorLifecycle(started.state, 205);
    expect(complete.state).toEqual({ actor: started.respawn?.actor });
    expect(complete.events).toEqual([
      {
        type: "actor-respawned",
        tick: 205,
        actorId: actor.id,
        checkpointId: "garage",
      },
    ]);
    expect(complete.state.pendingRespawn).toBeUndefined();
  });

  it("supports checkpoint-specific health and immediate respawn", () => {
    const started = beginCheckpointRespawn(deadActor(), {
      tick: 200,
      delayTicks: 0,
      checkpoint: {
        checkpointId: "clinic",
        pose: { position: [2, 0, 2], rotationY: 0 },
        health: 40,
      },
    });
    const completed = advanceActorLifecycle(started.state, 200);

    expect(completed.state.actor.health).toBe(40);
    expect(completed.state.actor.life).toBe("alive");
  });

  it("only starts from dead and is idempotent while respawning", () => {
    const alive = createActorLifecycleState(actor);
    const request = {
      tick: 200,
      checkpoint: {
        checkpointId: "garage",
        pose: { position: [0, 0, 0] as const, rotationY: 0 },
      },
    };
    expect(beginCheckpointRespawn(alive, request)).toEqual({
      state: alive,
      events: [],
    });

    const started = beginCheckpointRespawn(deadActor(), request);
    expect(beginCheckpointRespawn(started.state, request)).toEqual({
      state: started.state,
      events: [],
      respawn: started.respawn,
    });
  });

  it("rejects invalid checkpoint output", () => {
    const dead = deadActor();
    expect(() =>
      beginCheckpointRespawn(dead, {
        tick: 200,
        checkpoint: {
          checkpointId: "",
          pose: { position: [0, 0, 0], rotationY: 0 },
        },
      }),
    ).toThrow("checkpointId");
    expect(() =>
      beginCheckpointRespawn(dead, {
        tick: 200,
        checkpoint: {
          checkpointId: "garage",
          pose: { position: [0, 0, 0], rotationY: 0 },
          health: 0,
        },
      }),
    ).toThrow("respawn health");
    expect(() =>
      beginCheckpointRespawn(dead, {
        tick: 200,
        checkpoint: {
          checkpointId: "garage",
          pose: { position: [Number.NaN, 0, 0], rotationY: 0 },
        },
      }),
    ).toThrow("checkpoint pose");
  });
});
