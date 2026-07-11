import { describe, expect, it } from "vitest";

import { resolvePlaytestInspectionPose } from "./inspection-camera";

describe("resolvePlaytestInspectionPose", () => {
  it("resolves named development inspection poses", () => {
    expect(resolvePlaytestInspectionPose("?inspect=route-block", true)).toEqual(
      {
        position: [6, 1.15, 0],
        rotationY: 0,
      },
    );
    expect(
      resolvePlaytestInspectionPose("?inspect=route-block-side", true),
    ).toEqual({
      position: [2, 1.4, 9.52],
      rotationY: Math.PI / 2,
    });
  });

  it("stays inert outside enabled playtest builds", () => {
    expect(
      resolvePlaytestInspectionPose("?inspect=route-block", false),
    ).toBeNull();
    expect(resolvePlaytestInspectionPose("?inspect=unknown", true)).toBeNull();
  });
});
