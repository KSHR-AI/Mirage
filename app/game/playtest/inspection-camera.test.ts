import { describe, expect, it } from "vitest";

import {
  isPlaytestAimInspection,
  resolvePlaytestInspectionPose,
} from "./inspection-camera";

describe("resolvePlaytestInspectionPose", () => {
  it("resolves named development inspection poses", () => {
    expect(resolvePlaytestInspectionPose("?inspect=hero-close", true)).toEqual({
      position: [64, 1.4, 58.5],
      rotationY: 0,
    });
    expect(resolvePlaytestInspectionPose("?inspect=hero-aim", true)).toEqual({
      position: [64, 1.15, 56],
      rotationY: -0.55,
    });
    expect(
      resolvePlaytestInspectionPose("?inspect=yard-opening", true),
    ).toEqual({
      position: [64, 1.15, 56],
      rotationY: Math.PI,
    });
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

  it("only forces aim for the named development inspection", () => {
    expect(isPlaytestAimInspection("?inspect=hero-aim", true)).toBe(true);
    expect(isPlaytestAimInspection("?inspect=hero-close", true)).toBe(false);
    expect(isPlaytestAimInspection("?inspect=hero-aim", false)).toBe(false);
  });
});
