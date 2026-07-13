import {
  CONTRACT_VERSION,
  type GameState,
  type MissionProgress,
  type Pose,
  type SaveGameV1,
} from "../core/contracts";

export const SAVE_GAME_KEY = "mirage:afterlight:save:v1";

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isPose(value: unknown): value is Pose {
  if (!value || typeof value !== "object") return false;
  const pose = value as Partial<Pose>;
  return (
    Array.isArray(pose.position) &&
    pose.position.length === 3 &&
    pose.position.every(isNumber) &&
    isNumber(pose.rotationY)
  );
}

function isMissionProgress(value: unknown): value is MissionProgress {
  if (!value || typeof value !== "object") return false;
  const mission = value as Partial<MissionProgress>;
  return (
    typeof mission.missionId === "string" &&
    isNumber(mission.phaseIndex) &&
    isStringArray(mission.completedObjectiveIds) &&
    isStringArray(mission.completedCheckpointIds) &&
    typeof mission.completed === "boolean" &&
    typeof mission.failed === "boolean" &&
    isNumber(mission.startedAtTick)
  );
}

export function isSaveGameV1(value: unknown): value is SaveGameV1 {
  if (!value || typeof value !== "object") return false;
  const save = value as Partial<SaveGameV1>;
  if (
    save.version !== 1 ||
    save.contractVersion !== CONTRACT_VERSION ||
    !isNumber(save.seed) ||
    typeof save.checkpointId !== "string" ||
    !isMissionProgress(save.mission) ||
    !isNumber(save.cash) ||
    !isStringArray(save.inventory)
  ) {
    return false;
  }
  if (!save.player || typeof save.player !== "object") return false;
  return isNumber(save.player.health) && isPose(save.player.pose);
}

function migrateSaveGame(value: unknown): SaveGameV1 | null {
  return isSaveGameV1(value) ? value : null;
}

export class SaveGameRepository {
  readonly #storage: StoragePort;

  constructor(storage: StoragePort) {
    this.#storage = storage;
  }

  load(): SaveGameV1 | null {
    const serialized = this.#storage.getItem(SAVE_GAME_KEY);
    if (!serialized) return null;
    try {
      return migrateSaveGame(JSON.parse(serialized) as unknown);
    } catch {
      return null;
    }
  }

  save(save: SaveGameV1) {
    if (!isSaveGameV1(save))
      throw new Error("Refusing to persist an invalid save game");
    this.#storage.setItem(SAVE_GAME_KEY, JSON.stringify(save));
  }

  clear() {
    this.#storage.removeItem(SAVE_GAME_KEY);
  }
}

export function createCheckpointSave(state: GameState): SaveGameV1 {
  const player = state.actors.get(state.playerId);
  if (!player)
    throw new Error(`Player ${state.playerId} is missing from game state`);
  return {
    version: 1,
    contractVersion: CONTRACT_VERSION,
    seed: state.seed,
    checkpointId: state.checkpointId,
    mission: state.mission,
    player: {
      health: player.health,
      pose: player.pose,
      equippedWeaponId: player.equippedWeaponId,
    },
    cash: state.cash,
    inventory: [...state.inventory].sort(),
  };
}
