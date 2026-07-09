import { describe, expect, it } from "vitest";

import { CONTRACT_VERSION, type SaveGameV1 } from "../core/contracts";
import { SAVE_GAME_KEY, SaveGameRepository, isSaveGameV1 } from "./save-game";

const validSave: SaveGameV1 = {
  version: 1,
  contractVersion: CONTRACT_VERSION,
  seed: 2407,
  checkpointId: "boost-complete",
  mission: {
    missionId: "afterlight-job",
    phaseIndex: 1,
    completedObjectiveIds: ["steal-coupe"],
    completedCheckpointIds: ["boost-complete"],
    completed: false,
    failed: false,
    startedAtTick: 0,
  },
  player: {
    health: 100,
    pose: { position: [14, 1, 72], rotationY: 0 },
    equippedWeaponId: "signal-9",
  },
  cash: 2500,
  inventory: ["vault-key"],
};

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("save game persistence", () => {
  it("validates and round-trips a versioned save", () => {
    const storage = new MemoryStorage();
    const repository = new SaveGameRepository(storage);
    repository.save(validSave);
    expect(storage.values.has(SAVE_GAME_KEY)).toBe(true);
    expect(repository.load()).toEqual(validSave);
  });

  it("rejects corrupt and incompatible saves", () => {
    const storage = new MemoryStorage();
    storage.values.set(SAVE_GAME_KEY, "not json");
    expect(new SaveGameRepository(storage).load()).toBeNull();
    storage.values.set(
      SAVE_GAME_KEY,
      JSON.stringify({ ...validSave, version: 2 }),
    );
    expect(new SaveGameRepository(storage).load()).toBeNull();
    expect(isSaveGameV1({ ...validSave, player: { health: "100" } })).toBe(
      false,
    );
  });

  it("clears persisted state", () => {
    const storage = new MemoryStorage();
    const repository = new SaveGameRepository(storage);
    repository.save(validSave);
    repository.clear();
    expect(repository.load()).toBeNull();
  });
});
