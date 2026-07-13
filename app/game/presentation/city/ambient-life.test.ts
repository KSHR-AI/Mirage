import { describe, expect, it } from "vitest";

import {
  createAmbientCivilianDefinitions,
  createAmbientVehicleDefinitions,
  sampleAmbientCivilianMotion,
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
    expect(first.slice(0, 4).map((vehicle) => vehicle.offset)).toEqual([
      18, -18, -42, 42,
    ]);
  });

  it("keeps the first pedestrians on both central sidewalks", () => {
    const civilians = createAmbientCivilianDefinitions(10);

    expect(civilians.slice(0, 4).map((civilian) => civilian.x)).toEqual([
      -6.6, 6.6, -6.6, 6.6,
    ]);
    expect(civilians.slice(0, 4).map((civilian) => civilian.startZ)).toEqual([
      18, -20, 28, -30,
    ]);
    expect(civilians.every((civilian) => civilian.speed > 0)).toBe(true);
    expect(civilians.some((civilian) => civilian.idleSeconds === 0)).toBe(true);
    expect(civilians.some((civilian) => civilian.idleSeconds > 0)).toBe(true);
    expect(
      new Set(civilians.map((civilian) => civilian.phaseSeconds)).size,
    ).toBe(civilians.length);
    const initialMotion = civilians.map((civilian) =>
      sampleAmbientCivilianMotion(civilian, 0),
    );
    expect(initialMotion.some((motion) => motion.walking)).toBe(true);
    expect(initialMotion.some((motion) => !motion.walking)).toBe(true);
  });

  it("stops travel during deterministic idle windows", () => {
    const pedestrian = {
      ...createAmbientCivilianDefinitions(1)[0],
      idleSeconds: 2,
      phaseSeconds: 0,
      walkSeconds: 4,
    };
    const walking = sampleAmbientCivilianMotion(pedestrian, 2);
    const stopped = sampleAmbientCivilianMotion(pedestrian, 5);
    const resumed = sampleAmbientCivilianMotion(pedestrian, 7);

    expect(walking).toEqual({ travelSeconds: 2, walking: true });
    expect(stopped).toEqual({ travelSeconds: 4, walking: false });
    expect(resumed).toEqual({ travelSeconds: 5, walking: true });
    expect(sampleAmbientCivilianMotion(pedestrian, Number.NaN)).toEqual({
      travelSeconds: 0,
      walking: true,
    });
  });
});
