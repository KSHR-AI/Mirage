import { describe, expect, it } from "vitest";

import { createBayCityLayout } from "./city-layout";
import { createAuthoredRoutePlan } from "./authored-route-layout";
import { createBlockRouteAssetPlan } from "./block-route-assets";

describe("block route assets", () => {
  it("expands the route model placements into finite batched primitives", () => {
    const route = createAuthoredRoutePlan(
      createBayCityLayout({ quality: "desktop", seed: "block-route" }),
    );
    const block = createBlockRouteAssetPlan(route);
    const batches = Object.values(block);
    const instances = batches.flat();

    expect(block.facadeWalls.length).toBeGreaterThan(0);
    expect(block.facadeGlass.length).toBeGreaterThan(0);
    expect(block.streetlightPoles).toHaveLength(route.streetlights.length);
    expect(block.binBodies).toHaveLength(route.bins.length);
    expect(block.barrierBodies).toHaveLength(route.barriers.length);
    expect(new Set(instances.map((instance) => instance.id)).size).toBe(
      instances.length,
    );
    expect(
      instances.every(
        (instance) =>
          instance.position.every(Number.isFinite) &&
          instance.scale.every((axis) => Number.isFinite(axis) && axis > 0),
      ),
    ).toBe(true);
  });

  it("inherits the mobile route budget", () => {
    const route = createAuthoredRoutePlan(
      createBayCityLayout({ quality: "mobile", seed: "block-route" }),
    );
    const block = createBlockRouteAssetPlan(route);

    expect(block.streetlightPoles.length).toBeLessThanOrEqual(2);
    expect(block.binBodies.length).toBeLessThanOrEqual(1);
    expect(block.barrierBodies.length).toBeLessThanOrEqual(1);
  });
});
