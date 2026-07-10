import { describe, expect, it } from "vitest";
import { EMPTY_INPUT_FRAME, type InputFrame } from "../core/contracts";
import { ReplayPlayer, replaySteps } from "./player";
import { ReplayRecorder } from "./recorder";
import type { ReplayTapeV1 } from "./types";

function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    move: [0, 0],
    look: [0, 0],
    ...overrides,
  };
}

function recordedTape(): ReplayTapeV1 {
  const recorder = new ReplayRecorder(99);
  recorder.recordHash(0, "0000000000000000");
  recorder.appendFrame(frame({ source: "keyboard", move: [0, 1] }));
  recorder.recordHash(1, "1111111111111111");
  recorder.appendFrame(frame({ source: "keyboard", move: [0, 1] }));
  recorder.appendFrame(
    frame({ source: "touch", move: [-0.5, 0.25], interactPressed: true }),
  );
  recorder.recordHash(3, "3333333333333333");
  recorder.appendFrame(
    frame({ source: "gamepad", throttle: 1, firePressed: true }),
  );
  recorder.appendFrame(
    frame({ source: "gamepad", throttle: 1, firePressed: true }),
  );
  return recorder.finish();
}

describe("ReplayPlayer", () => {
  it("iterates every reconstructed InputFrame at its exact tick", () => {
    const player = new ReplayPlayer(recordedTape());
    const steps = [...player];

    expect(steps).toHaveLength(5);
    expect(steps.map(({ tick }) => tick)).toEqual([0, 1, 2, 3, 4]);
    expect(steps[0]?.input).toEqual(
      frame({ source: "keyboard", move: [0, 1] }),
    );
    expect(steps[2]?.input).toEqual(
      frame({ source: "touch", move: [-0.5, 0.25], interactPressed: true }),
    );
    expect(steps[4]?.input).toEqual(
      frame({ source: "gamepad", throttle: 1, firePressed: true }),
    );
    expect(steps[0]?.expectedStateHash).toBe("1111111111111111");
    expect(steps[1]?.expectedStateHash).toBeUndefined();
    expect(steps[2]?.expectedStateHash).toBe("3333333333333333");
    expect(player.done).toBe(true);
    expect(player.next()).toEqual({ done: true, value: undefined });
  });

  it("preserves the recorded source instead of rewriting it to replay", () => {
    const sources = [...new ReplayPlayer(recordedTape())].map(
      ({ input }) => input.source,
    );
    expect(sources).toEqual([
      "keyboard",
      "keyboard",
      "touch",
      "gamepad",
      "gamepad",
    ]);
  });

  it("supports random access across compressed run boundaries", () => {
    const player = new ReplayPlayer(recordedTape());
    expect(player.frameAt(0).move).toEqual([0, 1]);
    expect(player.frameAt(1).move).toEqual([0, 1]);
    expect(player.frameAt(2).interactPressed).toBe(true);
    expect(player.frameAt(4).firePressed).toBe(true);
    expect(() => player.frameAt(5)).toThrow("from 0 to 4");
    expect(() => player.frameAt(-1)).toThrow("from 0 to 4");
  });

  it("reports matches, missing checkpoints, and divergence", () => {
    const player = new ReplayPlayer(recordedTape());
    expect(player.expectedHashAt(0)).toBe("0000000000000000");
    expect(player.verifyHash(0, "0000000000000000")).toEqual({
      status: "match",
      tick: 0,
      expectedHash: "0000000000000000",
      actualHash: "0000000000000000",
    });
    expect(player.verifyHash(2, "2222222222222222")).toEqual({
      status: "not-recorded",
      tick: 2,
      actualHash: "2222222222222222",
    });

    const divergence = player.verifyHash(3, "aaaaaaaaaaaaaaaa");
    expect(divergence).toEqual({
      status: "diverged",
      tick: 3,
      expectedHash: "3333333333333333",
      actualHash: "aaaaaaaaaaaaaaaa",
    });
    expect(player.firstDivergence).toBe(divergence);
  });

  it("retains only the first divergence until reset", () => {
    const player = new ReplayPlayer(recordedTape());
    const first = player.verifyHash(1, "aaaaaaaaaaaaaaaa");
    player.verifyHash(3, "bbbbbbbbbbbbbbbb");
    expect(player.firstDivergence).toBe(first);

    player.next();
    expect(player.cursor).toBe(1);
    player.reset();
    expect(player.cursor).toBe(0);
    expect(player.done).toBe(false);
    expect(player.firstDivergence).toBeUndefined();
  });

  it("validates verification hashes and tick bounds", () => {
    const player = new ReplayPlayer(recordedTape());
    expect(() => player.verifyHash(1, "not-a-hash")).toThrow("actualHash");
    expect(() => player.verifyHash(6, "0000000000000000")).toThrow(
      "from 0 to 5",
    );
    expect(() => player.expectedHashAt(-1)).toThrow("from 0 to 5");
  });

  it("offers independent iterable construction and resettable playback", () => {
    const tape = recordedTape();
    expect([...replaySteps(tape)].map(({ tick }) => tick)).toEqual([
      0, 1, 2, 3, 4,
    ]);

    const player = new ReplayPlayer(tape);
    expect(player.next().value?.tick).toBe(0);
    player.reset();
    expect([...player].map(({ tick }) => tick)).toEqual([0, 1, 2, 3, 4]);
  });

  it("handles empty tapes without fabricating a frame", () => {
    const tape = new ReplayRecorder(10).finish();
    const player = new ReplayPlayer(tape);
    expect(player.done).toBe(true);
    expect([...player]).toEqual([]);
    expect(() => player.frameAt(0)).toThrow("empty replay");
  });

  it("validates tapes at the playback boundary", () => {
    const invalid = { ...recordedTape(), tickCount: 100 } as ReplayTapeV1;
    expect(() => new ReplayPlayer(invalid)).toThrow("runs contain 5");
  });
});
