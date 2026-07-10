import { describe, expect, it } from "vitest";
import type {
  GameEvent,
  PoliceMode,
  RenderSnapshot,
} from "../../core/contracts";
import {
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
  AFTERLIGHT_TAGS,
  createAfterlightJob,
} from "../../missions/afterlight-job";
import { AfterlightHudProgressTracker } from "./mission-progress";

const definition = createAfterlightJob(2407);

function phaseIndex(phaseId: string): number {
  return definition.phases.findIndex((phase) => phase.id === phaseId);
}

function snapshot(options: {
  readonly tick: number;
  readonly phaseId: string;
  readonly completedObjectiveIds?: readonly string[];
  readonly unseenTicks?: number;
  readonly heatMode?: PoliceMode;
}): RenderSnapshot {
  return {
    previousTick: Math.max(0, options.tick - 1),
    currentTick: options.tick,
    alpha: 1,
    actors: [],
    vehicles: [],
    heat: {
      value: 70,
      wantedLevel: 3,
      mode: options.heatMode ?? "pursue",
      unseenTicks: options.unseenTicks ?? 0,
    },
    mission: {
      missionId: definition.id,
      phaseIndex: phaseIndex(options.phaseId),
      completedObjectiveIds: options.completedObjectiveIds ?? [],
      completedCheckpointIds: [],
      completed: false,
      failed: false,
      startedAtTick: 0,
    },
    cash: 0,
  };
}

describe("Afterlight HUD objective progress", () => {
  it("does not invent elapsed progress without an observed start tick", () => {
    const tracker = new AfterlightHudProgressTracker();
    const objectiveProgress = tracker.sample(
      definition,
      snapshot({
        tick: 1_090,
        phaseId: AFTERLIGHT_PHASE_IDS.blackout,
        completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.primeBlackout],
      }),
    );

    expect(
      objectiveProgress[AFTERLIGHT_OBJECTIVE_IDS.holdBlackout],
    ).toBeUndefined();
  });

  it("anchors blackout timing to the exact setpiece event tick", () => {
    const tracker = new AfterlightHudProgressTracker();
    const blackoutStarted: GameEvent = {
      type: "setpiece-triggered",
      tick: 1_000,
      setpieceId: AFTERLIGHT_TAGS.blackoutTriggered,
    };
    const completed = [AFTERLIGHT_OBJECTIVE_IDS.primeBlackout];

    tracker.sample(
      definition,
      snapshot({
        tick: 1_000,
        phaseId: AFTERLIGHT_PHASE_IDS.blackout,
        completedObjectiveIds: completed,
      }),
      [blackoutStarted],
    );
    const objectiveProgress = tracker.sample(
      definition,
      snapshot({
        tick: 1_090,
        phaseId: AFTERLIGHT_PHASE_IDS.blackout,
        completedObjectiveIds: completed,
      }),
    );

    expect(objectiveProgress[AFTERLIGHT_OBJECTIVE_IDS.holdBlackout]).toEqual({
      current: 90,
      total: 180,
    });
  });

  it("maps bridge loss-of-sight ticks directly from the snapshot", () => {
    const tracker = new AfterlightHudProgressTracker();
    const objectiveProgress = tracker.sample(
      definition,
      snapshot({
        tick: 4_000,
        phaseId: AFTERLIGHT_PHASE_IDS.run,
        completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun],
        unseenTicks: 599,
      }),
    );

    expect(
      objectiveProgress[AFTERLIGHT_OBJECTIVE_IDS.escapeAfterlightRun],
    ).toEqual({
      current: 599,
      total: 600,
    });
  });

  it("accumulates explicit count gates and resets them between phases", () => {
    const tracker = new AfterlightHudProgressTracker();
    const disabled: GameEvent = {
      type: "vehicle-disabled",
      tick: 2_000,
      vehicleId: 301,
    };
    const blackout = snapshot({
      tick: 2_000,
      phaseId: AFTERLIGHT_PHASE_IDS.blackout,
      completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.primeBlackout],
    });

    const first = tracker.sample(definition, blackout, [disabled]);
    expect(first[AFTERLIGHT_OBJECTIVE_IDS.disableBackup]).toEqual({
      current: 1,
      total: 2,
    });

    const run = tracker.sample(
      definition,
      snapshot({
        tick: 2_001,
        phaseId: AFTERLIGHT_PHASE_IDS.run,
        completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun],
      }),
      [disabled],
    );
    expect(run[AFTERLIGHT_OBJECTIVE_IDS.breakInterceptors]).toEqual({
      current: 0,
      total: 2,
    });
    expect(Object.isFrozen(run)).toBe(true);
  });
});
