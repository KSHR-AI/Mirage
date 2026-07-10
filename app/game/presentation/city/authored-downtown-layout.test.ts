import { describe, expect, it } from "vitest";

import {
  AUTHORED_DOWNTOWN_PLACEMENTS,
  AUTHORED_DOWNTOWN_PROCEDURAL_PREFIXES,
  belongsToAuthoredDowntownBlock,
  isInsideAuthoredDowntownBlock,
} from "../../content/authored-downtown";
import { replaceProceduralDowntownBlocks } from "./authored-downtown-layout";
import {
  CITY_MISSION_ZONES,
  CITY_ROAD_LINES,
  createBayCityLayout,
} from "./city-layout";

const COURIER_YARD = CITY_MISSION_ZONES.find(
  (zone) => zone.id === "courier-yard",
);

describe("replaceProceduralDowntownBlocks", () => {
  it("removes only procedural architecture covered by the authored blocks", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const replacedBuildingCount = layout.buildings.filter((building) =>
      belongsToAuthoredDowntownBlock(building.id),
    ).length;
    const result = replaceProceduralDowntownBlocks(layout);

    expect(replacedBuildingCount).toBeGreaterThan(0);
    for (const prefix of AUTHORED_DOWNTOWN_PROCEDURAL_PREFIXES) {
      expect(
        layout.buildings.some((building) => building.id.startsWith(prefix)),
      ).toBe(true);
    }
    expect(result.buildings).toHaveLength(
      layout.buildings.length - replacedBuildingCount,
    );
    expect(
      result.buildings.some((building) =>
        belongsToAuthoredDowntownBlock(building.id),
      ),
    ).toBe(false);
    expect(AUTHORED_DOWNTOWN_PROCEDURAL_PREFIXES).toEqual([
      "building-14--14-",
      "building-42--14-",
      "building-42-42-",
      "building-42-70-",
      "building-70-70-",
    ]);
    expect(result.buildings).toContainEqual(
      expect.objectContaining({
        id: expect.stringContaining("building--14--14-"),
      }),
    );
    expect(result.roads).toBe(layout.roads);
    expect(result.sidewalks).toBe(layout.sidewalks);
    expect(result.missionZones).toBe(layout.missionZones);
    expect(belongsToAuthoredDowntownBlock("building-70-42-0")).toBe(false);
    expect(isInsideAuthoredDowntownBlock(70, 42)).toBe(false);
  });

  it("removes covered details while preserving the opening traversal alley", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const result = replaceProceduralDowntownBlocks(layout);

    expect(result.alleys).not.toContainEqual(
      expect.objectContaining({ id: "alley-14--14" }),
    );
    expect(
      result.roofDetails.some((detail) =>
        belongsToAuthoredDowntownBlock(detail.id),
      ),
    ).toBe(false);
    expect(
      result.windows.some((window) =>
        belongsToAuthoredDowntownBlock(window.id),
      ),
    ).toBe(false);
    expect(result.alleys).toContainEqual(
      expect.objectContaining({ id: "alley-42-70" }),
    );
  });

  it("uses exact conservative AABBs without entering roads or the courier yard", () => {
    expect(
      AUTHORED_DOWNTOWN_PLACEMENTS.map(({ collision, id }) => ({
        collision,
        id,
      })),
    ).toEqual([
      {
        collision: {
          maxX: 14.634,
          maxY: 15.3,
          maxZ: -6.559,
          minX: 5.6,
          minY: 0.3,
          minZ: -14.393,
        },
        id: "authored-downtown-medium",
      },
      {
        collision: {
          maxX: 22.4,
          maxY: 10.516,
          maxZ: -5.516,
          minX: 14.924,
          minY: 0.3,
          minZ: -14.239,
        },
        id: "authored-downtown-small",
      },
      {
        collision: {
          maxX: 50.258,
          maxY: 22.701,
          maxZ: -6.642,
          minX: 33.742,
          minY: 0.3,
          minZ: -19.958,
        },
        id: "authored-downtown-large",
      },
      {
        collision: {
          maxX: 50.258,
          maxY: 22.701,
          maxZ: 49.358,
          minX: 33.742,
          minY: 0.3,
          minZ: 36.042,
        },
        id: "authored-downtown-42-42-large",
      },
      {
        collision: {
          maxX: 40.728,
          maxY: 12.8,
          maxZ: 77.385,
          minX: 33.2,
          minY: 0.3,
          minZ: 70.856,
        },
        id: "authored-downtown-42-70-medium",
      },
      {
        collision: {
          maxX: 50.8,
          maxY: 10.516,
          maxZ: 78.484,
          minX: 43.324,
          minY: 0.3,
          minZ: 69.761,
        },
        id: "authored-downtown-42-70-small",
      },
      {
        collision: {
          maxX: 78.258,
          maxY: 22.701,
          maxZ: 77.358,
          minX: 61.742,
          minY: 0.3,
          minZ: 64.042,
        },
        id: "authored-downtown-70-70-large",
      },
    ]);

    if (!COURIER_YARD) throw new Error("missing courier-yard mission zone");
    for (const { collision } of AUTHORED_DOWNTOWN_PLACEMENTS) {
      for (const roadLine of CITY_ROAD_LINES) {
        expect(
          collision.maxX <= roadLine - 4.8 || collision.minX >= roadLine + 4.8,
        ).toBe(true);
        expect(
          collision.maxZ <= roadLine - 4.8 || collision.minZ >= roadLine + 4.8,
        ).toBe(true);
      }

      const nearestX = Math.max(
        collision.minX,
        Math.min(COURIER_YARD.position[0], collision.maxX),
      );
      const nearestZ = Math.max(
        collision.minZ,
        Math.min(COURIER_YARD.position[2], collision.maxZ),
      );
      const distanceSquared =
        (nearestX - COURIER_YARD.position[0]) ** 2 +
        (nearestZ - COURIER_YARD.position[2]) ** 2;
      expect(distanceSquared).toBeGreaterThan(COURIER_YARD.radius ** 2);
    }

    const alleyWest = AUTHORED_DOWNTOWN_PLACEMENTS.find(
      (placement) => placement.id === "authored-downtown-42-70-medium",
    );
    const alleyEast = AUTHORED_DOWNTOWN_PLACEMENTS.find(
      (placement) => placement.id === "authored-downtown-42-70-small",
    );
    expect(alleyWest?.collision.maxX).toBeLessThan(40.9);
    expect(alleyEast?.collision.minX).toBeGreaterThan(43.1);
  });
});
