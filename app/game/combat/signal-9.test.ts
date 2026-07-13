import { describe, expect, it } from "vitest";

import type {
  ActorState,
  EntityId,
  Faction,
  WeaponState,
} from "../core/contracts";
import {
  createSignal9State,
  SIGNAL_9_SPEC,
  stepSignal9,
  type Signal9Command,
} from "./signal-9";
import type {
  PhysicsQueryPort,
  PhysicsRaycastHit,
  PhysicsRaycastQuery,
} from "./physics-query";

function actor(id: EntityId, faction: Faction): ActorState {
  return {
    id,
    kind: faction === "player" ? "player" : "guard",
    faction,
    pose: { position: [0, 0, 0], rotationY: 0 },
    velocity: [0, 0, 0],
    health: 100,
    life: "alive",
    equippedWeaponId: SIGNAL_9_SPEC.id,
  };
}

const shooter = actor(1, "player");
const enemy = actor(2, "afterlight");
const friendly = actor(3, "player");
const actors = new Map([
  [shooter.id, shooter],
  [enemy.id, enemy],
  [friendly.id, friendly],
]);

function actorHit(entityId: EntityId, distance = 10): PhysicsRaycastHit {
  return {
    kind: "actor",
    entityId,
    distance,
    point: [0, 1, distance],
    normal: [0, 0, -1],
  };
}

const coverHit: PhysicsRaycastHit = {
  kind: "world",
  distance: 5,
  point: [0, 1, 5],
  normal: [0, 0, -1],
};

function recordingPort(hit: PhysicsRaycastHit | null = null) {
  const queries: PhysicsRaycastQuery[] = [];
  const physics: PhysicsQueryPort = {
    raycast(query) {
      queries.push(query);
      return hit;
    },
  };
  return { physics, queries };
}

function command(
  physics: PhysicsQueryPort,
  overrides: Partial<Signal9Command> = {},
): Signal9Command {
  return {
    tick: 0,
    ownerId: shooter.id,
    input: { firePressed: false, reloadPressed: false },
    origin: [0, 1, 0],
    direction: [0, 0, 1],
    actors,
    physics,
    ...overrides,
  };
}

describe("Signal-9 state", () => {
  it("creates one 24-round carbine with reserve ammunition", () => {
    expect(createSignal9State()).toEqual({
      id: "signal-9",
      magazine: 24,
      reserve: SIGNAL_9_SPEC.defaultReserve,
      cooldownTicks: 0,
    });
  });

  it("accepts deterministic starting ammo and rejects invalid state", () => {
    expect(createSignal9State({ magazine: 7, reserve: 2 })).toEqual({
      id: "signal-9",
      magazine: 7,
      reserve: 2,
      cooldownTicks: 0,
    });
    expect(() => createSignal9State({ magazine: 25 })).toThrow("capacity");
    expect(() => createSignal9State({ reserve: -1 })).toThrow("reserve");
  });
});

describe("Signal-9 cadence and reload", () => {
  it("fires immediately, consumes one round, and emits hostile damage", () => {
    const { physics, queries } = recordingPort(actorHit(enemy.id));
    const initial = createSignal9State();
    const result = stepSignal9(
      initial,
      command(physics, {
        tick: 10,
        input: { firePressed: true, reloadPressed: false },
      }),
    );

    expect(result.state).toEqual({
      ...initial,
      magazine: 23,
      cooldownTicks: SIGNAL_9_SPEC.cadenceTicks,
    });
    expect(result.events).toEqual([
      {
        type: "weapon-fired",
        tick: 10,
        actorId: shooter.id,
        weaponId: SIGNAL_9_SPEC.id,
        magazine: 23,
      },
    ]);
    expect(result.damage).toEqual({
      tick: 10,
      actorId: enemy.id,
      amount: SIGNAL_9_SPEC.damage,
      sourceId: shooter.id,
    });
    expect(result.shot?.damage).toBe(result.damage);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.maxDistance).toBe(SIGNAL_9_SPEC.range);
    expect(queries[0]?.excludeEntityIds).toEqual([shooter.id]);
    expect(initial.magazine).toBe(24);
  });

  it("enforces exact tick cadence under held fire", () => {
    const { physics, queries } = recordingPort(null);
    let state = createSignal9State();
    const firedAt: number[] = [];

    for (let tick = 0; tick <= SIGNAL_9_SPEC.cadenceTicks; tick += 1) {
      const result = stepSignal9(
        state,
        command(physics, {
          tick,
          input: { firePressed: true, reloadPressed: false },
        }),
      );
      if (result.shot) firedAt.push(tick);
      state = result.state;
    }

    expect(firedAt).toEqual([0, SIGNAL_9_SPEC.cadenceTicks]);
    expect(queries).toHaveLength(2);
    expect(state.magazine).toBe(22);
  });

  it("starts reload before fire and ignores fire until completion", () => {
    const { physics, queries } = recordingPort(actorHit(enemy.id));
    const started = stepSignal9(
      createSignal9State({ magazine: 5, reserve: 30 }),
      command(physics, {
        tick: 10,
        input: { firePressed: true, reloadPressed: true },
      }),
    );
    expect(started.state.reloadingUntilTick).toBe(
      10 + SIGNAL_9_SPEC.reloadTicks,
    );
    expect(started.events).toEqual([
      {
        type: "weapon-reload-started",
        tick: 10,
        actorId: shooter.id,
        weaponId: SIGNAL_9_SPEC.id,
        completesAtTick: 10 + SIGNAL_9_SPEC.reloadTicks,
      },
    ]);

    const blocked = stepSignal9(
      started.state,
      command(physics, {
        tick: 11,
        input: { firePressed: true, reloadPressed: false },
      }),
    );
    expect(blocked.shot).toBeUndefined();
    expect(blocked.state.magazine).toBe(5);
    expect(queries).toHaveLength(0);

    const completed = stepSignal9(
      blocked.state,
      command(physics, { tick: 10 + SIGNAL_9_SPEC.reloadTicks }),
    );
    expect(completed.state).toEqual({
      id: SIGNAL_9_SPEC.id,
      magazine: 24,
      reserve: 11,
      cooldownTicks: 0,
    });
    expect(completed.events).toEqual([
      {
        type: "weapon-reloaded",
        tick: 10 + SIGNAL_9_SPEC.reloadTicks,
        actorId: shooter.id,
        weaponId: SIGNAL_9_SPEC.id,
        roundsLoaded: 19,
      },
    ]);
  });

  it("reloads to an unlocked extended magazine capacity", () => {
    const { physics } = recordingPort();
    const started = stepSignal9(
      createSignal9State({
        magazine: 24,
        magazineCapacity: 36,
        reserve: 24,
      }),
      command(physics, {
        tick: 5,
        input: { firePressed: false, reloadPressed: true },
      }),
    );
    const completed = stepSignal9(
      started.state,
      command(physics, { tick: 5 + SIGNAL_9_SPEC.reloadTicks }),
    );

    expect(completed.state).toMatchObject({
      magazine: 36,
      magazineCapacity: 36,
      reserve: 12,
    });
    expect(completed.events[0]).toMatchObject({
      type: "weapon-reloaded",
      roundsLoaded: 12,
    });
  });

  it("loads only available reserve rounds", () => {
    const { physics } = recordingPort();
    const started = stepSignal9(
      createSignal9State({ magazine: 20, reserve: 2 }),
      command(physics, {
        tick: 1,
        input: { firePressed: false, reloadPressed: true },
      }),
    );
    const completed = stepSignal9(
      started.state,
      command(physics, { tick: 1 + SIGNAL_9_SPEC.reloadTicks }),
    );

    expect(completed.state.magazine).toBe(22);
    expect(completed.state.reserve).toBe(0);
    expect(completed.events[0]).toMatchObject({
      type: "weapon-reloaded",
      roundsLoaded: 2,
    });
  });

  it("can fire on the exact reload-completion tick", () => {
    const { physics, queries } = recordingPort(null);
    const reloading: WeaponState = {
      id: SIGNAL_9_SPEC.id,
      magazine: 0,
      reserve: 24,
      cooldownTicks: 0,
      reloadingUntilTick: 50,
    };
    const result = stepSignal9(
      reloading,
      command(physics, {
        tick: 50,
        input: { firePressed: true, reloadPressed: false },
      }),
    );

    expect(result.state.magazine).toBe(23);
    expect(result.state.reserve).toBe(0);
    expect(result.state.reloadingUntilTick).toBeUndefined();
    expect(result.events.map((event) => event.type)).toEqual([
      "weapon-reloaded",
      "weapon-fired",
    ]);
    expect(queries).toHaveLength(1);
  });

  it("dry-fires an empty magazine without spending reserve or raycasting", () => {
    const { physics, queries } = recordingPort();
    const initial = createSignal9State({ magazine: 0, reserve: 24 });
    const result = stepSignal9(
      initial,
      command(physics, {
        tick: 5,
        input: { firePressed: true, reloadPressed: false },
      }),
    );

    expect(result.state).toEqual(initial);
    expect(result.events).toEqual([
      {
        type: "weapon-dry-fired",
        tick: 5,
        actorId: shooter.id,
        weaponId: SIGNAL_9_SPEC.id,
      },
    ]);
    expect(queries).toHaveLength(0);
  });

  it("does not reload a full magazine or act for a dead owner", () => {
    const { physics, queries } = recordingPort();
    const full = createSignal9State();
    expect(
      stepSignal9(
        full,
        command(physics, {
          input: { firePressed: false, reloadPressed: true },
        }),
      ),
    ).toEqual({ state: full, events: [] });

    const deadActors = new Map(actors);
    deadActors.set(shooter.id, { ...shooter, life: "dead" });
    const blocked = stepSignal9(
      createSignal9State({ magazine: 1, reserve: 1 }),
      command(physics, {
        actors: deadActors,
        input: { firePressed: true, reloadPressed: true },
      }),
    );
    expect(blocked.shot).toBeUndefined();
    expect(blocked.events).toEqual([]);
    expect(queries).toHaveLength(0);
  });
});

describe("Signal-9 cover and faction resolution", () => {
  it("stops at world cover without producing through-wall damage", () => {
    const { physics, queries } = recordingPort(coverHit);
    const result = stepSignal9(
      createSignal9State(),
      command(physics, {
        input: { firePressed: true, reloadPressed: false },
      }),
    );

    expect(result.shot?.trace.hit).toEqual(coverHit);
    expect(result.damage).toBeUndefined();
    expect(queries).toHaveLength(1);
  });

  it("lets a friendly actor block the ray without taking damage", () => {
    const { physics } = recordingPort(actorHit(friendly.id));
    const result = stepSignal9(
      createSignal9State(),
      command(physics, {
        input: { firePressed: true, reloadPressed: false },
      }),
    );

    expect(result.shot?.trace.hit?.entityId).toBe(friendly.id);
    expect(result.damage).toBeUndefined();
  });

  it("does not damage missing or non-alive hit actors", () => {
    const missing = recordingPort(actorHit(999));
    expect(
      stepSignal9(
        createSignal9State(),
        command(missing.physics, {
          input: { firePressed: true, reloadPressed: false },
        }),
      ).damage,
    ).toBeUndefined();

    const downActors = new Map(actors);
    downActors.set(enemy.id, { ...enemy, life: "down" });
    const down = recordingPort(actorHit(enemy.id));
    expect(
      stepSignal9(
        createSignal9State(),
        command(down.physics, {
          actors: downActors,
          input: { firePressed: true, reloadPressed: false },
        }),
      ).damage,
    ).toBeUndefined();
  });

  it("treats an adapter hit beyond weapon range as a miss", () => {
    const { physics } = recordingPort(
      actorHit(enemy.id, SIGNAL_9_SPEC.range + 0.01),
    );
    const result = stepSignal9(
      createSignal9State(),
      command(physics, {
        input: { firePressed: true, reloadPressed: false },
      }),
    );

    expect(result.shot?.trace.hit).toBeUndefined();
    expect(result.damage).toBeUndefined();
  });

  it("rejects invalid aim without mutating weapon state", () => {
    const { physics, queries } = recordingPort();
    const initial = createSignal9State();
    expect(() =>
      stepSignal9(
        initial,
        command(physics, {
          direction: [0, 0, 0],
          input: { firePressed: true, reloadPressed: false },
        }),
      ),
    ).toThrow("non-zero");
    expect(initial.magazine).toBe(24);
    expect(queries).toHaveLength(0);
  });
});
