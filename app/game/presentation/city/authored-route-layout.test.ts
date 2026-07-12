import { describe, expect, it } from "vitest";

import { WORLD_LAYOUT } from "../../world/world-layout";
import { CITY_ROAD_LINES, createBayCityLayout } from "./city-layout";
import { replaceProceduralDowntownBlocks } from "./authored-downtown-layout";
import {
  AUTHORED_ROUTE_FACADE_TARGET,
  AUTHORED_ROUTE_FACADE_TARGETS,
  createAuthoredRoutePlan,
} from "./authored-route-layout";
import {
  ROUTE_STREET_LIFE_DISTANCE,
  shouldShowRouteStreetLife,
} from "./route-street-life";
import { replaceSignatureCornerBuilding } from "./signature-corner-layout";

describe("createAuthoredRoutePlan", () => {
  it("only renders micro-detail near the authored route", () => {
    expect(shouldShowRouteStreetLife(0, 0)).toBe(true);
    expect(shouldShowRouteStreetLife(40, 40)).toBe(true);
    expect(shouldShowRouteStreetLife(70, 42)).toBe(false);
    expect(shouldShowRouteStreetLife(ROUTE_STREET_LIFE_DISTANCE + 0.1, 0)).toBe(
      false,
    );
  });

  it("creates a deterministic facade and street-detail plan", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const first = createAuthoredRoutePlan(layout);
    const second = createAuthoredRoutePlan(layout);

    expect(second).toEqual(first);
    for (const target of AUTHORED_ROUTE_FACADE_TARGETS) {
      expect(
        layout.buildings.some((building) => building.id === target.id),
        target.id,
      ).toBe(true);
    }
    expect(first.facade.length).toBeGreaterThan(80);
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
    expect(first.bins.length).toBeLessThanOrEqual(10);
    expect(first.barriers.length).toBeLessThanOrEqual(10);
    expect(first.storefrontGlass).toHaveLength(24);
    expect(first.storefrontFrames).toHaveLength(32);
    expect(first.awnings).toHaveLength(8);
    expect(first.signs).toHaveLength(8);
    expect(first.practicalLights).toHaveLength(4);
    expect(first.surfacePatches).toHaveLength(3);
    expect(first.manholes).toHaveLength(4);
    expect(first.drains).toHaveLength(4);
    expect(first.drainSlats).toHaveLength(20);
    expect(first.curbPaint).toHaveLength(4);
    expect(first.curbFaces).toHaveLength(8);
    expect(first.sidewalkSeams).toHaveLength(24);
    expect(first.storefrontBackdrops).toHaveLength(24);
    expect(first.storefrontArchitecture).toHaveLength(192);
    expect(first.storefrontDisplays).toHaveLength(192);
    expect(first.storefrontLightPanels).toHaveLength(24);
    expect(first.signFrames).toHaveLength(8);
    expect(first.signGlyphs).toHaveLength(24);
    expect(first.parkingMeterPoles).toHaveLength(8);
    expect(first.benchSlats).toHaveLength(6);
    expect(first.planterPots).toHaveLength(4);
    expect(first.utilityCabinets).toHaveLength(4);
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
    expect(mobile.storefrontGlass).toHaveLength(6);
    expect(mobile.storefrontFrames).toHaveLength(9);
    expect(mobile.awnings).toHaveLength(3);
    expect(mobile.signs).toHaveLength(3);
    expect(mobile.practicalLights).toHaveLength(2);
    expect(mobile.surfacePatches).toHaveLength(1);
    expect(mobile.manholes).toHaveLength(2);
    expect(mobile.drains).toHaveLength(2);
    expect(mobile.drainSlats).toHaveLength(0);
    expect(mobile.curbPaint).toHaveLength(2);
    expect(mobile.curbFaces).toHaveLength(4);
    expect(mobile.sidewalkSeams).toHaveLength(4);
    expect(mobile.storefrontBackdrops).toHaveLength(6);
    expect(mobile.storefrontArchitecture).toHaveLength(36);
    expect(mobile.storefrontDisplays).toHaveLength(0);
    expect(mobile.storefrontLightPanels).toHaveLength(6);
    expect(mobile.signFrames).toHaveLength(3);
    expect(mobile.signGlyphs).toHaveLength(6);
    expect(mobile.parkingMeterPoles).toHaveLength(4);
    expect(mobile.benchSlats).toHaveLength(2);
    expect(mobile.planterPots).toHaveLength(2);
    expect(mobile.utilityCabinets).toHaveLength(2);
  });

  it("covers the real presentation layout after authored downtown replacement", () => {
    const presentation = replaceProceduralDowntownBlocks(
      replaceSignatureCornerBuilding(
        createBayCityLayout({ quality: "desktop", seed: 2407 }),
      ),
    );
    const plan = createAuthoredRoutePlan(presentation);

    expect(
      presentation.buildings.some(
        (building) => building.id === "building-14--14-0",
      ),
    ).toBe(false);
    expect(plan.facade.length).toBeGreaterThan(120);
    expect(plan.storefrontGlass).toHaveLength(15);
    expect(plan.awnings).toHaveLength(5);
    expect(plan.practicalLights).toHaveLength(4);
    expect(plan.storefrontBackdrops).toHaveLength(15);
    expect(plan.storefrontDisplays).toHaveLength(120);
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
      ...plan.awnings,
      ...plan.benchFrames,
      ...plan.benchSlats,
      ...plan.bollards,
      ...plan.curbFaces,
      ...plan.curbPaint,
      ...plan.drainSlats,
      ...plan.drains,
      ...plan.manholes,
      ...plan.parkingMeterHeads,
      ...plan.parkingMeterPoles,
      ...plan.planterCrowns,
      ...plan.planterPots,
      ...plan.sidewalkSeams,
      ...plan.signFrames,
      ...plan.signGlyphs,
      ...plan.signs,
      ...plan.storefrontBackdrops,
      ...plan.storefrontArchitecture,
      ...plan.storefrontDisplays,
      ...plan.storefrontFrames,
      ...plan.storefrontGlass,
      ...plan.storefrontLightPanels,
      ...plan.surfacePatches,
      ...plan.utilityCabinets,
      ...plan.utilityPanels,
    ];

    for (const id of plan.licensedPropIds) {
      expect(["barrier", "bin"]).toContain(propById.get(id)?.kind);
    }
    for (const prop of layout.props.filter(
      (candidate) =>
        Math.abs(candidate.position[0]) <= 24 &&
        Math.abs(candidate.position[2]) <= 24,
    )) {
      expect(
        plan.licensedPropIds.includes(prop.id) ||
          plan.suppressedPropIds.includes(prop.id),
        prop.id,
      ).toBe(true);
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

  it("faces every authored facade toward the route and keeps road finish flat", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const plan = createAuthoredRoutePlan(layout);

    for (const target of AUTHORED_ROUTE_FACADE_TARGETS) {
      const building = layout.buildings.find(
        (candidate) => candidate.id === target.id,
      );
      expect(building, target.id).toBeDefined();
      const placements = plan.facade.filter(
        (placement) =>
          placement.id.startsWith(`${target.id}-`) &&
          placement.id.includes(`-${target.side}-`),
      );
      expect(placements.length, target.id).toBeGreaterThan(0);
      const lateral = target.side === "north" || target.side === "south";
      const edge = lateral
        ? (building?.position[2] ?? 0) +
          (target.side === "north" ? -1 : 1) * ((building?.scale[2] ?? 0) / 2)
        : (building?.position[0] ?? 0) +
          (target.side === "west" ? -1 : 1) * ((building?.scale[0] ?? 0) / 2);
      for (const placement of placements) {
        if (target.side === "north") {
          expect(placement.position[2], placement.id).toBeLessThan(edge);
          expect(placement.rotationY, placement.id).toBe(0);
        } else if (target.side === "south") {
          expect(placement.position[2], placement.id).toBeGreaterThan(edge);
          expect(placement.rotationY, placement.id).toBe(Math.PI);
        } else if (target.side === "west") {
          expect(placement.position[0], placement.id).toBeLessThan(edge);
          expect(placement.rotationY, placement.id).toBe(-Math.PI / 2);
        } else {
          expect(placement.position[0], placement.id).toBeGreaterThan(edge);
          expect(placement.rotationY, placement.id).toBe(Math.PI / 2);
        }
        expect(
          CITY_ROAD_LINES.every(
            (line) =>
              Math.abs(placement.position[lateral ? 2 : 0] - line) >
              WORLD_LAYOUT.roadWidth / 2 - 0.35,
          ),
          placement.id,
        ).toBe(true);
      }
    }

    const roadFinish = [
      ...plan.surfacePatches,
      ...plan.manholes,
      ...plan.drains,
      ...plan.drainSlats,
    ];
    for (const detail of roadFinish) {
      expect(detail.position[1], detail.id).toBeLessThanOrEqual(0.22);
      expect(detail.scale[1], detail.id).toBeLessThanOrEqual(0.03);
      expect(Math.abs(detail.position[0]), detail.id).toBeLessThan(20);
      expect(Math.abs(detail.position[2]), detail.id).toBeLessThan(20);
    }
  });
});
