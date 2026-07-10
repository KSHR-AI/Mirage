import { describe, expect, it } from "vitest";
import { EMPTY_INPUT_FRAME, type InputFrame } from "../core/contracts";
import { ReplayRecorder } from "./recorder";
import type { ReplayOutcomeV1 } from "./types";

function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    move: [0, 0],
    look: [0, 0],
    ...overrides,
  };
}

const outcome: ReplayOutcomeV1 = {
  missionId: "afterlight-job",
  status: "completed",
  completionTick: 4,
  deaths: 0,
  optionalObjectiveIds: ["clean-boost"],
  optionalObjectiveCount: 5,
  shotsFired: 12,
  shotsHit: 8,
  vehicleDamage: 14,
};

describe("ReplayRecorder", () => {
  it("run-length compresses identical held input", () => {
    const recorder = new ReplayRecorder(2407);
    const held = frame({
      source: "gamepad",
      move: [0.25, 1],
      throttle: 1,
      sprint: true,
      firePressed: true,
    });

    for (let tick = 0; tick < 120; tick += 1) {
      expect(recorder.recordFrame(tick, held)).toBe(tick);
    }

    const tape = recorder.snapshot();
    expect(tape.tickCount).toBe(120);
    expect(tape.runs).toEqual([{ tick: 0, ticks: 120, input: held }]);
  });

  it("keeps every one-shot pressed edge on its own tick", () => {
    const recorder = new ReplayRecorder(1);
    const held = frame({ throttle: 1 });
    const jump = frame({ throttle: 1, jumpPressed: true });

    recorder.appendFrame(held);
    recorder.appendFrame(held);
    recorder.appendFrame(jump);
    recorder.appendFrame(jump);
    recorder.appendFrame(held);
    recorder.appendFrame(held);

    expect(
      recorder.snapshot().runs.map(({ tick, ticks }) => ({ tick, ticks })),
    ).toEqual([
      { tick: 0, ticks: 2 },
      { tick: 2, ticks: 1 },
      { tick: 3, ticks: 1 },
      { tick: 4, ticks: 2 },
    ]);
  });

  it("splits runs when any exact input field changes", () => {
    const recorder = new ReplayRecorder(2);
    recorder.appendFrame(frame({ source: "keyboard", steer: 0.25 }));
    recorder.appendFrame(frame({ source: "touch", steer: 0.25 }));
    recorder.appendFrame(frame({ source: "touch", steer: 0.5 }));
    recorder.appendFrame(frame({ source: "touch", steer: 0.5, aim: true }));

    expect(recorder.snapshot().runs).toHaveLength(4);
  });

  it("copies and freezes caller input", () => {
    const mutable = frame({ move: [0.5, -0.5] });
    const recorder = new ReplayRecorder(3);
    recorder.appendFrame(mutable);

    (mutable.move as [number, number])[0] = 1;
    const recorded = recorder.snapshot().runs[0]?.input;
    expect(recorded?.move).toEqual([0.5, -0.5]);
    expect(Object.isFrozen(recorded)).toBe(true);
    expect(Object.isFrozen(recorded?.move)).toBe(true);
  });

  it("records exact state-tick hashes independently of input ticks", () => {
    const recorder = new ReplayRecorder(4);
    recorder.recordHash(0, "0000000000000000");
    recorder.appendFrame(frame());
    recorder.recordHash(1, "1111111111111111");

    expect(recorder.snapshot().hashes).toEqual([
      { tick: 0, hash: "0000000000000000" },
      { tick: 1, hash: "1111111111111111" },
    ]);
  });

  it("rejects gaps, duplicate hashes, future hashes, and invalid seeds", () => {
    const recorder = new ReplayRecorder(5);
    expect(() => recorder.recordFrame(1, frame())).toThrow("expected tick 0");
    expect(() => recorder.recordHash(1, "0000000000000000")).toThrow(
      "from 0 to 0",
    );
    recorder.recordHash(0, "0000000000000000");
    expect(() => recorder.recordHash(0, "1111111111111111")).toThrow(
      "strictly increasing",
    );
    expect(() => new ReplayRecorder(-1)).toThrow("unsigned 32-bit");
    expect(() => new ReplayRecorder(1.5)).toThrow("unsigned 32-bit");
  });

  it("rejects invalid frame values before recording", () => {
    const recorder = new ReplayRecorder(6);
    expect(() => recorder.appendFrame(frame({ throttle: Number.NaN }))).toThrow(
      "input.throttle",
    );
    expect(recorder.tickCount).toBe(0);
  });

  it("attaches validated outcome metadata and locks after finish", () => {
    const recorder = new ReplayRecorder(7);
    for (let tick = 0; tick < 4; tick += 1) recorder.appendFrame(frame());

    const tape = recorder.finish(outcome);
    expect(tape.outcome).toEqual(outcome);
    expect(recorder.finished).toBe(true);
    expect(() => recorder.appendFrame(frame())).toThrow("already finished");
    expect(() => recorder.recordHash(4, "0000000000000000")).toThrow(
      "already finished",
    );
    expect(() => recorder.finish()).toThrow("already finished");
  });

  it("does not lock when a finishing outcome fails validation", () => {
    const recorder = new ReplayRecorder(8);
    recorder.appendFrame(frame());
    expect(() => recorder.finish({ ...outcome, completionTick: 2 })).toThrow(
      "completionTick",
    );
    expect(recorder.finished).toBe(false);
    expect(recorder.tickCount).toBe(1);
  });
});
