import { createSignal9State, SIGNAL_9_SPEC } from "../combat/signal-9";
import { AFTERLIGHT_ENTITY_IDS } from "../core/afterlight-state";
import type { GameState } from "../core/contracts";
import {
  DEFAULT_AFTERLIGHT_OPERATION_ID,
  isAfterlightOperationId,
  type AfterlightOperationId,
} from "../missions/afterlight-operations";
import {
  DEFAULT_AFTERLIGHT_CONTRACT_ID,
  isAfterlightContractId,
  type AfterlightContractId,
} from "../missions/afterlight-contracts";
import { AFTERLIGHT_JOB_ID } from "../missions/afterlight-job";

export const AFTERLIGHT_PROFILE_KEY = "mirage:afterlight:profile:v1";

export const AFTERLIGHT_UPGRADES = Object.freeze({
  "extended-magazine": Object.freeze({
    acquisition: "reward",
    description: "36-round Signal-9 magazine with a larger reserve.",
    label: "Extended Signal-9",
  }),
  "reinforced-chassis": Object.freeze({
    acquisition: "reward",
    description: "Prototype coupe starts each run with 25% more integrity.",
    label: "Reinforced coupe",
  }),
  "street-tune": Object.freeze({
    acquisition: "purchase",
    description: "29 m/s gearing with a 36 m/s boost map.",
    label: "Street tune",
    price: 6_000,
    requiredMasteredOperations: 1,
  }),
  "trauma-plates": Object.freeze({
    acquisition: "purchase",
    description: "Start and retry every operation with 125 health.",
    label: "Trauma plates",
    price: 8_000,
    requiredMasteredOperations: 2,
  }),
});

export type AfterlightUpgradeId = keyof typeof AFTERLIGHT_UPGRADES;
export type AfterlightRank = "S" | "A" | "B" | "C";
export type AfterlightUpgradeStatus =
  | "owned"
  | "available"
  | "unaffordable"
  | "locked";

export interface AfterlightUpgradeAvailability {
  readonly status: AfterlightUpgradeStatus;
  readonly price?: number;
  readonly reason?: string;
}

export interface AfterlightContractRecord {
  readonly bestRank: AfterlightRank;
  readonly bestTimeTicks: number;
  readonly completedRuns: number;
}

export type AfterlightProfileV1 = {
  readonly activeUpgradeId?: AfterlightUpgradeId;
  readonly bankedCash: number;
  readonly bestRank?: AfterlightRank;
  readonly bestTimeTicks?: number;
  readonly completedContractIds?: readonly AfterlightContractId[];
  readonly completedOperationIds?: readonly AfterlightOperationId[];
  readonly completedRuns: number;
  readonly contractRecords?: Readonly<
    Partial<Record<AfterlightContractId, AfterlightContractRecord>>
  >;
  readonly selectedContractId?: AfterlightContractId;
  readonly selectedOperationId?: AfterlightOperationId;
  readonly unlockedUpgradeIds: readonly AfterlightUpgradeId[];
  readonly version: 1;
};

export type CompletedRunProgress = {
  readonly earnedCash: number;
  readonly elapsedTicks: number;
  readonly contractId: AfterlightContractId;
  readonly operationId: AfterlightOperationId;
  readonly rank: AfterlightRank;
};

export type CompletedRunProgressResult = {
  readonly isPersonalBest: boolean;
  readonly newlyMasteredOperationId?: AfterlightOperationId;
  readonly newlyUnlockedIds: readonly AfterlightUpgradeId[];
  readonly profile: AfterlightProfileV1;
};

export interface ProfileStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const RANK_VALUE: Readonly<Record<AfterlightRank, number>> = Object.freeze({
  S: 4,
  A: 3,
  B: 2,
  C: 1,
});

const UPGRADE_MARKERS: Readonly<Record<AfterlightUpgradeId, string>> =
  Object.freeze({
    "extended-magazine": "mirage:upgrade:extended-magazine",
    "reinforced-chassis": "mirage:upgrade:reinforced-chassis",
    "street-tune": "mirage:upgrade:street-tune",
    "trauma-plates": "mirage:upgrade:trauma-plates",
  });

export function createAfterlightProfile(): AfterlightProfileV1 {
  return Object.freeze({
    bankedCash: 0,
    completedContractIds: Object.freeze([]),
    completedOperationIds: Object.freeze([]),
    completedRuns: 0,
    contractRecords: Object.freeze({}),
    selectedContractId: DEFAULT_AFTERLIGHT_CONTRACT_ID,
    selectedOperationId: DEFAULT_AFTERLIGHT_OPERATION_ID,
    unlockedUpgradeIds: Object.freeze([]),
    version: 1,
  });
}

function isUpgradeId(value: unknown): value is AfterlightUpgradeId {
  return typeof value === "string" && value in AFTERLIGHT_UPGRADES;
}

function isRank(value: unknown): value is AfterlightRank {
  return value === "S" || value === "A" || value === "B" || value === "C";
}

function isContractRecord(value: unknown): value is AfterlightContractRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AfterlightContractRecord>;
  return (
    isRank(record.bestRank) &&
    Number.isSafeInteger(record.bestTimeTicks) &&
    (record.bestTimeTicks ?? 0) > 0 &&
    Number.isSafeInteger(record.completedRuns) &&
    (record.completedRuns ?? -1) >= 0
  );
}

function isContractRecords(
  value: unknown,
): value is Readonly<
  Partial<Record<AfterlightContractId, AfterlightContractRecord>>
> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([id, record]) => isAfterlightContractId(id) && isContractRecord(record),
  );
}

export function isAfterlightProfileV1(
  value: unknown,
): value is AfterlightProfileV1 {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<AfterlightProfileV1>;
  return (
    profile.version === 1 &&
    Number.isSafeInteger(profile.bankedCash) &&
    (profile.bankedCash ?? -1) >= 0 &&
    Number.isSafeInteger(profile.completedRuns) &&
    (profile.completedRuns ?? -1) >= 0 &&
    Array.isArray(profile.unlockedUpgradeIds) &&
    profile.unlockedUpgradeIds.every(isUpgradeId) &&
    new Set(profile.unlockedUpgradeIds).size ===
      profile.unlockedUpgradeIds.length &&
    (profile.activeUpgradeId === undefined ||
      (isUpgradeId(profile.activeUpgradeId) &&
        profile.unlockedUpgradeIds.includes(profile.activeUpgradeId))) &&
    (profile.completedContractIds === undefined ||
      (Array.isArray(profile.completedContractIds) &&
        profile.completedContractIds.every(isAfterlightContractId) &&
        new Set(profile.completedContractIds).size ===
          profile.completedContractIds.length)) &&
    (profile.contractRecords === undefined ||
      isContractRecords(profile.contractRecords)) &&
    (profile.selectedContractId === undefined ||
      isAfterlightContractId(profile.selectedContractId)) &&
    (profile.completedOperationIds === undefined ||
      (Array.isArray(profile.completedOperationIds) &&
        profile.completedOperationIds.every(isAfterlightOperationId) &&
        new Set(profile.completedOperationIds).size ===
          profile.completedOperationIds.length)) &&
    (profile.selectedOperationId === undefined ||
      isAfterlightOperationId(profile.selectedOperationId)) &&
    (profile.bestRank === undefined || isRank(profile.bestRank)) &&
    (profile.bestTimeTicks === undefined ||
      (Number.isSafeInteger(profile.bestTimeTicks) &&
        profile.bestTimeTicks > 0))
  );
}

export class AfterlightProgressionRepository {
  readonly #storage: ProfileStoragePort;

  constructor(storage: ProfileStoragePort) {
    this.#storage = storage;
  }

  load(): AfterlightProfileV1 {
    const serialized = this.#storage.getItem(AFTERLIGHT_PROFILE_KEY);
    if (!serialized) return createAfterlightProfile();
    try {
      const value = JSON.parse(serialized) as unknown;
      if (!isAfterlightProfileV1(value)) return createAfterlightProfile();
      return Object.freeze({
        ...value,
        completedContractIds: Object.freeze(value.completedContractIds ?? []),
        completedOperationIds: Object.freeze(value.completedOperationIds ?? []),
        contractRecords: Object.freeze(value.contractRecords ?? {}),
        selectedContractId:
          value.selectedContractId ?? DEFAULT_AFTERLIGHT_CONTRACT_ID,
        selectedOperationId:
          value.selectedOperationId ?? DEFAULT_AFTERLIGHT_OPERATION_ID,
      });
    } catch {
      return createAfterlightProfile();
    }
  }

  save(profile: AfterlightProfileV1) {
    if (!isAfterlightProfileV1(profile)) {
      throw new Error("Refusing to persist invalid Afterlight progression");
    }
    this.#storage.setItem(AFTERLIGHT_PROFILE_KEY, JSON.stringify(profile));
  }
}

export function completeAfterlightRun(
  profile: AfterlightProfileV1,
  run: CompletedRunProgress,
): CompletedRunProgressResult {
  if (!isAfterlightProfileV1(profile)) throw new Error("Invalid profile");
  if (!Number.isSafeInteger(run.earnedCash) || run.earnedCash < 0) {
    throw new RangeError("earnedCash must be a non-negative integer");
  }
  if (!Number.isSafeInteger(run.elapsedTicks) || run.elapsedTicks <= 0) {
    throw new RangeError("elapsedTicks must be a positive integer");
  }
  if (!isRank(run.rank)) throw new RangeError("Invalid run rank");
  if (!isAfterlightContractId(run.contractId)) {
    throw new RangeError("Invalid contract");
  }
  if (!isAfterlightOperationId(run.operationId)) {
    throw new RangeError("Invalid operation");
  }

  const unlocked = new Set(profile.unlockedUpgradeIds);
  const newlyUnlockedIds: AfterlightUpgradeId[] = [];
  const unlock = (id: AfterlightUpgradeId) => {
    if (unlocked.has(id)) return;
    unlocked.add(id);
    newlyUnlockedIds.push(id);
  };
  unlock("reinforced-chassis");
  if (run.rank === "S" || run.rank === "A") unlock("extended-magazine");

  const previousContractRecord = profile.contractRecords?.[run.contractId];
  const previousBestTime =
    previousContractRecord?.bestTimeTicks ??
    (run.contractId === AFTERLIGHT_JOB_ID ? profile.bestTimeTicks : undefined);
  const previousBestRank =
    previousContractRecord?.bestRank ??
    (run.contractId === AFTERLIGHT_JOB_ID ? profile.bestRank : undefined);
  const contractBestTimeTicks = Math.min(
    previousBestTime ?? Number.POSITIVE_INFINITY,
    run.elapsedTicks,
  );
  const contractBestRank =
    !previousBestRank || RANK_VALUE[run.rank] > RANK_VALUE[previousBestRank]
      ? run.rank
      : previousBestRank;
  const isPersonalBest =
    previousBestTime === undefined || run.elapsedTicks < previousBestTime;
  const unlockedUpgradeIds = [...unlocked].toSorted();
  const completedOperationIds = new Set(profile.completedOperationIds ?? []);
  const fullHeist = run.contractId === AFTERLIGHT_JOB_ID;
  const newlyMasteredOperationId =
    fullHeist && !completedOperationIds.has(run.operationId)
      ? run.operationId
      : undefined;
  if (fullHeist) completedOperationIds.add(run.operationId);
  const completedContractIds = new Set(profile.completedContractIds ?? []);
  completedContractIds.add(run.contractId);
  const contractRecords = {
    ...(profile.contractRecords ?? {}),
    [run.contractId]: Object.freeze({
      bestRank: contractBestRank,
      bestTimeTicks: contractBestTimeTicks,
      completedRuns: (previousContractRecord?.completedRuns ?? 0) + 1,
    }),
  };
  const activeUpgradeId =
    profile.activeUpgradeId ?? newlyUnlockedIds[0] ?? unlockedUpgradeIds[0];
  const next: AfterlightProfileV1 = Object.freeze({
    ...(activeUpgradeId ? { activeUpgradeId } : {}),
    bankedCash: profile.bankedCash + run.earnedCash,
    ...(fullHeist
      ? { bestRank: contractBestRank, bestTimeTicks: contractBestTimeTicks }
      : profile.bestRank
        ? { bestRank: profile.bestRank, bestTimeTicks: profile.bestTimeTicks }
        : {}),
    completedContractIds: Object.freeze([...completedContractIds].toSorted()),
    completedOperationIds: Object.freeze([...completedOperationIds].toSorted()),
    completedRuns: profile.completedRuns + 1,
    contractRecords: Object.freeze(contractRecords),
    selectedContractId:
      profile.selectedContractId ?? DEFAULT_AFTERLIGHT_CONTRACT_ID,
    selectedOperationId:
      profile.selectedOperationId ?? DEFAULT_AFTERLIGHT_OPERATION_ID,
    unlockedUpgradeIds: Object.freeze(unlockedUpgradeIds),
    version: 1,
  });
  return {
    isPersonalBest,
    ...(newlyMasteredOperationId ? { newlyMasteredOperationId } : {}),
    newlyUnlockedIds: Object.freeze(newlyUnlockedIds),
    profile: next,
  };
}

export function selectAfterlightContract(
  profile: AfterlightProfileV1,
  selectedContractId: AfterlightContractId,
): AfterlightProfileV1 {
  if (!isAfterlightContractId(selectedContractId)) {
    throw new RangeError(`Unknown contract ${selectedContractId}`);
  }
  return Object.freeze({ ...profile, selectedContractId });
}

export function afterlightContractRecord(
  profile: AfterlightProfileV1,
  contractId: AfterlightContractId,
): AfterlightContractRecord | undefined {
  const record = profile.contractRecords?.[contractId];
  if (record) return record;
  if (
    contractId === AFTERLIGHT_JOB_ID &&
    profile.bestRank &&
    profile.bestTimeTicks
  ) {
    return Object.freeze({
      bestRank: profile.bestRank,
      bestTimeTicks: profile.bestTimeTicks,
      completedRuns: profile.completedRuns,
    });
  }
  return undefined;
}

export function selectAfterlightOperation(
  profile: AfterlightProfileV1,
  selectedOperationId: AfterlightOperationId,
): AfterlightProfileV1 {
  if (!isAfterlightOperationId(selectedOperationId)) {
    throw new RangeError(`Unknown operation ${selectedOperationId}`);
  }
  return Object.freeze({ ...profile, selectedOperationId });
}

export function selectAfterlightUpgrade(
  profile: AfterlightProfileV1,
  activeUpgradeId: AfterlightUpgradeId | undefined,
): AfterlightProfileV1 {
  if (
    activeUpgradeId !== undefined &&
    !profile.unlockedUpgradeIds.includes(activeUpgradeId)
  ) {
    throw new RangeError(`Upgrade ${activeUpgradeId} is locked`);
  }
  return Object.freeze({
    ...profile,
    ...(activeUpgradeId ? { activeUpgradeId } : { activeUpgradeId: undefined }),
  });
}

export function afterlightUpgradeAvailability(
  profile: AfterlightProfileV1,
  upgradeId: AfterlightUpgradeId,
): AfterlightUpgradeAvailability {
  if (profile.unlockedUpgradeIds.includes(upgradeId)) {
    return Object.freeze({ status: "owned" });
  }
  const upgrade = AFTERLIGHT_UPGRADES[upgradeId];
  if (upgrade.acquisition === "reward") {
    return Object.freeze({
      status: "locked",
      reason:
        upgradeId === "extended-magazine"
          ? "Earn an A rank."
          : "Complete an operation.",
    });
  }
  const mastered = profile.completedOperationIds?.length ?? 0;
  if (mastered < upgrade.requiredMasteredOperations) {
    const remaining = upgrade.requiredMasteredOperations - mastered;
    return Object.freeze({
      status: "locked",
      price: upgrade.price,
      reason: `Master ${remaining} more ${remaining === 1 ? "route" : "routes"}.`,
    });
  }
  if (profile.bankedCash < upgrade.price) {
    return Object.freeze({
      status: "unaffordable",
      price: upgrade.price,
      reason: `Need $${(upgrade.price - profile.bankedCash).toLocaleString("en-US")} more.`,
    });
  }
  return Object.freeze({ status: "available", price: upgrade.price });
}

export function purchaseAfterlightUpgrade(
  profile: AfterlightProfileV1,
  upgradeId: AfterlightUpgradeId,
): AfterlightProfileV1 {
  if (!isAfterlightProfileV1(profile)) throw new Error("Invalid profile");
  const upgrade = AFTERLIGHT_UPGRADES[upgradeId];
  if (upgrade.acquisition !== "purchase") {
    throw new RangeError(`${upgrade.label} is earned through play`);
  }
  const availability = afterlightUpgradeAvailability(profile, upgradeId);
  if (availability.status === "owned") {
    throw new RangeError(`${upgrade.label} is already owned`);
  }
  if (availability.status === "locked") {
    throw new RangeError(availability.reason ?? `${upgrade.label} is locked`);
  }
  if (availability.status === "unaffordable") {
    throw new RangeError(availability.reason ?? "Insufficient banked cash");
  }
  const unlockedUpgradeIds = [
    ...profile.unlockedUpgradeIds,
    upgradeId,
  ].toSorted();
  return Object.freeze({
    ...profile,
    activeUpgradeId: upgradeId,
    bankedCash: profile.bankedCash - upgrade.price,
    unlockedUpgradeIds: Object.freeze(unlockedUpgradeIds),
  });
}

export function applyAfterlightUpgrade(
  state: GameState,
  upgradeId: AfterlightUpgradeId | undefined,
): GameState {
  const inventory = new Set(state.inventory);
  Object.values(UPGRADE_MARKERS).forEach((marker) => inventory.delete(marker));
  if (upgradeId) inventory.add(UPGRADE_MARKERS[upgradeId]);

  const vehicles = new Map(state.vehicles);
  const hero = vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
  if (hero) {
    vehicles.set(hero.id, {
      ...hero,
      health:
        upgradeId === "reinforced-chassis" ? 125 : Math.min(100, hero.health),
    });
  }

  const weapons = new Map(state.weapons);
  if (upgradeId === "extended-magazine") {
    weapons.set(
      SIGNAL_9_SPEC.id,
      createSignal9State({ magazineCapacity: 36, reserve: 108 }),
    );
  }

  const actors = new Map(state.actors);
  const player = actors.get(state.playerId);
  if (player) {
    actors.set(player.id, {
      ...player,
      health:
        upgradeId === "trauma-plates" ? 125 : Math.min(100, player.health),
    });
  }

  return { ...state, actors, inventory, vehicles, weapons };
}

export function hasAfterlightUpgradeMarker(
  state: Pick<GameState, "inventory">,
  upgradeId: AfterlightUpgradeId,
): boolean {
  return state.inventory.has(UPGRADE_MARKERS[upgradeId]);
}
