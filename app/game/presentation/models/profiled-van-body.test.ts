import { describe, expect, it } from "vitest";

import {
  createProfiledVanGeometry,
  createVanSideProfile,
  type ProfiledVanDimensions,
} from "./profiled-van-body";

const DIMENSIONS: ProfiledVanDimensions = Object.freeze({
  bodyHeight: 0.82,
  bodyY: 0.74,
  cabinHeight: 1.3,
  length: 5.15,
  wheelBase: 3.25,
  wheelRadius: 0.39,
  width: 2.04,
});

describe("profiled van body", () => {
  it("creates a sloped cab and full cargo roof inside the vehicle footprint", () => {
    const profile = createVanSideProfile(DIMENSIONS, "traffic-van");
    const front = -DIMENSIONS.length / 2;
    const rear = DIMENSIONS.length / 2;

    expect(profile).toHaveLength(9);
    expect(
      profile.every(({ y, z }) => Number.isFinite(y) && Number.isFinite(z)),
    ).toBe(true);
    expect(Math.min(...profile.map(({ z }) => z))).toBe(front);
    expect(Math.max(...profile.map(({ z }) => z))).toBe(rear);
    expect(profile[3]?.y).toBeLessThan(profile[6]?.y ?? 0);
    expect(profile[5]?.z).toBeLessThan(profile[6]?.z ?? 0);
    expect(Object.isFrozen(profile)).toBe(true);
  });

  it("builds finite beveled geometry at the canonical width and length", () => {
    const geometry = createProfiledVanGeometry(DIMENSIONS, "traffic-van");
    const bounds = geometry.boundingBox;
    if (!bounds) throw new Error("missing profiled van bounds");

    expect(bounds.min.x).toBeCloseTo(-DIMENSIONS.width / 2, 2);
    expect(bounds.max.x).toBeCloseTo(DIMENSIONS.width / 2, 2);
    expect(bounds.min.z).toBeCloseTo(-DIMENSIONS.length / 2, 1);
    expect(bounds.max.z).toBeCloseTo(DIMENSIONS.length / 2, 1);
    expect(bounds.min.y).toBeGreaterThan(0);
    expect(bounds.max.y).toBeGreaterThan(2);
    expect(geometry.getAttribute("normal").count).toBeGreaterThan(50);
    geometry.dispose();
  });

  it("gives the armored courier a taller, harder roof profile", () => {
    const traffic = createVanSideProfile(DIMENSIONS, "traffic-van");
    const armored = createVanSideProfile(DIMENSIONS, "armored-courier");
    const trafficRoof = Math.max(...traffic.map(({ y }) => y));
    const armoredRoof = Math.max(...armored.map(({ y }) => y));

    expect(armoredRoof).toBeGreaterThan(trafficRoof);
    expect(armored[armored.length - 1]?.z).toBe(traffic[traffic.length - 1]?.z);
  });
});
