import { describe, expect, it } from "vitest";

import { CONTRACT_VERSION } from "../core/contracts";
import type {
  ActorState,
  GameEvent,
  GameState,
  MissionDefinition,
  ObjectiveTrigger,
  Vec3,
  VehicleState,
} from "../core/contracts";
import { createAfterlightJob } from "./afterlight-job";
import {
  createMissionProgress,
  createMissionReducerState,
  evaluateObjectiveTrigger,
  reduceMissionState,
  restoreMissionState,
} from "./reducer";

const PLAYER_ID = 1;
const HERO_VEHICLE_ID = 10;

function actor(position: Vec3 = [0, 0, 0]): ActorState {
  return {
    id: PLAYER_ID,
    kind: "player",
    faction: "player",
    pose: { position, rotationY: 0 },
    velocity: [0, 0, 0],
    health: 100,
    life: "alive",
  };
}

function vehicle(position: Vec3 = [0, 0, 0]): VehicleState {
  return {
    id: HERO_VEHICLE_ID,
    kind: "hero",
    pose: { position, rotationY: 0 },
    velocity: [0, 0, 0],
    health: 100,
    life: "active",
  };
}

function gameState(
  definition: MissionDefinition,
  overrides: Partial<GameState> = {},
): GameState {
  const base: GameState = {
    contractVersion: CONTRACT_VERSION,
    tick: 0,
    seed: 2407,
    paused: false,
    playerId: PLAYER_ID,
    actors: new Map([[PLAYER_ID, actor()]]),
    vehicles: new Map([[HERO_VEHICLE_ID, vehicle()]]),
    weapons: new Map(),
    inventory: new Set(),
    heat: {
      value: 0,
      wantedLevel: 0,
      mode: "patrol",
      unseenTicks: 0,
    },
    mission: createMissionProgress(definition, 0),
    cash: 0,
    checkpointId: "mission:start",
  };
  return { ...base, ...overrides };
}

function atTick(state: GameState, tick: number): GameState {
  return { ...state, tick };
}

function withPlayerAt(
  state: GameState,
  position: Vec3,
  tick: number,
): GameState {
  return {
    ...state,
    tick,
    actors: new Map([[PLAYER_ID, actor(position)]]),
  };
}

function interaction(tick: number, tag: string): GameEvent {
  return {
    type: "interaction",
    tick,
    actorId: PLAYER_ID,
    tag,
  };
}

function reducerDefinition(): MissionDefinition {
  return {
    id: "reducer-test",
    title: "Reducer Test",
    phases: [
      {
        id: "opening",
        chapter: "Opening",
        location: "Garage",
        checkpointAfter: "checkpoint:escape",
        onEnterEvents: [
          {
            type: "setpiece-triggered",
            tick: 0,
            setpieceId: "opening:enter",
          },
        ],
        objectives: [
          {
            id: "tag-two-targets",
            label: "Tag two targets.",
            trigger: {
              type: "event",
              event: "interaction",
              tag: "target",
              count: 2,
            },
            reward: 100,
          },
          {
            id: "take-bonus",
            label: "Take the bonus.",
            trigger: { type: "inventory", itemId: "bonus" },
            optional: true,
            reward: 25,
          },
          {
            id: "missable-bonus",
            label: "Find the hidden cache.",
            trigger: { type: "inventory", itemId: "hidden-cache" },
            optional: true,
            reward: 999,
          },
          {
            id: "escape",
            label: "Escape.",
            trigger: {
              type: "event",
              event: "interaction",
              tag: "escape",
            },
            reward: 200,
          },
        ],
      },
      {
        id: "finish",
        chapter: "Finish",
        location: "Safehouse",
        onEnterEvents: [
          {
            type: "setpiece-triggered",
            tick: 0,
            setpieceId: "finish:enter",
          },
        ],
        objectives: [
          {
            id: "cool-down",
            label: "Lose the pursuit.",
            trigger: { type: "heat-mode", mode: "return" },
            reward: 300,
          },
        ],
      },
    ],
  };
}

const triggerDefinition: MissionDefinition = {
  id: "trigger-test",
  title: "Trigger Test",
  phases: [
    {
      id: "only",
      chapter: "Only",
      location: "Test",
      objectives: [
        {
          id: "placeholder",
          label: "Placeholder",
          trigger: { type: "elapsed", ticks: 1 },
          reward: 0,
        },
      ],
    },
  ],
};

describe("mission trigger evaluation", () => {
  it("accumulates tagged event counts and maps item ids to event tags", () => {
    const trigger = {
      type: "event",
      event: "interaction",
      tag: "panel",
      count: 2,
    } as const satisfies ObjectiveTrigger;
    let state = gameState(triggerDefinition);

    const first = evaluateObjectiveTrigger(trigger, {
      state: atTick(state, 1),
      events: [interaction(1, "panel"), interaction(1, "wrong-panel")],
      startedAtTick: 0,
    });
    expect(first.satisfied).toBe(false);
    expect(first.triggerState.eventCount).toBe(1);

    const second = evaluateObjectiveTrigger(
      trigger,
      {
        state: atTick(state, 2),
        events: [interaction(2, "panel")],
        startedAtTick: 0,
      },
      first.triggerState,
    );
    expect(second.satisfied).toBe(true);
    expect(second.triggerState.eventCount).toBe(2);

    state = { ...state, inventory: new Set(["vault-key"]) };
    const item = evaluateObjectiveTrigger(
      {
        type: "event",
        event: "item-collected",
        tag: "vault-key",
      },
      {
        state,
        events: [
          {
            type: "item-collected",
            tick: 2,
            actorId: PLAYER_ID,
            itemId: "vault-key",
          },
        ],
        startedAtTick: 0,
      },
    );
    expect(item.satisfied).toBe(true);
  });

  it("latches all/any children across inventory, heat, events, and elapsed ticks", () => {
    const trigger = {
      type: "all",
      children: [
        { type: "inventory", itemId: "credential" },
        {
          type: "any",
          children: [
            { type: "heat-mode", mode: "search" },
            {
              type: "event",
              event: "interaction",
              tag: "fallback",
            },
          ],
        },
        { type: "event", event: "interaction", tag: "armed" },
        { type: "elapsed", ticks: 2 },
      ],
    } as const satisfies ObjectiveTrigger;
    const initial = gameState(triggerDefinition, {
      tick: 10,
      inventory: new Set(["credential"]),
      heat: {
        value: 40,
        wantedLevel: 2,
        mode: "search",
        unseenTicks: 20,
      },
    });

    const waiting = evaluateObjectiveTrigger(trigger, {
      state: initial,
      events: [interaction(10, "armed")],
      startedAtTick: 10,
    });
    expect(waiting.satisfied).toBe(false);

    const later = evaluateObjectiveTrigger(
      trigger,
      {
        state: {
          ...initial,
          tick: 12,
          inventory: new Set(),
          heat: { ...initial.heat, mode: "patrol" },
        },
        events: [],
        startedAtTick: 10,
      },
      waiting.triggerState,
    );
    expect(later.satisfied).toBe(true);
    expect(
      later.triggerState.children?.every(({ satisfied }) => satisfied),
    ).toBe(true);
  });

  it("requires consecutive per-entity volume dwell and supports vehicles", () => {
    const playerTrigger = {
      type: "volume",
      center: [0, 0, 0],
      radius: 2,
      actor: "player",
      dwellTicks: 3,
    } as const satisfies ObjectiveTrigger;
    let state = gameState(triggerDefinition);
    let evaluation = evaluateObjectiveTrigger(playerTrigger, {
      state,
      events: [],
      startedAtTick: 0,
    });
    expect(evaluation.satisfied).toBe(false);

    state = withPlayerAt(state, [0, 0, 0], 1);
    evaluation = evaluateObjectiveTrigger(
      playerTrigger,
      { state, events: [], startedAtTick: 0 },
      evaluation.triggerState,
    );
    expect(evaluation.satisfied).toBe(false);

    state = withPlayerAt(state, [10, 0, 0], 2);
    evaluation = evaluateObjectiveTrigger(
      playerTrigger,
      { state, events: [], startedAtTick: 0 },
      evaluation.triggerState,
    );
    expect(evaluation.triggerState.dwellByEntity).toEqual({});

    for (const tick of [3, 4, 5]) {
      state = withPlayerAt(state, [0, 0, 0], tick);
      evaluation = evaluateObjectiveTrigger(
        playerTrigger,
        { state, events: [], startedAtTick: 0 },
        evaluation.triggerState,
      );
    }
    expect(evaluation.satisfied).toBe(true);
    expect(
      evaluation.triggerState.dwellByEntity?.[`actor:${PLAYER_ID}`]?.ticks,
    ).toBe(3);

    const hero = evaluateObjectiveTrigger(
      {
        type: "volume",
        center: [0, 0, 0],
        radius: 2,
        actor: "hero",
      },
      {
        state: gameState(triggerDefinition),
        events: [],
        startedAtTick: 0,
      },
    );
    expect(hero.satisfied).toBe(true);
  });
});

describe("mission state reduction", () => {
  it("orders required objectives, runs optionals concurrently, and transitions once", () => {
    const definition = reducerDefinition();
    let state = gameState(definition, {
      tick: 1,
      inventory: new Set(["bonus"]),
    });
    let reducerState = createMissionReducerState(definition, state);

    const first = reduceMissionState(
      definition,
      state,
      [interaction(1, "target"), interaction(1, "escape")],
      reducerState,
    );
    state = first.state;
    reducerState = first.reducerState;
    expect(state.mission.completedObjectiveIds).toEqual(["take-bonus"]);
    expect(state.cash).toBe(25);
    expect(first.events).toEqual([
      {
        type: "setpiece-triggered",
        tick: 1,
        setpieceId: "opening:enter",
      },
      {
        type: "objective-completed",
        tick: 1,
        missionId: definition.id,
        objectiveId: "take-bonus",
      },
    ]);

    const duplicate = reduceMissionState(
      definition,
      state,
      [interaction(1, "target"), interaction(1, "escape")],
      reducerState,
    );
    expect(duplicate.state).toBe(state);
    expect(duplicate.state.cash).toBe(25);
    expect(duplicate.events).toEqual([]);

    state = atTick(state, 2);
    const secondTarget = reduceMissionState(
      definition,
      state,
      [interaction(2, "target"), interaction(2, "escape")],
      reducerState,
    );
    state = secondTarget.state;
    reducerState = secondTarget.reducerState;
    expect(state.mission.completedObjectiveIds).toEqual([
      "take-bonus",
      "tag-two-targets",
    ]);
    expect(state.cash).toBe(125);
    expect(state.mission.phaseIndex).toBe(0);

    state = atTick(state, 3);
    const noCarriedEvent = reduceMissionState(
      definition,
      state,
      [],
      reducerState,
    );
    state = noCarriedEvent.state;
    reducerState = noCarriedEvent.reducerState;
    expect(state.mission.completedObjectiveIds).not.toContain("escape");

    state = atTick(state, 4);
    const escaped = reduceMissionState(
      definition,
      state,
      [interaction(4, "escape")],
      reducerState,
    );
    expect(escaped.state.cash).toBe(325);
    expect(escaped.state.mission.phaseIndex).toBe(1);
    expect(escaped.state.mission.completedObjectiveIds).not.toContain(
      "missable-bonus",
    );
    expect(escaped.state.mission.completedCheckpointIds).toEqual([
      "checkpoint:escape",
    ]);
    expect(escaped.state.checkpointId).toBe("checkpoint:escape");
    expect(escaped.events).toEqual([
      {
        type: "objective-completed",
        tick: 4,
        missionId: definition.id,
        objectiveId: "escape",
      },
      {
        type: "checkpoint-reached",
        tick: 4,
        checkpointId: "checkpoint:escape",
      },
      {
        type: "setpiece-triggered",
        tick: 4,
        setpieceId: "finish:enter",
      },
    ]);
  });

  it("fails terminally, restores transient state, and does not repay objectives", () => {
    const definition = reducerDefinition();
    let state = gameState(definition);
    let reducerState = createMissionReducerState(definition, state);

    state = atTick(state, 1);
    let result = reduceMissionState(
      definition,
      state,
      [interaction(1, "target")],
      reducerState,
    );
    state = atTick(result.state, 2);
    reducerState = result.reducerState;
    result = reduceMissionState(
      definition,
      state,
      [interaction(2, "target")],
      reducerState,
    );
    expect(result.state.cash).toBe(100);

    state = atTick(result.state, 3);
    reducerState = result.reducerState;
    const failed = reduceMissionState(definition, state, [], reducerState, {
      fail: true,
    });
    expect(failed.state.mission.failed).toBe(true);

    const blocked = reduceMissionState(
      definition,
      atTick(failed.state, 4),
      [interaction(4, "escape")],
      failed.reducerState,
    );
    expect(blocked.state.cash).toBe(100);
    expect(blocked.state.mission.completedObjectiveIds).not.toContain("escape");

    const restored = restoreMissionState(definition, blocked.state);
    expect(restored.state.mission.failed).toBe(false);
    expect(restored.state.cash).toBe(100);
    expect(restored.reducerState.objectives).toEqual({});

    const resumed = reduceMissionState(
      definition,
      atTick(restored.state, 5),
      [interaction(5, "escape")],
      restored.reducerState,
    );
    expect(resumed.state.cash).toBe(300);
    expect(resumed.state.mission.completedObjectiveIds).toEqual([
      "tag-two-targets",
      "escape",
    ]);
    expect(
      resumed.events.filter((event) => event.type === "objective-completed"),
    ).toHaveLength(1);
  });

  it("completes the final phase and keeps rewards idempotent", () => {
    const definition = reducerDefinition();
    const progress = {
      ...createMissionProgress(definition, 0),
      phaseIndex: 1,
      completedObjectiveIds: ["tag-two-targets", "escape"],
      completedCheckpointIds: ["checkpoint:escape"],
    };
    const state = gameState(definition, {
      tick: 10,
      mission: progress,
      cash: 300,
      checkpointId: "checkpoint:escape",
      heat: {
        value: 5,
        wantedLevel: 0,
        mode: "return",
        unseenTicks: 100,
      },
    });
    const reducerState = createMissionReducerState(definition, state);

    const completed = reduceMissionState(definition, state, [], reducerState);
    expect(completed.state.mission.completed).toBe(true);
    expect(completed.state.mission.failed).toBe(false);
    expect(completed.state.mission.phaseIndex).toBe(1);
    expect(completed.state.cash).toBe(600);

    const repeated = reduceMissionState(
      definition,
      atTick(completed.state, 11),
      [],
      completed.reducerState,
    );
    expect(repeated.state.cash).toBe(600);
    expect(repeated.events).toEqual([]);
  });

  it("accepts every seeded Afterlight definition without mission-specific logic", () => {
    const encounters = new Set<string>();

    for (const seed of [-1, 0, 1, 2407]) {
      const definition = createAfterlightJob(seed);
      encounters.add(definition.encounter.id);
      const state = gameState(definition, { seed });
      const reducerState = createMissionReducerState(definition, state);
      const result = reduceMissionState(definition, state, [], reducerState);

      expect(result.state.mission.missionId).toBe(definition.id);
      expect(result.reducerState.missionId).toBe(definition.id);
      for (const event of definition.phases[0]?.onEnterEvents ?? []) {
        expect(result.events).toContainEqual({ ...event, tick: state.tick });
      }
    }

    expect(encounters.size).toBeGreaterThan(1);
  });
});
