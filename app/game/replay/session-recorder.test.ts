import { describe, expect, it } from "vitest";
import { EMPTY_INPUT_FRAME } from "../core/contracts";
import { ReplaySessionRecorder } from "./session-recorder";

const completedOutcome = {
  missionId: "afterlight-job",
  status: "completed" as const,
  deaths: 1,
  optionalObjectiveIds: ["clean-boost"],
  optionalObjectiveCount: 2,
  shotsFired: 4,
  shotsHit: 3,
  vehicleDamage: 12,
};

describe("ReplaySessionRecorder", () => {
  it("records checkpoint-origin state hashes on a relative tape clock", () => {
    const recorder = new ReplaySessionRecorder(2407, 4_800);

    recorder.appendFrame(EMPTY_INPUT_FRAME);
    recorder.recordStateHash(4_801, "1111111111111111");
    recorder.appendFrame(EMPTY_INPUT_FRAME);
    recorder.recordStateHash(4_802, "2222222222222222");

    expect(recorder.snapshot()).toMatchObject({
      tickCount: 2,
      runs: [{ tick: 0, ticks: 2 }],
      hashes: [
        { tick: 1, hash: "1111111111111111" },
        { tick: 2, hash: "2222222222222222" },
      ],
    });
  });

  it("stores checkpoint-origin completion on the same relative clock", () => {
    const recorder = new ReplaySessionRecorder(2407, 12_000);
    for (let tick = 0; tick < 3; tick += 1) {
      recorder.appendFrame(EMPTY_INPUT_FRAME);
    }

    const tape = recorder.finish({
      ...completedOutcome,
      completionStateTick: 12_003,
    });

    expect(tape.tickCount).toBe(3);
    expect(tape.outcome?.completionTick).toBe(3);
    expect(recorder.finished).toBe(true);
  });

  it("rejects state ticks before the checkpoint or beyond recorded frames", () => {
    const recorder = new ReplaySessionRecorder(2407, 900);
    recorder.appendFrame(EMPTY_INPUT_FRAME);

    expect(() => recorder.recordStateHash(899, "1111111111111111")).toThrow(
      "precedes session origin",
    );
    expect(() => recorder.recordStateHash(902, "2222222222222222")).toThrow(
      "from 0 to 1",
    );
    expect(() =>
      recorder.finish({
        ...completedOutcome,
        completionStateTick: 902,
      }),
    ).toThrow("completionTick");
    expect(recorder.finished).toBe(false);
  });

  it("uses the same zero-based semantics for a fresh mission", () => {
    const recorder = new ReplaySessionRecorder(2407, 0);
    recorder.appendFrame(EMPTY_INPUT_FRAME);

    expect(recorder.replayTickAt(1)).toBe(1);
    expect(recorder.snapshot().runs[0]?.tick).toBe(0);
  });
});
