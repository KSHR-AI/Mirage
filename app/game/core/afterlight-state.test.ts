import { describe, expect, it } from "vitest";
import { SIGNAL_9_SPEC } from "../combat";
import {
  AFTERLIGHT_CHECKPOINT_IDS,
  AFTERLIGHT_JOB_ID,
} from "../missions/afterlight-job";
import {
  AFTERLIGHT_CHECKPOINTS,
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_START_CHECKPOINT_ID,
  afterlightCheckpoint,
  createInitialAfterlightState,
} from "./afterlight-state";
import { stableHash } from "./runtime";

describe("initial Afterlight state", () => {
  it("creates the canonical player, vehicles, weapon, and mission", () => {
    const state = createInitialAfterlightState();

    expect(state.playerId).toBe(AFTERLIGHT_ENTITY_IDS.player);
    expect(state.actors.get(state.playerId)).toMatchObject({
      kind: "player",
      health: 100,
      equippedWeaponId: SIGNAL_9_SPEC.id,
    });
    expect(state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe)?.kind).toBe(
      "hero",
    );
    expect(state.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier)?.kind).toBe(
      "courier",
    );
    expect(state.weapons.get(SIGNAL_9_SPEC.id)?.magazine).toBe(24);
    expect(state.mission.missionId).toBe(AFTERLIGHT_JOB_ID);
    expect(state.checkpointId).toBe(AFTERLIGHT_START_CHECKPOINT_ID);
  });

  it("is deterministic per seed and selects variants through the mission", () => {
    const first = createInitialAfterlightState(2407);
    const second = createInitialAfterlightState(2407);
    const other = createInitialAfterlightState(2408);

    expect(stableHash(first)).toBe(stableHash(second));
    expect(first.seed).not.toBe(other.seed);
    expect(stableHash(first)).not.toBe(stableHash(other));
  });

  it("defines every progression checkpoint and falls back to start", () => {
    for (const checkpointId of Object.values(AFTERLIGHT_CHECKPOINT_IDS)) {
      expect(AFTERLIGHT_CHECKPOINTS[checkpointId]?.pose.position).toHaveLength(
        3,
      );
    }

    expect(afterlightCheckpoint("missing").id).toBe(
      AFTERLIGHT_START_CHECKPOINT_ID,
    );
  });
});
