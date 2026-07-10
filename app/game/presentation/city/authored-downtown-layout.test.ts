import { describe, expect, it } from "vitest";

import { belongsToAuthoredDowntownBlock } from "../../content/authored-downtown";
import { replaceProceduralDowntownBlocks } from "./authored-downtown-layout";
import { createBayCityLayout } from "./city-layout";

describe("replaceProceduralDowntownBlocks", () => {
  it("removes only procedural architecture covered by the authored blocks", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const replacedBuildingCount = layout.buildings.filter((building) =>
      belongsToAuthoredDowntownBlock(building.id),
    ).length;
    const result = replaceProceduralDowntownBlocks(layout);

    expect(replacedBuildingCount).toBeGreaterThan(0);
    expect(result.buildings).toHaveLength(
      layout.buildings.length - replacedBuildingCount,
    );
    expect(result.buildings).not.toContainEqual(
      expect.objectContaining({
        id: expect.stringContaining("building-14--14-"),
      }),
    );
    expect(result.buildings).toContainEqual(
      expect.objectContaining({
        id: expect.stringContaining("building--14--14-"),
      }),
    );
    expect(result.roads).toBe(layout.roads);
    expect(result.sidewalks).toBe(layout.sidewalks);
    expect(result.missionZones).toBe(layout.missionZones);
  });

  it("removes block-local details that would intersect the authored geometry", () => {
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
  });
});
