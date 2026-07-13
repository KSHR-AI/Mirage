import { describe, expect, it } from "vitest";

import {
  COURIER_YARD_SECURITY_LIGHTS,
  createCourierYardDetailPlan,
} from "./courier-yard-layout";

describe("createCourierYardDetailPlan", () => {
  it("authors a deterministic open loading bay and dock frame", () => {
    const first = createCourierYardDetailPlan("desktop");
    const second = createCourierYardDetailPlan("desktop");

    expect(second).toEqual(first);
    expect(
      first.dockStructure.some((part) => part.id === "open-bay-aperture"),
    ).toBe(true);
    expect(first.interior.length).toBeGreaterThanOrEqual(6);
    expect(first.barrels).toHaveLength(3);
    expect(first.depotRoofline.length).toBeGreaterThanOrEqual(8);
    expect(first.depotGlazing).toHaveLength(5);
    expect(first.depotLightPanels).toHaveLength(5);
    expect(first.depotRelief.length).toBeGreaterThanOrEqual(12);
    expect(first.palletBoards.length).toBeGreaterThan(15);
    expect(first.drainSlats.length).toBeGreaterThan(30);
    expect(first.perimeterStructure.length).toBeGreaterThanOrEqual(8);
    expect(first.perimeterDetails.length).toBeGreaterThan(20);
    expect(first.wetPatches).toHaveLength(5);
    expect(
      first.perimeterStructure.some(
        (part) => part.id === "yard-gantry-sign-back",
      ),
    ).toBe(true);
  });

  it("keeps the initial player and coupe lane clear", () => {
    const plan = createCourierYardDetailPlan("desktop");
    const solids = [
      ...plan.barrels,
      ...plan.crateBodies,
      ...plan.depotRelief,
      ...plan.depotRoofline,
      ...plan.dockStructure,
      ...plan.interior,
      ...plan.palletBoards,
      ...plan.perimeterDetails,
      ...plan.perimeterStructure,
    ];

    for (const solid of solids) {
      const [x, y, z] = solid.position;
      const [, height] = solid.scale;
      const reachesPlayer = y - height / 2 < 1.8;
      const blocksSpawnLane =
        reachesPlayer && x >= 61.5 && x <= 66.5 && z >= 51 && z <= 58;
      expect(blocksSpawnLane, solid.id).toBe(false);
    }
  });

  it("keeps mobile materially lighter and every transform valid", () => {
    const desktop = createCourierYardDetailPlan("desktop");
    const mobile = createCourierYardDetailPlan("mobile");
    const desktopCount = Object.values(desktop).reduce(
      (total, values) => total + values.length,
      0,
    );
    const mobileCount = Object.values(mobile).reduce(
      (total, values) => total + values.length,
      0,
    );

    expect(mobileCount).toBeLessThan(desktopCount);
    expect(mobile.barrels).toHaveLength(1);
    expect(mobile.crateBodies).toHaveLength(1);
    expect(desktop.crateBodies).toHaveLength(5);
    expect(mobile.depotGlazing).toEqual(desktop.depotGlazing);
    expect(mobile.depotLightPanels).toEqual(desktop.depotLightPanels);
    expect(mobile.depotRelief).toEqual(desktop.depotRelief);
    expect(mobile.depotRoofline.length).toBeLessThan(
      desktop.depotRoofline.length,
    );
    expect(mobile.tireMarks).toHaveLength(0);
    expect(mobile.drainSlats).toHaveLength(0);
    expect(mobile.perimeterStructure).toEqual(desktop.perimeterStructure);
    expect(mobile.perimeterDetails).toHaveLength(2);
    expect(mobile.perimeterLights).toHaveLength(2);
    expect(mobile.wetPatches).toHaveLength(3);

    const ids = new Set<string>();
    for (const values of Object.values(desktop)) {
      for (const value of values) {
        expect(ids.has(value.id), value.id).toBe(false);
        ids.add(value.id);
        expect(value.position.every(Number.isFinite), value.id).toBe(true);
        const scale = Array.isArray(value.scale) ? value.scale : [value.scale];
        expect(scale.every((axis) => Number.isFinite(axis) && axis > 0)).toBe(
          true,
        );
      }
    }
  });

  it("places distinct security fixtures over the playable yard", () => {
    expect(COURIER_YARD_SECURITY_LIGHTS).toHaveLength(2);
    expect(
      new Set(COURIER_YARD_SECURITY_LIGHTS.map((light) => light.color)).size,
    ).toBe(2);
    for (const light of COURIER_YARD_SECURITY_LIGHTS) {
      expect(light.position[1]).toBeGreaterThan(5);
      expect(light.position[2]).toBeGreaterThan(48);
      expect(light.intensity).toBeGreaterThanOrEqual(15);
    }
  });
});
