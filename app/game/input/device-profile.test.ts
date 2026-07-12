import { describe, expect, it } from "vitest";
import { prefersTouchControls } from "./device-profile";

describe("input device profile", () => {
  it("keeps desktop controls in a narrow window with a fine pointer", () => {
    expect(
      prefersTouchControls({
        coarsePointer: false,
        finePointer: true,
        touchPoints: 0,
        viewportWidth: 722,
      }),
    ).toBe(false);
  });

  it("uses touch controls for coarse mobile pointers", () => {
    expect(
      prefersTouchControls({
        coarsePointer: true,
        finePointer: false,
        touchPoints: 1,
        viewportWidth: 390,
      }),
    ).toBe(true);
  });

  it("prefers touch on a narrow touch device that also reports fine input", () => {
    expect(
      prefersTouchControls({
        coarsePointer: true,
        finePointer: true,
        touchPoints: 5,
        viewportWidth: 390,
      }),
    ).toBe(true);
  });

  it("uses the compact fallback only when no fine pointer exists", () => {
    expect(
      prefersTouchControls({
        coarsePointer: false,
        finePointer: false,
        touchPoints: 0,
        viewportWidth: 700,
      }),
    ).toBe(true);
    expect(
      prefersTouchControls({
        coarsePointer: false,
        finePointer: false,
        touchPoints: 0,
        viewportWidth: 900,
      }),
    ).toBe(false);
  });
});
