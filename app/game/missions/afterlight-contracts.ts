import type { MissionPhaseDefinition } from "../core/contracts";
import {
  AFTERLIGHT_CHECKPOINT_IDS,
  AFTERLIGHT_ITEMS,
  AFTERLIGHT_JOB_ID,
  AFTERLIGHT_PHASE_IDS,
  createAfterlightJob,
  type AfterlightJobDefinition,
} from "./afterlight-job";

export type AfterlightContractId =
  | typeof AFTERLIGHT_JOB_ID
  | "courier-jack"
  | "vault-breach"
  | "blackout-hold"
  | "bridge-run";

export interface AfterlightContractDefinition {
  readonly id: AfterlightContractId;
  readonly label: string;
  readonly description: string;
  readonly briefing: string;
  readonly completionHeading: string;
  readonly completionSubhead: string;
  readonly hostileGraceTicks: number;
  readonly phaseId?: (typeof AFTERLIGHT_PHASE_IDS)[keyof typeof AFTERLIGHT_PHASE_IDS];
  readonly startCheckpointId: string;
  readonly startingInventory: readonly string[];
  readonly targetCompletionTicks: number;
  readonly zeroPaceTicks: number;
}

export interface AfterlightMissionDefinition extends AfterlightJobDefinition {
  readonly contract: AfterlightContractDefinition;
}

export const AFTERLIGHT_CONTRACTS = Object.freeze([
  Object.freeze({
    id: AFTERLIGHT_JOB_ID,
    label: "Full Heist",
    description: "Six chapters / maximum take",
    briefing:
      "Steal the core. Kill the grid. Break the response across the bridge.",
    completionHeading: "Afterlight delivered.",
    completionSubhead: "Marin safehouse / Signal clear",
    hostileGraceTicks: 0,
    startCheckpointId: "afterlight:checkpoint:start",
    startingInventory: Object.freeze([]),
    targetCompletionTicks: 18_000,
    zeroPaceTicks: 31_500,
  }),
  Object.freeze({
    id: "courier-jack",
    label: "Courier Jack",
    description: "Vehicle takedown / close combat",
    briefing:
      "Box in the courier, put down the escort, and leave with the credential.",
    completionHeading: "Credential lifted.",
    completionSubhead: "North Beach / Courier neutralized",
    hostileGraceTicks: 240,
    phaseId: AFTERLIGHT_PHASE_IDS.keyholder,
    startCheckpointId: AFTERLIGHT_CHECKPOINT_IDS.keyholder,
    startingInventory: Object.freeze([]),
    targetCompletionTicks: 3_000,
    zeroPaceTicks: 7_200,
  }),
  Object.freeze({
    id: "vault-breach",
    label: "Vault Breach",
    description: "Armed entry / high-value extraction",
    briefing:
      "Use the stolen credential, clear the vault floor, and extract the core.",
    completionHeading: "Core extracted.",
    completionSubhead: "Financial District / Vault empty",
    hostileGraceTicks: 240,
    phaseId: AFTERLIGHT_PHASE_IDS.vault,
    startCheckpointId: AFTERLIGHT_CHECKPOINT_IDS.vault,
    startingInventory: Object.freeze([AFTERLIGHT_ITEMS.vaultCredential]),
    targetCompletionTicks: 3_600,
    zeroPaceTicks: 9_000,
  }),
  Object.freeze({
    id: "blackout-hold",
    label: "Blackout Hold",
    description: "Sabotage / response survival",
    briefing:
      "Prime the overload and hold the substation while the city grid falls.",
    completionHeading: "Grid collapsed.",
    completionSubhead: "Potrero / Response broken",
    hostileGraceTicks: 240,
    phaseId: AFTERLIGHT_PHASE_IDS.blackout,
    startCheckpointId: AFTERLIGHT_CHECKPOINT_IDS.blackout,
    startingInventory: Object.freeze([AFTERLIGHT_ITEMS.afterlightCore]),
    targetCompletionTicks: 2_400,
    zeroPaceTicks: 6_000,
  }),
  Object.freeze({
    id: "bridge-run",
    label: "Bridge Run",
    description: "Maximum heat / escape driving",
    briefing:
      "Launch with the stolen core, break the interceptors, and clear the bridge.",
    completionHeading: "Pursuit broken.",
    completionSubhead: "Golden Gate / Line of sight lost",
    hostileGraceTicks: 240,
    phaseId: AFTERLIGHT_PHASE_IDS.run,
    startCheckpointId: AFTERLIGHT_CHECKPOINT_IDS.run,
    startingInventory: Object.freeze([AFTERLIGHT_ITEMS.afterlightCore]),
    targetCompletionTicks: 3_600,
    zeroPaceTicks: 9_000,
  }),
] as const satisfies readonly AfterlightContractDefinition[]);

const CONTRACT_BY_ID = new Map(
  AFTERLIGHT_CONTRACTS.map((contract) => [contract.id, contract]),
);

export const DEFAULT_AFTERLIGHT_CONTRACT_ID = AFTERLIGHT_JOB_ID;

export function isAfterlightContractId(
  value: unknown,
): value is AfterlightContractId {
  return (
    typeof value === "string" &&
    CONTRACT_BY_ID.has(value as AfterlightContractId)
  );
}

export function afterlightContract(
  id: AfterlightContractId,
): AfterlightContractDefinition {
  return CONTRACT_BY_ID.get(id) ?? AFTERLIGHT_CONTRACTS[0];
}

function withoutCampaignCheckpoint(
  phase: MissionPhaseDefinition,
): MissionPhaseDefinition {
  const contractPhase: MissionPhaseDefinition & { checkpointAfter?: string } = {
    ...phase,
  };
  delete contractPhase.checkpointAfter;
  return contractPhase;
}

export function createAfterlightMission(
  missionId: string,
  seed: number,
): AfterlightMissionDefinition {
  const contract = afterlightContract(
    isAfterlightContractId(missionId)
      ? missionId
      : DEFAULT_AFTERLIGHT_CONTRACT_ID,
  );
  const job = createAfterlightJob(seed);
  if (contract.id === AFTERLIGHT_JOB_ID) return { ...job, contract };

  const phase = job.phases.find(
    (candidate) => candidate.id === contract.phaseId,
  );
  if (!phase)
    throw new Error(`Missing phase ${contract.phaseId} for ${contract.id}`);
  return {
    id: contract.id,
    title: contract.label,
    encounter: job.encounter,
    phases: Object.freeze([withoutCampaignCheckpoint(phase)]),
    contract,
  };
}
