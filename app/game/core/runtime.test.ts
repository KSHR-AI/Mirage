import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  EMPTY_INPUT_FRAME,
  SIMULATION_DT,
} from "./contracts";
import type {
  ActorState,
  GameState,
  InputFrame,
  VehicleState,
} from "./contracts";
import {
  DeterministicGameRuntime,
  createGameRuntime,
  hashGameState,
  type RuntimeStep,
} from "./runtime";

function actor(id: number, x: number): ActorState {
  return {
    id,
    kind: id === 1 ? "player" : "civilian",
    faction: id === 1 ? "player" : "civilian",
    pose: { position: [x, 0, 0], rotationY: 0 },
    velocity: [0, 0, 0],
    health: 100,
    life: "alive",
    ...(id === 1 ? { equippedWeaponId: "service-pistol" } : {}),
  };
}

function vehicle(id: number, x: number): VehicleState {
  return {
    id,
    kind: "traffic",
    pose: { position: [x, 0, 0], rotationY: 0 },
    velocity: [0, 0, 0],
    health: 100,
    life: "active",
  };
}

function gameState(reverseCollections = false, seed = 90210): GameState {
  const actorEntries = [
    [1, actor(1, 0)],
    [2, actor(2, 20)],
  ] as const;
  const vehicleEntries = [
    [10, vehicle(10, 10)],
    [4, vehicle(4, 4)],
  ] as const;

  return {
    contractVersion: CONTRACT_VERSION,
    tick: 0,
    seed,
    paused: false,
    playerId: 1,
    actors: new Map(
      reverseCollections ? [...actorEntries].reverse() : actorEntries,
    ),
    vehicles: new Map(
      reverseCollections ? [...vehicleEntries].reverse() : vehicleEntries,
    ),
    weapons: new Map([
      [
        "service-pistol",
        {
          id: "service-pistol",
          magazine: 12,
          reserve: 36,
          cooldownTicks: 0,
        },
      ],
    ]),
    inventory: new Set(
      reverseCollections ? ["core", "badge"] : ["badge", "core"],
    ),
    heat: {
      value: 0,
      wantedLevel: 0,
      mode: "patrol",
      unseenTicks: 0,
    },
    mission: {
      missionId: "afterlight",
      phaseIndex: 0,
      completedObjectiveIds: [],
      completedCheckpointIds: [],
      completed: false,
      failed: false,
      startedAtTick: 0,
    },
    cash: 100,
    checkpointId: "start",
  };
}

function input(overrides: Partial<InputFrame> = {}): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    move: [...EMPTY_INPUT_FRAME.move],
    look: [...EMPTY_INPUT_FRAME.look],
    ...overrides,
  };
}

function movePlayer(state: GameState, distance: number): GameState {
  const player = state.actors.get(state.playerId) as ActorState;
  const actors = new Map(state.actors);
  actors.set(player.id, {
    ...player,
    pose: {
      position: [player.pose.position[0] + distance, 0, 0],
      rotationY: player.pose.rotationY,
    },
    velocity: [distance, 0, 0],
  });
  return { ...state, actors };
}

describe("deterministic game runtime", () => {
  it("consumes queued input FIFO at exactly one immutable tick per advance", () => {
    const initialState = gameState();
    const observed: Array<{ tick: number; dt: number; move: number }> = [];
    const step: RuntimeStep = (state, frame, context) => {
      observed.push({
        tick: context.tick,
        dt: context.dt,
        move: frame.move[0],
      });
      return movePlayer(state, frame.move[0]);
    };
    const runtime = createGameRuntime(initialState, step);
    const initialRuntimeState = runtime.state;
    const mutableMove: [number, number] = [3, 0];

    runtime.command(input({ move: mutableMove }));
    runtime.command(input({ move: [5, 0] }));
    mutableMove[0] = 99;

    runtime.advance();
    runtime.advance();

    expect(observed).toEqual([
      { tick: 1, dt: SIMULATION_DT, move: 3 },
      { tick: 2, dt: SIMULATION_DT, move: 5 },
    ]);
    expect(runtime.state.tick).toBe(2);
    expect(runtime.state.actors.get(1)?.pose.position[0]).toBe(8);
    expect(runtime.state).not.toBe(initialRuntimeState);
    expect(runtime.state.actors).not.toBe(initialRuntimeState.actors);
    expect(initialState.tick).toBe(0);
    expect(initialState.actors.get(1)?.pose.position[0]).toBe(0);
    expect(runtime.queuedInputCount).toBe(0);
    expect(() =>
      (runtime.state.actors as Map<number, ActorState>).set(3, actor(3, 3)),
    ).toThrow(/immutable/);
    expect(() =>
      (runtime.state.inventory as Set<string>).add("mutated"),
    ).toThrow(/immutable/);
  });

  it("toggles pause without advancing the tick, reducer, or RNG", () => {
    let stepCalls = 0;
    const step: RuntimeStep = (state, _frame, context) => {
      stepCalls += 1;
      return {
        ...state,
        cash: state.cash + context.random("loot").int(1, 100),
      };
    };
    const pausedRuntime = createGameRuntime(gameState(), step);
    const directRuntime = createGameRuntime(gameState(), step);

    pausedRuntime.command(input({ pausePressed: true }));
    pausedRuntime.advance();
    expect(pausedRuntime.state.paused).toBe(true);
    expect(pausedRuntime.state.tick).toBe(0);

    pausedRuntime.command(input({ move: [1, 0] }));
    pausedRuntime.advance();
    expect(pausedRuntime.state.tick).toBe(0);

    pausedRuntime.command(input({ pausePressed: true }));
    pausedRuntime.advance();
    expect(pausedRuntime.state.paused).toBe(false);
    expect(pausedRuntime.state.tick).toBe(0);

    pausedRuntime.advance();
    directRuntime.advance();

    expect(pausedRuntime.hash()).toBe(directRuntime.hash());
    expect(stepCalls).toBe(2);
  });

  it("drains emitted and returned events once in deterministic order", () => {
    const step: RuntimeStep = (state, _frame, context) => {
      context.emit({
        type: "interaction",
        tick: context.tick,
        actorId: state.playerId,
        tag: "door",
      });
      return {
        state,
        events: [
          {
            type: "checkpoint-reached",
            tick: context.tick,
            checkpointId: "garage",
          },
        ],
      };
    };
    const runtime = new DeterministicGameRuntime(gameState(), step);

    expect(runtime.advance().map((event) => event.type)).toEqual([
      "interaction",
      "checkpoint-reached",
    ]);
    expect(runtime.drainEvents()).toEqual([]);

    runtime.queueEvent({
      type: "item-collected",
      tick: runtime.state.tick,
      actorId: 1,
      itemId: "badge",
    });
    expect(runtime.drainEvents().map((event) => event.type)).toEqual([
      "item-collected",
    ]);
    expect(runtime.drainEvents()).toEqual([]);
  });

  it("interpolates sorted render snapshots between previous and current ticks", () => {
    const step: RuntimeStep = (state) => {
      const moved = movePlayer(state, 10);
      const vehicles = new Map(moved.vehicles);
      const currentVehicle = vehicles.get(4) as VehicleState;
      vehicles.set(4, {
        ...currentVehicle,
        pose: { position: [14, 0, 0], rotationY: Math.PI },
        velocity: [10, 0, 0],
      });
      return { ...moved, vehicles };
    };
    const runtime = createGameRuntime(gameState(), step);

    runtime.advance();
    const snapshot = runtime.snapshot(0.25);

    expect(snapshot.previousTick).toBe(0);
    expect(snapshot.currentTick).toBe(1);
    expect(snapshot.alpha).toBe(0.25);
    expect(snapshot.actors.map(({ id }) => id)).toEqual([1, 2]);
    expect(snapshot.vehicles.map(({ id }) => id)).toEqual([4, 10]);
    expect(snapshot.actors[0]?.pose.position[0]).toBe(2.5);
    expect(snapshot.actors[0]?.velocity[0]).toBe(2.5);
    expect(snapshot.vehicles[0]?.pose.position[0]).toBe(6.5);
    expect(runtime.snapshot(-1).alpha).toBe(0);
    expect(runtime.snapshot(Number.NaN).alpha).toBe(0);
    expect(runtime.snapshot(2).alpha).toBe(1);
  });

  it("emits a versioned, detached save with stable collection ordering", () => {
    const runtime = createGameRuntime(gameState(true));
    const save = runtime.save();

    expect(save.version).toBe(1);
    expect(save.contractVersion).toBe(CONTRACT_VERSION);
    expect(save.seed).toBe(90210);
    expect(save.player).toEqual({
      health: 100,
      pose: { position: [0, 0, 0], rotationY: 0 },
      equippedWeaponId: "service-pistol",
    });
    expect(save.inventory).toEqual(["badge", "core"]);
    expect(save.mission).not.toBe(runtime.state.mission);
    expect(Object.isFrozen(save)).toBe(true);
    expect(Object.isFrozen(save.inventory)).toBe(true);
  });

  it("hashes equivalent map and set insertion orders identically", () => {
    const forward = gameState(false);
    const reverse = gameState(true);

    expect(hashGameState(forward)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashGameState(forward)).toBe(hashGameState(reverse));
    expect(hashGameState({ ...reverse, cash: reverse.cash + 1 })).not.toBe(
      hashGameState(forward),
    );
  });

  it("replays RNG-backed state updates from the same seed", () => {
    const step: RuntimeStep = (state, _frame, context) => ({
      ...state,
      cash: state.cash + context.rng.stream("rewards").int(1, 20),
    });
    const first = createGameRuntime(gameState(false, 88), step);
    const second = createGameRuntime(gameState(true, 88), step);

    for (let tick = 0; tick < 120; tick += 1) {
      first.advance();
      second.advance();
    }

    expect(second.state.cash).toBe(first.state.cash);
    expect(second.hash()).toBe(first.hash());
  });
});
