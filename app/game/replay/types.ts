import type { InputFrame, Tick, CONTRACT_VERSION } from "../core/contracts";

export const REPLAY_TAPE_VERSION = 1 as const;

export const REPLAY_LIMITS = Object.freeze({
  maxJsonBytes: 32 * 1024 * 1024,
  maxTicks: 60 * 60 * 60,
  maxRuns: 60 * 60 * 60,
  maxHashCheckpoints: 60 * 60,
  maxObjectiveIds: 128,
  maxIdentifierLength: 128,
  maxLookMagnitude: 100_000,
} as const);

export type ReplayOutcomeStatus = "completed" | "failed" | "abandoned";

export interface ReplayInputRunV1 {
  /** First session-relative tape tick whose input is represented by this run. */
  readonly tick: Tick;
  readonly ticks: number;
  readonly input: InputFrame;
}

export interface ReplayHashCheckpointV1 {
  /** Session-relative resulting state tick represented by this hash. */
  readonly tick: Tick;
  readonly hash: string;
}

export interface ReplayOutcomeV1 {
  readonly missionId: string;
  readonly status: ReplayOutcomeStatus;
  /** Session-relative tape tick at completion. */
  readonly completionTick?: Tick;
  readonly deaths: number;
  readonly optionalObjectiveIds: readonly string[];
  readonly optionalObjectiveCount: number;
  readonly shotsFired: number;
  readonly shotsHit: number;
  /** Damage to the hero vehicle expressed as a percentage from 0 to 100. */
  readonly vehicleDamage: number;
}

export interface ReplayTapeV1 {
  readonly version: typeof REPLAY_TAPE_VERSION;
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly seed: number;
  readonly tickCount: number;
  readonly runs: readonly ReplayInputRunV1[];
  readonly hashes?: readonly ReplayHashCheckpointV1[];
  readonly outcome?: ReplayOutcomeV1;
}

export type ReplayTape = ReplayTapeV1;

export interface ReplayStep {
  readonly tick: Tick;
  readonly input: InputFrame;
  readonly resultingStateTick: Tick;
  readonly expectedStateHash?: string;
}

export interface ReplayHashMatch {
  readonly status: "match";
  readonly tick: Tick;
  readonly expectedHash: string;
  readonly actualHash: string;
}

export interface ReplayHashNotRecorded {
  readonly status: "not-recorded";
  readonly tick: Tick;
  readonly actualHash: string;
}

export interface ReplayHashDivergence {
  readonly status: "diverged";
  readonly tick: Tick;
  readonly expectedHash: string;
  readonly actualHash: string;
}

export type ReplayHashVerification =
  | ReplayHashMatch
  | ReplayHashNotRecorded
  | ReplayHashDivergence;
