import { describe, expect, it } from "vitest";

import { createBayCityLayout } from "./city-layout";
import {
  AUTHORED_ROUTE_FACADE_TARGET,
  createAuthoredRoutePlan,
} from "./authored-route-layout";

describe("createAuthoredRoutePlan", () => {
  it("creates a deterministic facade and street-detail plan", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const first = createAuthoredRoutePlan(layout);
    const second = createAuthoredRoutePlan(layout);

    expect(second).toEqual(first);
    expect(
      layout.buildings.some(
        (building) => building.id === AUTHORED_ROUTE_FACADE_TARGET,
      ),
    ).toBe(true);
    expect(first.facade.length).toBeGreaterThan(20);
    expect(first.fireEscapes).toHaveLength(1);
    const target = layout.buildings.find(
      (building) => building.id === AUTHORED_ROUTE_FACADE_TARGET,
    );
    expect(target).toBeDefined();
    expect(first.fireEscapes[0]?.position[0]).toBeLessThan(
      (target?.position[0] ?? 0) - (target?.scale[0] ?? 0) / 2,
    );
    expect(first.fireEscapes[0]?.rotationY).toBe(Math.PI / 2);
    expect(first.streetlights).toHaveLength(7);
    expect(first.bins.length).toBeLessThanOrEqual(5);
    expect(first.barriers.length).toBeLessThanOrEqual(5);
  });

  it("keeps the mobile plan materially lighter", () => {
    const desktop = createAuthoredRoutePlan(
      createBayCityLayout({ quality: "desktop", seed: 2407 }),
    );
    const mobile = createAuthoredRoutePlan(
      createBayCityLayout({ quality: "mobile", seed: 2407 }),
    );

    expect(mobile.facade.length).toBeLessThan(desktop.facade.length);
    expect(mobile.fireEscapes).toHaveLength(0);
    expect(mobile.streetlights).toHaveLength(2);
    expect(mobile.bins.length).toBeLessThanOrEqual(1);
    expect(mobile.barriers.length).toBeLessThanOrEqual(1);
  });

  it("only replaces matching primitives and emits valid transforms", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const plan = createAuthoredRoutePlan(layout);
    const propById = new Map(layout.props.map((prop) => [prop.id, prop]));
    const lightById = new Map(
      layout.streetlights.map((light) => [light.id, light]),
    );
    const placements = [
      ...plan.facade,
      ...plan.fireEscapes,
      ...plan.bins,
      ...plan.barriers,
      ...plan.streetlights,
    ];

    for (const id of plan.licensedPropIds) {
      expect(["barrier", "bin"]).toContain(propById.get(id)?.kind);
    }
    for (const id of plan.licensedStreetlightIds) {
      expect(lightById.has(id)).toBe(true);
    }
    expect(new Set(placements.map((placement) => placement.id)).size).toBe(
      placements.length,
    );
    for (const placement of placements) {
      expect(placement.position.every(Number.isFinite), placement.id).toBe(
        true,
      );
      expect(
        placement.scale.every((value) => value > 0),
        placement.id,
      ).toBe(true);
    }
  });
});
