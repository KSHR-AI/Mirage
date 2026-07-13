import type { PoliceMode } from "../core/contracts";
import {
  AFTERLIGHT_DEFAULT_SEED,
  AFTERLIGHT_ENCOUNTER_VARIANTS,
  AFTERLIGHT_PHASE_IDS,
  selectAfterlightEncounter,
  type AfterlightEncounterVariant,
  type AfterlightEncounterVariantId,
} from "./afterlight-job";

export type AfterlightOperationId = AfterlightEncounterVariantId;

export interface AfterlightOperation {
  readonly id: AfterlightOperationId;
  readonly label: string;
  readonly description: string;
  readonly risk: "balanced" | "assault" | "pursuit";
}

export const AFTERLIGHT_OPERATIONS = Object.freeze([
  Object.freeze({
    id: "embarcadero-switch",
    label: "Embarcadero Switch",
    description: "Four vault guards and a three-unit bridge response.",
    risk: "balanced",
  }),
  Object.freeze({
    id: "mission-decoy",
    label: "Mission Decoy",
    description: "Five vault guards, but only two bridge interceptors.",
    risk: "assault",
  }),
  Object.freeze({
    id: "north-beach-transfer",
    label: "North Beach Transfer",
    description: "Three vault guards and a four-unit bridge pursuit.",
    risk: "pursuit",
  }),
] as const satisfies readonly AfterlightOperation[]);

export const DEFAULT_AFTERLIGHT_OPERATION_ID = selectAfterlightEncounter(
  AFTERLIGHT_DEFAULT_SEED,
).id;

export function isAfterlightOperationId(
  value: unknown,
): value is AfterlightOperationId {
  return AFTERLIGHT_OPERATIONS.some((operation) => operation.id === value);
}

export function afterlightOperation(
  id: AfterlightOperationId,
): AfterlightOperation {
  return (
    AFTERLIGHT_OPERATIONS.find((operation) => operation.id === id) ??
    AFTERLIGHT_OPERATIONS[0]
  );
}

export function afterlightOperationForSeed(seed: number): AfterlightOperation {
  return afterlightOperation(selectAfterlightEncounter(seed).id);
}

export function afterlightSeedForOperation(
  id: AfterlightOperationId,
  completedRuns = 0,
): number {
  const index = AFTERLIGHT_ENCOUNTER_VARIANTS.findIndex(
    (encounter) => encounter.id === id,
  );
  if (index < 0) throw new RangeError(`Unknown Afterlight operation ${id}`);
  const cycle = Number.isSafeInteger(completedRuns)
    ? Math.max(0, completedRuns)
    : 0;
  const variantCount = AFTERLIGHT_ENCOUNTER_VARIANTS.length;
  const baseSeed =
    AFTERLIGHT_DEFAULT_SEED -
    (((AFTERLIGHT_DEFAULT_SEED % variantCount) + variantCount) % variantCount);
  return baseSeed + cycle * variantCount + index;
}

export function nextAfterlightOperationId(
  id: AfterlightOperationId,
): AfterlightOperationId {
  const index = AFTERLIGHT_OPERATIONS.findIndex(
    (operation) => operation.id === id,
  );
  return AFTERLIGHT_OPERATIONS[(index + 1) % AFTERLIGHT_OPERATIONS.length].id;
}

export function activeAfterlightPoliceCount(
  encounter: AfterlightEncounterVariant,
  phaseId: string,
  wantedLevel: 0 | 1 | 2 | 3,
  mode?: PoliceMode,
): number {
  const pursuitSurge =
    phaseId === AFTERLIGHT_PHASE_IDS.run &&
    wantedLevel === 3 &&
    mode === "pursue"
      ? 1
      : 0;
  return Math.min(encounter.interceptorCount, wantedLevel + pursuitSurge);
}
