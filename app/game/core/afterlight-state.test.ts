import { describe, expect, it } from "vitest";
import { SIGNAL_9_SPEC } from "../combat";
import {
  AFTERLIGHT_CHECKPOINT_IDS,
  AFTERLIGHT_ENCOUNTER_VARIANTS,
  AFTERLIGHT_JOB_ID,
} from "../missions/afterlight-job";
import { HOT_RIDE_CONTRACT_ID } from "../missions/afterlight-contracts";
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
  it("starts a district contract at its authored checkpoint with prerequisites", () => {
    const state = createInitialAfterlightState(2407, "vault-breach");

    expect(state.mission).toMatchObject({
      missionId: "vault-breach",
      phaseIndex: 0,
    });
    expect(state.checkpointId).toBe("afterlight:checkpoint:vault");
    expect(state.inventory.has("afterlight-vault-credential")).toBe(true);
    expect(state.heat).toMatchObject({ mode: "respond", wantedLevel: 1 });
    expect(state.actors.get(state.playerId)?.pose.position).toEqual([
      14, 1.15, -32,
    ]);
    expect(
      state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe)?.pose.position,
    ).toEqual([20, 0.72, -28]);
  });

  it("arms standalone pursuit heat so Bridge Run can transition to search", () => {
    const state = createInitialAfterlightState(2407, "bridge-run");
    expect(state.heat).toEqual({
      value: 70,
      wantedLevel: 3,
      mode: "respond",
      unseenTicks: 0,
    });
  });

  it("starts the default Hot Ride inside the hero coupe", () => {
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
    expect(hero.pose.rotationY).toBe(0);
    expect(player.pose.position).toEqual([56, 1.15, 40]);
    expect(hero.occupiedBy).toBe(state.playerId);
    expect(state.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier)?.kind).toBe(
      "courier",
    );
    expect(state.weapons.get(SIGNAL_9_SPEC.id)?.magazine).toBe(24);
    expect(state.mission.missionId).toBe(HOT_RIDE_CONTRACT_ID);
    expect(state.checkpointId).toBe("afterlight:checkpoint:hot-ride");
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
      const state = createInitialAfterlightState(seed);
      const courier = state.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier);
      const vaultGuards = Object.entries(AFTERLIGHT_ENTITY_IDS).filter(
        ([name, id]) => name.startsWith("vaultGuard") && state.actors.has(id),
      );

      expect(courier?.pose.position).toEqual(encounter.courierSpawn);
      expect(courier?.routeId).toBe(encounter.courierRouteId);
      expect(vaultGuards).toHaveLength(encounter.vaultGuardCount);
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

  it("stages the keyholder checkpoint beside the coupe without overlapping it", () => {
    const checkpoint = afterlightCheckpoint(
      AFTERLIGHT_CHECKPOINT_IDS.keyholder,
    );
    if (!checkpoint.vehiclePose)
      throw new Error("missing keyholder vehicle pose");
    const player = checkpoint.pose.position;
    const vehicle = checkpoint.vehiclePose.position;
    const separation = Math.hypot(
      player[0] - vehicle[0],
      player[2] - vehicle[2],
    );

    expect(separation).toBeGreaterThanOrEqual(3);
    expect(separation).toBeLessThanOrEqual(3.5);
    expect(Math.abs(player[0] - vehicle[0])).toBeGreaterThanOrEqual(3);
  });

  it("hydrates a checkpoint save without reviving a failed mission", () => {
    const initial = createInitialAfterlightState(2407, AFTERLIGHT_JOB_ID);
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
