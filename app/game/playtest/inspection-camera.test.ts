import { describe, expect, it } from "vitest";

import {
  isPlaytestAimInspection,
  PLAYTEST_INSPECTION_EVENT,
  resolvePlaytestInspectionKey,
  resolvePlaytestInspectionPose,
} from "./inspection-camera";

describe("resolvePlaytestInspectionPose", () => {
  it("resolves named development inspection poses", () => {
    expect(resolvePlaytestInspectionPose("?inspect=hero-close", true)).toEqual({
      position: [64, 1.15, 56],
      rotationY: Math.PI,
    });
    expect(resolvePlaytestInspectionPose("?inspect=hero-aim", true)).toEqual({
      position: [64, 1.15, 56],
      rotationY: Math.PI - 0.55,
    });
    expect(
      resolvePlaytestInspectionPose("?inspect=yard-opening", true),
    ).toEqual({
      position: [64, 1.15, 56],
      rotationY: Math.PI,
    });
    expect(resolvePlaytestInspectionPose("?inspect=route-block", true)).toEqual(
      {
        position: [0, 1.15, 0],
        rotationY: 0,
      },
    );
    expect(
      resolvePlaytestInspectionPose("?inspect=route-block-side", true),
    ).toEqual({
      position: [2, 1.4, 9.52],
      rotationY: Math.PI / 2,
    });
    expect(
      resolvePlaytestInspectionPose("?inspect=ambient-life", true),
    ).toEqual({
      position: [-4.5, 1.25, 18],
      rotationY: Math.PI / 2,
    });
    expect(resolvePlaytestInspectionPose("?inspect=street-life", true)).toEqual(
      {
        position: [0, 1.3, 2],
        rotationY: 0,
      },
    );
    expect(
      resolvePlaytestInspectionPose("?inspect=route-facade", true),
    ).toEqual({
      position: [0, 1.4, 7],
      rotationY: 1.1,
    });
    expect(
      resolvePlaytestInspectionPose("?inspect=signature-corner", true),
    ).toEqual({
      position: [0, 1.4, 0],
      rotationY: -0.7,
    });
    expect(
      resolvePlaytestInspectionPose("?inspect=vehicle-fleet", true),
    ).toEqual({
      position: [0, 1.3, 8],
      rotationY: Math.PI,
    });
    expect(
      resolvePlaytestInspectionPose("?inspect=vehicle-fleet-side", true),
    ).toEqual({
      position: [-8, 1.3, 0],
      rotationY: Math.PI / 2,
    });
  });

  it("stays inert outside enabled playtest builds", () => {
    expect(
      resolvePlaytestInspectionPose("?inspect=route-block", false),
    ).toBeNull();
    expect(resolvePlaytestInspectionPose("?inspect=unknown", true)).toBeNull();
  });

  it("resolves live inspection keys for the development camera event", () => {
    expect(PLAYTEST_INSPECTION_EVENT).toBe("mirage:inspection-pose");
    expect(resolvePlaytestInspectionKey("route-block-side", true)).toEqual({
      position: [2, 1.4, 9.52],
      rotationY: Math.PI / 2,
    });
    expect(resolvePlaytestInspectionKey("route-block-side", false)).toBeNull();
    expect(resolvePlaytestInspectionKey("unknown", true)).toBeNull();
  });

  it("only forces aim for the named development inspection", () => {
    expect(isPlaytestAimInspection("?inspect=hero-aim", true)).toBe(true);
    expect(isPlaytestAimInspection("?inspect=hero-close", true)).toBe(false);
    expect(isPlaytestAimInspection("?inspect=hero-aim", false)).toBe(false);
  });
});
