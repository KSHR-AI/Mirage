import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, EMPTY_INPUT_FRAME } from "../core/contracts";
import {
  exportReplayJson,
  importReplayJson,
  isReplayTape,
  replayJsonByteLength,
  ReplayValidationError,
  validateReplayTape,
} from "./codec";
import { ReplayRecorder } from "./recorder";
import { REPLAY_LIMITS, REPLAY_TAPE_VERSION } from "./types";
import type { ReplayOutcomeV1, ReplayTapeV1 } from "./types";

type MutableRecord = Record<string, unknown>;

const completedOutcome: ReplayOutcomeV1 = {
  missionId: "afterlight-job",
  status: "completed",
  completionTick: 3,
  deaths: 1,
  optionalObjectiveIds: ["clean-boost", "keep-bearer-bonds"],
  optionalObjectiveCount: 5,
  shotsFired: 24,
  shotsHit: 15,
  vehicleDamage: 22.5,
};

function baseTape(): ReplayTapeV1 {
  const recorder = new ReplayRecorder(2407);
  recorder.recordHash(0, "0123456789abcdef");
  recorder.appendFrame({ ...EMPTY_INPUT_FRAME, move: [0.5, 1] });
  recorder.appendFrame({ ...EMPTY_INPUT_FRAME, move: [0.5, 1] });
  recorder.appendFrame({ ...EMPTY_INPUT_FRAME, interactPressed: true });
  recorder.recordHash(3, "fedcba9876543210");
  return recorder.finish(completedOutcome);
}

function mutableTape(): MutableRecord {
  return JSON.parse(exportReplayJson(baseTape())) as MutableRecord;
}

function mutableRuns(replay: MutableRecord): MutableRecord[] {
  return replay.runs as MutableRecord[];
}

describe("replay JSON codec", () => {
  it("round-trips a canonical tape without losing input or metadata", () => {
    const original = baseTape();
    const json = exportReplayJson(original);
    const imported = importReplayJson(json);

    expect(imported).toEqual(original);
    expect(exportReplayJson(imported)).toBe(json);
    expect(Object.isFrozen(imported)).toBe(true);
    expect(Object.isFrozen(imported.runs)).toBe(true);
    expect(Object.isFrozen(imported.outcome?.optionalObjectiveIds)).toBe(true);
  });

  it("measures UTF-8 bytes rather than JavaScript code units", () => {
    expect(replayJsonByteLength("mirage")).toBe(6);
    expect(replayJsonByteLength("\u{1f303}")).toBe(4);
  });

  it("rejects malformed and oversized JSON before trusting its shape", () => {
    expect(() => importReplayJson("{not-json")).toThrow("invalid JSON");
    expect(() => importReplayJson("null")).toThrow("expected an object");
    expect(() =>
      importReplayJson(" ".repeat(REPLAY_LIMITS.maxJsonBytes + 1)),
    ).toThrow("byte limit");
  });

  it("rejects unknown fields, arrays, and non-plain direct objects", () => {
    const unknown = mutableTape();
    unknown.admin = true;
    expect(() => validateReplayTape(unknown)).toThrow("unknown field");
    expect(() => validateReplayTape([])).toThrow("expected an object");
    expect(() => validateReplayTape(new Date())).toThrow("plain object");
  });

  it("rejects prototype-shaped JSON keys instead of merging them", () => {
    const replay = mutableTape();
    Object.defineProperty(replay, "__proto__", {
      configurable: true,
      enumerable: true,
      value: { polluted: true },
    });
    expect(() => validateReplayTape(replay)).toThrow("unknown field");
    expect(({} as MutableRecord).polluted).toBeUndefined();
  });

  it("enforces replay, contract, seed, and tick versions and bounds", () => {
    const version = mutableTape();
    version.version = 2;
    expect(() => validateReplayTape(version)).toThrow("expected version 1");

    const contract = mutableTape();
    contract.contractVersion = CONTRACT_VERSION + 1;
    expect(() => validateReplayTape(contract)).toThrow("contract version");

    const seed = mutableTape();
    seed.seed = 0x1_0000_0000;
    expect(() => validateReplayTape(seed)).toThrow("replay.seed");

    const ticks = mutableTape();
    ticks.tickCount = REPLAY_LIMITS.maxTicks + 1;
    expect(() => validateReplayTape(ticks)).toThrow("replay.tickCount");
  });

  it("requires contiguous runs whose sum matches tickCount", () => {
    const gap = mutableTape();
    mutableRuns(gap)[1]!.tick = 4;
    expect(() => validateReplayTape(gap)).toThrow("contiguous tick 2");

    const mismatch = mutableTape();
    mismatch.tickCount = 4;
    expect(() => validateReplayTape(mismatch)).toThrow("runs contain 3");
  });

  it("requires canonical compression while preserving edge ticks", () => {
    const identical = mutableTape();
    const first = mutableRuns(identical)[0]!;
    first.ticks = 1;
    mutableRuns(identical).splice(1, 0, {
      tick: 1,
      ticks: 1,
      input: first.input,
    });
    expect(() => validateReplayTape(identical)).toThrow(
      "identical runs must be merged",
    );

    const edge = mutableTape();
    const edgeRun = mutableRuns(edge)[1]!;
    edgeRun.ticks = 2;
    edge.tickCount = 4;
    expect(() => validateReplayTape(edge)).toThrow(
      "pressed-edge input must occupy exactly one tick",
    );
  });

  it("validates every exact input field and rejects extras", () => {
    const outOfRange = mutableTape();
    const firstInput = mutableRuns(outOfRange)[0]!.input as MutableRecord;
    firstInput.throttle = 2;
    expect(() => validateReplayTape(outOfRange)).toThrow("input.throttle");

    const nonFinite = mutableTape();
    const secondInput = mutableRuns(nonFinite)[0]!.input as MutableRecord;
    secondInput.look = [Number.NaN, 0];
    expect(() => validateReplayTape(nonFinite)).toThrow("input.look[0]");

    const extra = mutableTape();
    const thirdInput = mutableRuns(extra)[0]!.input as MutableRecord;
    thirdInput.cheat = true;
    expect(() => validateReplayTape(extra)).toThrow("unknown field");
  });

  it("requires ordered, bounded runtime-format hash checkpoints", () => {
    const unordered = mutableTape();
    unordered.hashes = [
      { tick: 2, hash: "0123456789abcdef" },
      { tick: 2, hash: "fedcba9876543210" },
    ];
    expect(() => validateReplayTape(unordered)).toThrow("strictly increasing");

    const future = mutableTape();
    future.hashes = [{ tick: 4, hash: "0123456789abcdef" }];
    expect(() => validateReplayTape(future)).toThrow("replay.hashes[0].tick");

    const malformed = mutableTape();
    malformed.hashes = [{ tick: 1, hash: "ABC" }];
    expect(() => validateReplayTape(malformed)).toThrow(
      "lowercase hexadecimal",
    );
  });

  it("enforces outcome consistency and bounded counters", () => {
    const incomplete = mutableTape();
    const incompleteOutcome = incomplete.outcome as MutableRecord;
    incompleteOutcome.status = "failed";
    expect(() => validateReplayTape(incomplete)).toThrow("only completed runs");

    const missing = mutableTape();
    const missingOutcome = missing.outcome as MutableRecord;
    delete missingOutcome.completionTick;
    expect(() => validateReplayTape(missing)).toThrow(
      "require a completion tick",
    );

    const duplicates = mutableTape();
    const duplicateOutcome = duplicates.outcome as MutableRecord;
    duplicateOutcome.optionalObjectiveIds = ["clean-boost", "clean-boost"];
    expect(() => validateReplayTape(duplicates)).toThrow("must be unique");

    const impossibleAccuracy = mutableTape();
    const accuracyOutcome = impossibleAccuracy.outcome as MutableRecord;
    accuracyOutcome.shotsHit = 25;
    expect(() => validateReplayTape(impossibleAccuracy)).toThrow(
      "replay.outcome.shotsHit",
    );
  });

  it("exports only validated tapes and exposes a non-throwing type guard", () => {
    const tape = baseTape();
    expect(isReplayTape(tape)).toBe(true);
    expect(isReplayTape({ version: REPLAY_TAPE_VERSION })).toBe(false);

    const invalid = { ...tape, tickCount: 99 } as ReplayTapeV1;
    expect(() => exportReplayJson(invalid)).toThrow(ReplayValidationError);
  });
});
