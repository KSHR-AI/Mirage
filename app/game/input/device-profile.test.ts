import { describe, expect, it } from "vitest";
import { prefersTouchControls } from "./device-profile";

describe("input device profile", () => {
  it("keeps desktop controls in a narrow window with a fine pointer", () => {
    expect(
      prefersTouchControls({
        coarsePointer: false,
        finePointer: true,
        viewportWidth: 722,
      }),
    ).toBe(false);
  });

  it("uses touch controls for coarse mobile pointers", () => {
    expect(
      prefersTouchControls({
        coarsePointer: true,
        finePointer: false,
        viewportWidth: 390,
      }),
    ).toBe(true);
  });

  it("uses the compact fallback only when no fine pointer exists", () => {
    expect(
      prefersTouchControls({
        coarsePointer: false,
        finePointer: false,
        viewportWidth: 700,
      }),
    ).toBe(true);
    expect(
      prefersTouchControls({
        coarsePointer: false,
        finePointer: false,
        viewportWidth: 900,
      }),
    ).toBe(false);
  });
});
