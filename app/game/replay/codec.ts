import {
  CONTRACT_VERSION,
  type InputFrame,
  type InputSource,
  type Vec2,
} from "../core/contracts";
import {
  REPLAY_LIMITS,
  REPLAY_TAPE_VERSION,
  type ReplayHashCheckpointV1,
  type ReplayInputRunV1,
  type ReplayOutcomeStatus,
  type ReplayOutcomeV1,
  type ReplayTapeV1,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const INPUT_SOURCES = new Set<InputSource>([
  "keyboard",
  "touch",
  "gamepad",
  "replay",
]);
const OUTCOME_STATUSES = new Set<ReplayOutcomeStatus>([
  "completed",
  "failed",
  "abandoned",
]);
const HASH_PATTERN = /^[0-9a-f]{16}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

const INPUT_KEYS = [
  "source",
  "move",
  "look",
  "throttle",
  "steer",
  "brake",
  "sprint",
  "aim",
  "jumpPressed",
  "interactPressed",
  "firePressed",
  "reloadPressed",
  "pausePressed",
] as const;

export class ReplayValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ReplayValidationError";
    this.path = path;
  }
}

function invalid(path: string, message: string): never {
  throw new ReplayValidationError(path, message);
}

function record(value: unknown, path: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid(path, "expected an object");
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid(path, "expected a plain object");
  }

  return value as UnknownRecord;
}

function exactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      invalid(`${path}.${key}`, "unknown field");
    }
  }

  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      invalid(`${path}.${key}`, "missing required field");
    }
  }
}

function finiteNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    return invalid(
      path,
      `expected a finite number from ${minimum} to ${maximum}`,
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function integer(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  const result = finiteNumber(value, path, minimum, maximum);
  if (!Number.isSafeInteger(result)) {
    return invalid(path, "expected a safe integer");
  }
  return result;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    return invalid(path, "expected a boolean");
  }
  return value;
}

function identifier(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > REPLAY_LIMITS.maxIdentifierLength ||
    !IDENTIFIER_PATTERN.test(value)
  ) {
    return invalid(path, "expected a bounded identifier");
  }
  return value;
}

export function validateReplayHash(value: unknown, path = "hash"): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    return invalid(path, "expected a 16-character lowercase hexadecimal hash");
  }
  return value;
}

function vector(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): Vec2 {
  if (!Array.isArray(value) || value.length !== 2) {
    return invalid(path, "expected a two-value vector");
  }

  return Object.freeze([
    finiteNumber(value[0], `${path}[0]`, minimum, maximum),
    finiteNumber(value[1], `${path}[1]`, minimum, maximum),
  ]) as Vec2;
}

export function validateInputFrame(value: unknown, path = "input"): InputFrame {
  const input = record(value, path);
  exactKeys(input, INPUT_KEYS, [], path);

  if (
    typeof input.source !== "string" ||
    !INPUT_SOURCES.has(input.source as InputSource)
  ) {
    invalid(`${path}.source`, "expected a supported input source");
  }

  return Object.freeze({
    source: input.source as InputSource,
    move: vector(input.move, `${path}.move`, -1, 1),
    look: vector(
      input.look,
      `${path}.look`,
      -REPLAY_LIMITS.maxLookMagnitude,
      REPLAY_LIMITS.maxLookMagnitude,
    ),
    throttle: finiteNumber(input.throttle, `${path}.throttle`, -1, 1),
    steer: finiteNumber(input.steer, `${path}.steer`, -1, 1),
    brake: boolean(input.brake, `${path}.brake`),
    sprint: boolean(input.sprint, `${path}.sprint`),
    aim: boolean(input.aim, `${path}.aim`),
    jumpPressed: boolean(input.jumpPressed, `${path}.jumpPressed`),
    interactPressed: boolean(input.interactPressed, `${path}.interactPressed`),
    firePressed: boolean(input.firePressed, `${path}.firePressed`),
    reloadPressed: boolean(input.reloadPressed, `${path}.reloadPressed`),
    pausePressed: boolean(input.pausePressed, `${path}.pausePressed`),
  });
}

export function inputFramesEqual(left: InputFrame, right: InputFrame): boolean {
  return (
    left.source === right.source &&
    left.move[0] === right.move[0] &&
    left.move[1] === right.move[1] &&
    left.look[0] === right.look[0] &&
    left.look[1] === right.look[1] &&
    left.throttle === right.throttle &&
    left.steer === right.steer &&
    left.brake === right.brake &&
    left.sprint === right.sprint &&
    left.aim === right.aim &&
    left.jumpPressed === right.jumpPressed &&
    left.interactPressed === right.interactPressed &&
    left.firePressed === right.firePressed &&
    left.reloadPressed === right.reloadPressed &&
    left.pausePressed === right.pausePressed
  );
}

/** Fire is intentionally held in InputBuffer; the other `Pressed` fields are edges. */
export function hasReplayInputEdge(input: InputFrame): boolean {
  return (
    input.jumpPressed ||
    input.interactPressed ||
    input.reloadPressed ||
    input.pausePressed
  );
}

function validateRun(
  value: unknown,
  index: number,
  expectedTick: number,
): ReplayInputRunV1 {
  const path = `replay.runs[${index}]`;
  const run = record(value, path);
  exactKeys(run, ["tick", "ticks", "input"], [], path);

  const tick = integer(run.tick, `${path}.tick`, 0, REPLAY_LIMITS.maxTicks);
  if (tick !== expectedTick) {
    invalid(`${path}.tick`, `expected contiguous tick ${expectedTick}`);
  }

  const ticks = integer(run.ticks, `${path}.ticks`, 1, REPLAY_LIMITS.maxTicks);
  if (tick + ticks > REPLAY_LIMITS.maxTicks) {
    invalid(`${path}.ticks`, "run exceeds the replay tick limit");
  }

  const input = validateInputFrame(run.input, `${path}.input`);
  if (ticks !== 1 && hasReplayInputEdge(input)) {
    invalid(`${path}.ticks`, "pressed-edge input must occupy exactly one tick");
  }

  return Object.freeze({ tick, ticks, input });
}

function validateHashCheckpoint(
  value: unknown,
  index: number,
  tickCount: number,
  previousTick: number,
): ReplayHashCheckpointV1 {
  const path = `replay.hashes[${index}]`;
  const checkpoint = record(value, path);
  exactKeys(checkpoint, ["tick", "hash"], [], path);

  const tick = integer(checkpoint.tick, `${path}.tick`, 0, tickCount);
  if (tick <= previousTick) {
    invalid(`${path}.tick`, "hash checkpoints must be strictly increasing");
  }

  return Object.freeze({
    tick,
    hash: validateReplayHash(checkpoint.hash, `${path}.hash`),
  });
}

function validateOutcome(value: unknown, tickCount: number): ReplayOutcomeV1 {
  const path = "replay.outcome";
  const outcome = record(value, path);
  exactKeys(
    outcome,
    [
      "missionId",
      "status",
      "deaths",
      "optionalObjectiveIds",
      "optionalObjectiveCount",
      "shotsFired",
      "shotsHit",
      "vehicleDamage",
    ],
    ["completionTick"],
    path,
  );

  if (
    typeof outcome.status !== "string" ||
    !OUTCOME_STATUSES.has(outcome.status as ReplayOutcomeStatus)
  ) {
    invalid(`${path}.status`, "expected completed, failed, or abandoned");
  }
  const status = outcome.status as ReplayOutcomeStatus;

  const hasCompletionTick = Object.prototype.hasOwnProperty.call(
    outcome,
    "completionTick",
  );
  if (status === "completed" && !hasCompletionTick) {
    invalid(
      `${path}.completionTick`,
      "completed runs require a completion tick",
    );
  }
  if (status !== "completed" && hasCompletionTick) {
    invalid(
      `${path}.completionTick`,
      "only completed runs may include a completion tick",
    );
  }

  if (!Array.isArray(outcome.optionalObjectiveIds)) {
    invalid(`${path}.optionalObjectiveIds`, "expected an array");
  }
  if (outcome.optionalObjectiveIds.length > REPLAY_LIMITS.maxObjectiveIds) {
    invalid(`${path}.optionalObjectiveIds`, "too many objective identifiers");
  }
  const optionalObjectiveIds = outcome.optionalObjectiveIds.map(
    (value, index) =>
      identifier(value, `${path}.optionalObjectiveIds[${index}]`),
  );
  if (new Set(optionalObjectiveIds).size !== optionalObjectiveIds.length) {
    invalid(
      `${path}.optionalObjectiveIds`,
      "objective identifiers must be unique",
    );
  }

  const optionalObjectiveCount = integer(
    outcome.optionalObjectiveCount,
    `${path}.optionalObjectiveCount`,
    0,
    REPLAY_LIMITS.maxObjectiveIds,
  );
  if (optionalObjectiveIds.length > optionalObjectiveCount) {
    invalid(
      `${path}.optionalObjectiveIds`,
      "completed objectives exceed the available objective count",
    );
  }

  const shotsFired = integer(
    outcome.shotsFired,
    `${path}.shotsFired`,
    0,
    REPLAY_LIMITS.maxTicks,
  );
  const shotsHit = integer(outcome.shotsHit, `${path}.shotsHit`, 0, shotsFired);

  const completionTick = hasCompletionTick
    ? integer(outcome.completionTick, `${path}.completionTick`, 0, tickCount)
    : undefined;

  return Object.freeze({
    missionId: identifier(outcome.missionId, `${path}.missionId`),
    status,
    ...(completionTick === undefined ? {} : { completionTick }),
    deaths: integer(
      outcome.deaths,
      `${path}.deaths`,
      0,
      REPLAY_LIMITS.maxTicks,
    ),
    optionalObjectiveIds: Object.freeze(optionalObjectiveIds),
    optionalObjectiveCount,
    shotsFired,
    shotsHit,
    vehicleDamage: finiteNumber(
      outcome.vehicleDamage,
      `${path}.vehicleDamage`,
      0,
      100,
    ),
  });
}

export function validateReplayTape(value: unknown): ReplayTapeV1 {
  const replay = record(value, "replay");
  exactKeys(
    replay,
    ["version", "contractVersion", "seed", "tickCount", "runs"],
    ["hashes", "outcome"],
    "replay",
  );

  if (replay.version !== REPLAY_TAPE_VERSION) {
    invalid("replay.version", `expected version ${REPLAY_TAPE_VERSION}`);
  }
  if (replay.contractVersion !== CONTRACT_VERSION) {
    invalid(
      "replay.contractVersion",
      `expected contract version ${CONTRACT_VERSION}`,
    );
  }

  const tickCount = integer(
    replay.tickCount,
    "replay.tickCount",
    0,
    REPLAY_LIMITS.maxTicks,
  );
  if (!Array.isArray(replay.runs)) {
    invalid("replay.runs", "expected an array");
  }
  if (replay.runs.length > REPLAY_LIMITS.maxRuns) {
    invalid("replay.runs", "too many input runs");
  }

  const runs: ReplayInputRunV1[] = [];
  let expectedTick = 0;
  for (let index = 0; index < replay.runs.length; index += 1) {
    const run = validateRun(replay.runs[index], index, expectedTick);
    const previous = runs.at(-1);
    if (
      previous &&
      !hasReplayInputEdge(previous.input) &&
      !hasReplayInputEdge(run.input) &&
      inputFramesEqual(previous.input, run.input)
    ) {
      invalid(
        `replay.runs[${index}]`,
        "adjacent identical runs must be merged",
      );
    }
    runs.push(run);
    expectedTick += run.ticks;
  }
  if (expectedTick !== tickCount) {
    invalid(
      "replay.tickCount",
      `declares ${tickCount} ticks but runs contain ${expectedTick}`,
    );
  }

  let hashes: readonly ReplayHashCheckpointV1[] | undefined;
  if (Object.prototype.hasOwnProperty.call(replay, "hashes")) {
    if (!Array.isArray(replay.hashes)) {
      invalid("replay.hashes", "expected an array");
    }
    if (replay.hashes.length > REPLAY_LIMITS.maxHashCheckpoints) {
      invalid("replay.hashes", "too many hash checkpoints");
    }

    const validated: ReplayHashCheckpointV1[] = [];
    let previousTick = -1;
    for (let index = 0; index < replay.hashes.length; index += 1) {
      const checkpoint = validateHashCheckpoint(
        replay.hashes[index],
        index,
        tickCount,
        previousTick,
      );
      validated.push(checkpoint);
      previousTick = checkpoint.tick;
    }
    hashes = Object.freeze(validated);
  }

  const outcome = Object.prototype.hasOwnProperty.call(replay, "outcome")
    ? validateOutcome(replay.outcome, tickCount)
    : undefined;

  return Object.freeze({
    version: REPLAY_TAPE_VERSION,
    contractVersion: CONTRACT_VERSION,
    seed: integer(replay.seed, "replay.seed", 0, 0xffff_ffff),
    tickCount,
    runs: Object.freeze(runs),
    ...(hashes === undefined ? {} : { hashes }),
    ...(outcome === undefined ? {} : { outcome }),
  });
}

export function isReplayTape(value: unknown): value is ReplayTapeV1 {
  try {
    validateReplayTape(value);
    return true;
  } catch {
    return false;
  }
}

export function replayJsonByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function importReplayJson(json: string): ReplayTapeV1 {
  if (typeof json !== "string") {
    return invalid("replay", "expected JSON text");
  }
  if (replayJsonByteLength(json) > REPLAY_LIMITS.maxJsonBytes) {
    return invalid("replay", "JSON exceeds the replay byte limit");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return invalid("replay", "invalid JSON");
  }
  return validateReplayTape(parsed);
}

export function exportReplayJson(replay: ReplayTapeV1): string {
  const json = JSON.stringify(validateReplayTape(replay));
  if (replayJsonByteLength(json) > REPLAY_LIMITS.maxJsonBytes) {
    return invalid("replay", "JSON exceeds the replay byte limit");
  }
  return json;
}
