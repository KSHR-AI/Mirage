import { describe, expect, it } from "vitest";

import { signal9MagazineCapacity } from "../combat/signal-9";
import {
  AFTERLIGHT_ENTITY_IDS,
  createInitialAfterlightState,
} from "../core/afterlight-state";
import { restoreAfterlightCheckpointState } from "../core/afterlight-step";
import {
  AFTERLIGHT_PROFILE_KEY,
  AfterlightProgressionRepository,
  afterlightUpgradeAvailability,
  applyAfterlightUpgrade,
  completeAfterlightRun,
  createAfterlightProfile,
  purchaseAfterlightUpgrade,
  selectAfterlightUpgrade,
} from "./afterlight-progression";

describe("Afterlight progression", () => {
  it("banks completed runs, records personal bests, and unlocks by rank", () => {
    const first = completeAfterlightRun(createAfterlightProfile(), {
      contractId: "afterlight-job",
      earnedCash: 9_000,
      elapsedTicks: 12_000,
      operationId: "mission-decoy",
      rank: "B",
    });
    expect(first.isPersonalBest).toBe(true);
    expect(first.newlyUnlockedIds).toEqual(["reinforced-chassis"]);
    expect(first.newlyMasteredOperationId).toBe("mission-decoy");
    expect(first.profile).toMatchObject({
      activeUpgradeId: "reinforced-chassis",
      bankedCash: 9_000,
      bestRank: "B",
      bestTimeTicks: 12_000,
      completedRuns: 1,
      completedOperationIds: ["mission-decoy"],
    });

    const second = completeAfterlightRun(first.profile, {
      contractId: "afterlight-job",
      earnedCash: 12_000,
      elapsedTicks: 13_000,
      operationId: "north-beach-transfer",
      rank: "A",
    });
    expect(second.isPersonalBest).toBe(false);
    expect(second.newlyUnlockedIds).toEqual(["extended-magazine"]);
    expect(second.newlyMasteredOperationId).toBe("north-beach-transfer");
    expect(second.profile.bestRank).toBe("A");
    expect(second.profile.bestTimeTicks).toBe(12_000);
    expect(second.profile.bankedCash).toBe(21_000);
    expect(second.profile.completedOperationIds).toEqual([
      "mission-decoy",
      "north-beach-transfer",
    ]);
  });

  it("records district jobs without granting full-route mastery", () => {
    const result = completeAfterlightRun(createAfterlightProfile(), {
      contractId: "vault-breach",
      earnedCash: 6_500,
      elapsedTicks: 3_200,
      operationId: "mission-decoy",
      rank: "A",
    });

    expect(result.isPersonalBest).toBe(true);
    expect(result.newlyMasteredOperationId).toBeUndefined();
    expect(result.profile).toMatchObject({
      bankedCash: 6_500,
      completedContractIds: ["vault-breach"],
      completedOperationIds: [],
      contractRecords: {
        "vault-breach": {
          bestRank: "A",
          bestTimeTicks: 3_200,
          completedRuns: 1,
        },
      },
    });
  });

  it("applies one selected upgrade to a fresh deterministic state", () => {
    const standard = createInitialAfterlightState();
    const chassis = applyAfterlightUpgrade(standard, "reinforced-chassis");
    const magazine = applyAfterlightUpgrade(standard, "extended-magazine");
    const plated = applyAfterlightUpgrade(standard, "trauma-plates");

    expect(chassis.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe)?.health).toBe(
      125,
    );
    expect(signal9MagazineCapacity(magazine.weapons.get("signal-9")!)).toBe(36);
    expect(magazine.weapons.get("signal-9")).toMatchObject({
      magazine: 36,
      reserve: 108,
    });
    expect(plated.actors.get(plated.playerId)?.health).toBe(125);

    const damagedVehicles = new Map(chassis.vehicles);
    damagedVehicles.set(AFTERLIGHT_ENTITY_IDS.heroCoupe, {
      ...damagedVehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe)!,
      health: 1,
    });
    expect(
      restoreAfterlightCheckpointState({
        ...chassis,
        vehicles: damagedVehicles,
      }).vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe)?.health,
    ).toBe(125);
    expect(
      restoreAfterlightCheckpointState(plated).actors.get(plated.playerId)
        ?.health,
    ).toBe(125);
  });

  it("spends banked cash on mastery-gated workshop upgrades", () => {
    const funded = {
      ...createAfterlightProfile(),
      bankedCash: 10_000,
      completedOperationIds: ["mission-decoy" as const],
      unlockedUpgradeIds: ["reinforced-chassis" as const],
    };

    expect(afterlightUpgradeAvailability(funded, "street-tune")).toEqual({
      status: "available",
      price: 6_000,
    });
    expect(
      afterlightUpgradeAvailability(funded, "trauma-plates"),
    ).toMatchObject({ status: "locked" });

    const purchased = purchaseAfterlightUpgrade(funded, "street-tune");
    expect(purchased).toMatchObject({
      activeUpgradeId: "street-tune",
      bankedCash: 4_000,
      unlockedUpgradeIds: ["reinforced-chassis", "street-tune"],
    });
    expect(() => purchaseAfterlightUpgrade(purchased, "street-tune")).toThrow(
      "already owned",
    );
    expect(() => purchaseAfterlightUpgrade(funded, "trauma-plates")).toThrow(
      "Master 1 more route",
    );
    expect(() =>
      purchaseAfterlightUpgrade(funded, "reinforced-chassis"),
    ).toThrow("earned through play");
  });

  it("rejects locked selection and invalid persisted profiles", () => {
    expect(() =>
      selectAfterlightUpgrade(createAfterlightProfile(), "extended-magazine"),
    ).toThrow("locked");
    const storage = new Map<string, string>();
    storage.set(AFTERLIGHT_PROFILE_KEY, '{"version":1,"bankedCash":-1}');
    const repository = new AfterlightProgressionRepository({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
    });
    expect(repository.load()).toEqual(createAfterlightProfile());
  });
});
