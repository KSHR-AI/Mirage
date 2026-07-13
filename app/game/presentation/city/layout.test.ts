import { afterEach, describe, expect, it, vi } from "vitest";
import { WORLD_LAYOUT } from "../../world/world-layout";
import {
  CITY_BLOCK_CENTERS,
  CITY_DETAIL_LIMITS,
  CITY_EXTENTS,
  CITY_MISSION_ZONES,
  CITY_ROAD_LINES,
  CITY_STREET_FEATURE_CLEARANCES,
  cityLayoutCounts,
  cityLayoutFingerprint,
  cityMissionZone,
  createBayCityLayout,
} from "./city-layout";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBayCityLayout", () => {
  it("derives presentation geometry from the world layout contract", () => {
    expect(CITY_ROAD_LINES).toBe(WORLD_LAYOUT.roadLines);
    expect(CITY_BLOCK_CENTERS).toBe(WORLD_LAYOUT.blockCenters);
    expect(CITY_EXTENTS).toBe(WORLD_LAYOUT.extents);

    expect(CITY_BLOCK_CENTERS).toEqual(
      CITY_ROAD_LINES.slice(0, -1).map(
        (line, index) => (line + (CITY_ROAD_LINES[index + 1] as number)) / 2,
      ),
    );
  });

  it("centers every rendered road on a canonical road line", () => {
    const layout = createBayCityLayout({ seed: "road-contract" });
    const verticalRoads = layout.roads.filter((road) =>
      road.id.startsWith("road-v-"),
    );
    const horizontalRoads = layout.roads.filter((road) =>
      road.id.startsWith("road-h-"),
    );

    expect(verticalRoads.map((road) => road.position[0])).toEqual(
      WORLD_LAYOUT.roadLines,
    );
    expect(horizontalRoads.map((road) => road.position[2])).toEqual(
      WORLD_LAYOUT.roadLines,
    );
    expect(
      verticalRoads.every((road) => road.scale[0] === WORLD_LAYOUT.roadWidth),
    ).toBe(true);
    expect(
      horizontalRoads.every((road) => road.scale[2] === WORLD_LAYOUT.roadWidth),
    ).toBe(true);
  });

  it("keeps lane dashes out of intersections on every quality tier", () => {
    const intersectionClearance = WORLD_LAYOUT.roadWidth / 2 + 2.4;

    for (const quality of ["desktop", "mobile"] as const) {
      const laneMarks = createBayCityLayout({ quality, seed: 2407 }).laneMarks;
      expect(laneMarks.some((mark) => mark.id.startsWith("mark-v-"))).toBe(
        true,
      );
      expect(laneMarks.some((mark) => mark.id.startsWith("mark-h-"))).toBe(
        true,
      );

      for (const mark of laneMarks) {
        const travel = mark.id.startsWith("mark-v-")
          ? mark.position[2]
          : mark.position[0];
        expect(
          CITY_ROAD_LINES.every(
            (intersection) =>
              Math.abs(travel - intersection) >= intersectionClearance,
          ),
          `${mark.id} crosses an intersection`,
        ).toBe(true);
      }
    }
  });

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

  it("keeps traversal and camera clear around critical approaches", () => {
    for (const quality of ["desktop", "mobile"] as const) {
      const layout = createBayCityLayout({ quality, seed: 2407 });
      const features = [
        ...layout.streetlights,
        ...layout.trafficSignals,
        ...layout.props,
        ...layout.trees,
      ];

      for (const clearance of CITY_STREET_FEATURE_CLEARANCES) {
        for (const feature of features) {
          const distance = Math.hypot(
            feature.position[0] - clearance.position[0],
            feature.position[2] - clearance.position[1],
          );
          expect(
            distance,
            `${feature.id} blocks ${clearance.id}`,
          ).toBeGreaterThan(clearance.radius);
        }
      }
    }
  });

  it("exposes stable integration anchors", () => {
    expect(cityMissionZone("safehouse").position).toEqual([0, 0.3, -232]);
    expect(cityMissionZone("aurora-vault").accent).toBe("#7ee7ff");
  });
});
