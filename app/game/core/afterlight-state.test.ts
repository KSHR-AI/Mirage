import { describe, expect, it } from "vitest";
import { SIGNAL_9_SPEC } from "../combat";
import {
  AFTERLIGHT_CHECKPOINT_IDS,
  AFTERLIGHT_ENCOUNTER_VARIANTS,
  AFTERLIGHT_JOB_ID,
} from "../missions/afterlight-job";
import {
  AFTERLIGHT_CHECKPOINTS,
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_START_CHECKPOINT_ID,
  afterlightCheckpoint,
  createInitialAfterlightState,
  hydrateAfterlightState,
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
    const player = state.actors.get(state.playerId);
    const hero = state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (!player || !hero) throw new Error("missing opening fixtures");
    expect(
      Math.hypot(
        player.pose.position[0] - hero.pose.position[0],
        player.pose.position[2] - hero.pose.position[2],
      ),
    ).toBeLessThanOrEqual(7);
    expect(
      Math.abs(player.pose.position[0] - hero.pose.position[0]),
    ).toBeGreaterThan(2.2 + 0.46);
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

  it("seeds the simulated courier from every selected encounter", () => {
    AFTERLIGHT_ENCOUNTER_VARIANTS.forEach((encounter, seed) => {
      const courier = createInitialAfterlightState(seed).vehicles.get(
        AFTERLIGHT_ENTITY_IDS.courier,
      );

      expect(courier?.pose.position).toEqual(encounter.courierSpawn);
      expect(courier?.routeId).toBe(encounter.courierRouteId);
    });
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

  it("hydrates a checkpoint save without reviving a failed mission", () => {
    const initial = createInitialAfterlightState();
    const player = initial.actors.get(initial.playerId);
    if (!player) throw new Error("missing player fixture");
    const hydrated = hydrateAfterlightState({
      version: 1,
      contractVersion: 1,
      seed: initial.seed,
      checkpointId: AFTERLIGHT_CHECKPOINT_IDS.vault,
      mission: { ...initial.mission, phaseIndex: 2, failed: true },
      player: { ...player, pose: { position: [14, 1.15, -32], rotationY: 0 } },
      cash: 4200,
      inventory: ["afterlight-vault-credential"],
    });

    expect(hydrated.mission.failed).toBe(false);
    expect(hydrated.mission.phaseIndex).toBe(2);
    expect(hydrated.cash).toBe(4200);
    expect(hydrated.inventory.has("afterlight-vault-credential")).toBe(true);
  });
});
