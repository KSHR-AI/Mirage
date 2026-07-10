import { describe, expect, it } from "vitest";
import {
  AFTERLIGHT_ITEMS,
  AFTERLIGHT_OBJECTIVE_IDS,
} from "../missions/afterlight-job";
import { EMPTY_INPUT_FRAME } from "./contracts";
import {
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_CHECKPOINTS,
  createInitialAfterlightState,
} from "./afterlight-state";
import {
  createAfterlightStep,
  restoreAfterlightCheckpointState,
} from "./afterlight-step";
import { createGameRuntime } from "./runtime";

function input(
  values: Partial<typeof EMPTY_INPUT_FRAME>,
): typeof EMPTY_INPUT_FRAME {
  return { ...EMPTY_INPUT_FRAME, ...values };
}

describe("Afterlight step", () => {
  it("turns entering the hero coupe into the first mission objective", () => {
    const initial = createInitialAfterlightState();
    const runtime = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed),
    );

    runtime.command(input({ interactPressed: true }));
    const events = runtime.advance();

    expect(
      runtime.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe)?.occupiedBy,
    ).toBe(AFTERLIGHT_ENTITY_IDS.player);
    expect(runtime.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "objective-completed",
        objectiveId: AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
      }),
    );
  });

  it("completes the driving lesson once the coupe reaches speed", () => {
    const initial = createInitialAfterlightState();
    const runtime = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed),
    );
    runtime.command(input({ interactPressed: true }));
    runtime.advance();

    for (let tick = 0; tick < 150; tick += 1) {
      runtime.command(input({ throttle: 1 }));
      runtime.advance();
    }

    expect(runtime.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.learnDriving,
    );
  });

  it("fires the Signal-9 through the shared physics query", () => {
    const initial = createInitialAfterlightState();
    const actors = new Map(initial.actors);
    const player = actors.get(initial.playerId);
    if (!player) throw new Error("missing player fixture");
    actors.set(initial.playerId, {
      ...player,
      pose: { position: [66, 1.15, 44], rotationY: Math.PI },
    });
    const runtime = createGameRuntime(
      { ...initial, actors },
      createAfterlightStep(initial.seed),
    );

    runtime.command(input({ firePressed: true, aim: true }));
    runtime.advance();

    expect(
      runtime.state.actors.get(AFTERLIGHT_ENTITY_IDS.keyholderGuardA)?.health,
    ).toBe(56);
    expect(runtime.state.weapons.get("signal-9")?.magazine).toBe(23);
  });

  it("produces identical hashes for identical commands", () => {
    const initial = createInitialAfterlightState(2407);
    const first = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed),
    );
    const second = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed),
    );
    const commands = [
      input({ interactPressed: true }),
      ...Array.from({ length: 80 }, () => input({ throttle: 1, steer: 0.25 })),
      input({ brake: true }),
    ];

    for (const command of commands) {
      first.command(command);
      second.command(command);
      first.advance();
      second.advance();
    }

    expect(first.hash()).toBe(second.hash());
  });

  it("restores player and coupe at the current checkpoint", () => {
    const initial = createInitialAfterlightState();
    const actors = new Map(initial.actors);
    const player = actors.get(initial.playerId);
    if (!player) throw new Error("missing player fixture");
    actors.set(initial.playerId, { ...player, health: 0, life: "down" });
    const checkpointId = "afterlight:checkpoint:vault";
    const failed = {
      ...initial,
      actors,
      checkpointId,
      inventory: new Set([AFTERLIGHT_ITEMS.vaultCredential]),
      mission: { ...initial.mission, failed: true },
    };

    const restored = restoreAfterlightCheckpointState(failed);

    expect(restored.mission.failed).toBe(false);
    expect(restored.actors.get(restored.playerId)).toMatchObject({
      health: 100,
      life: "alive",
      pose: AFTERLIGHT_CHECKPOINTS[checkpointId].pose,
    });
    expect(restored.inventory.has(AFTERLIGHT_ITEMS.vaultCredential)).toBe(true);
  });
});
