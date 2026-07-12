import { describe, expect, it } from "vitest";

import {
  createAmbientCivilianDefinitions,
  createAmbientVehicleDefinitions,
} from "./ambient-life";

describe("ambient life definitions", () => {
  it("anchors the first traffic pair to both central lanes", () => {
    const first = createAmbientVehicleDefinitions(12);
    const second = createAmbientVehicleDefinitions(12);

    expect(second).toEqual(first);
    expect(first.slice(0, 4).map(({ axis, lane }) => ({ axis, lane }))).toEqual(
      [
        { axis: "x", lane: -2.4 },
        { axis: "z", lane: -2.4 },
        { axis: "x", lane: 2.4 },
        { axis: "z", lane: 2.4 },
      ],
    );
    expect(first.slice(0, 4).every((vehicle) => !vehicle.van)).toBe(true);
    expect(first.filter((vehicle) => vehicle.van)).toHaveLength(2);
    expect(first[3]?.offset).toBe(74);
  });

  it("keeps the first pedestrians on both central sidewalks", () => {
    const civilians = createAmbientCivilianDefinitions(10);

    expect(civilians.slice(0, 4).map((civilian) => civilian.x)).toEqual([
      -6.6, 6.6, -6.6, 6.6,
    ]);
    expect(civilians.every((civilian) => civilian.speed > 0)).toBe(true);
  });
});
