import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CITY_DETAIL_LIMITS,
  CITY_MISSION_ZONES,
  cityLayoutCounts,
  cityLayoutFingerprint,
  cityMissionZone,
  createBayCityLayout,
} from "./city-layout";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBayCityLayout", () => {
  it("reproduces the same city for a seed", () => {
    const first = createBayCityLayout({
      quality: "desktop",
      seed: "afterlight-test",
    });
    const second = createBayCityLayout({
      quality: "desktop",
      seed: "afterlight-test",
    });

    expect(second).toEqual(first);
    expect(cityLayoutFingerprint(second)).toBe(cityLayoutFingerprint(first));
  });

  it("uses local seeded streams without Math.random", () => {
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random is forbidden in the city layout");
    });

    expect(() => createBayCityLayout({ seed: 2407 })).not.toThrow();
  });

  it("keeps landmarks and roads stable while changing procedural architecture", () => {
    const first = createBayCityLayout({ seed: "one" });
    const second = createBayCityLayout({ seed: "two" });

    expect(second.missionZones).toEqual(first.missionZones);
    expect(second.roads).toEqual(first.roads);
    expect(second.buildings.length).toBeGreaterThan(70);
    expect(first.buildings.length).toBeGreaterThan(70);
    expect(cityLayoutFingerprint(second)).not.toBe(
      cityLayoutFingerprint(first),
    );
  });

  it("bounds detail for desktop and mobile quality tiers", () => {
    const desktop = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const mobile = createBayCityLayout({ quality: "mobile", seed: 2407 });
    const desktopCounts = cityLayoutCounts(desktop);
    const mobileCounts = cityLayoutCounts(mobile);

    expect(mobile.buildings).toEqual(desktop.buildings);
    expect(mobile.roads).toEqual(desktop.roads);
    expect(mobileCounts.windows).toBeLessThan(desktopCounts.windows);
    expect(mobileCounts.streetlights).toBeLessThan(desktopCounts.streetlights);

    for (const quality of ["desktop", "mobile"] as const) {
      const counts = cityLayoutCounts(quality === "desktop" ? desktop : mobile);
      const limits = CITY_DETAIL_LIMITS[quality];
      for (const key of Object.keys(limits) as Array<keyof typeof limits>) {
        expect(counts[key], `${quality}.${key}`).toBeLessThanOrEqual(
          limits[key],
        );
      }
    }
  });

  it("reserves readable space around every authored mission zone", () => {
    const layout = createBayCityLayout({ seed: 2407 });

    for (const zone of CITY_MISSION_ZONES) {
      for (const building of layout.buildings) {
        const halfDiagonal =
          Math.hypot(building.scale[0], building.scale[2]) / 2;
        const distance = Math.hypot(
          building.position[0] - zone.position[0],
          building.position[2] - zone.position[2],
        );
        expect(distance, `${building.id} overlaps ${zone.id}`).toBeGreaterThan(
          zone.radius + halfDiagonal,
        );
      }
    }
  });

  it("exposes stable integration anchors", () => {
    expect(cityMissionZone("safehouse").position).toEqual([0, 0.3, -232]);
    expect(cityMissionZone("aurora-vault").accent).toBe("#7ee7ff");
  });
});
