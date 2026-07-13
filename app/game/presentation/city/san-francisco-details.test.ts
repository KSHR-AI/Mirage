import { describe, expect, it } from "vitest";
import {
  createCaliforniaCableCarPlan,
  createPaintedRowPlan,
  createSanFranciscoBackdrop,
  SF_CABLE_CAR_POSITION,
} from "./san-francisco-details";

describe("San Francisco city details", () => {
  it("aligns the cable car with the paired north-south rails", () => {
    expect(SF_CABLE_CAR_POSITION[0]).toBe(-28);
    expect(SF_CABLE_CAR_POSITION[2]).toBeGreaterThan(-100);
    expect(SF_CABLE_CAR_POSITION[2]).toBeLessThan(100);
  });

  it("keeps a dense desktop hillside and a cheaper mobile silhouette", () => {
    const desktop = createSanFranciscoBackdrop("desktop");
    const mobile = createSanFranciscoBackdrop("mobile");

    expect(desktop.houses).toHaveLength(18);
    expect(desktop.roofs).toHaveLength(desktop.houses.length);
    expect(mobile.houses).toHaveLength(8);
    expect(mobile.houses.length).toBeLessThan(desktop.houses.length);
  });

  it("uses stable unique ids for every backdrop primitive", () => {
    const plan = createSanFranciscoBackdrop("desktop");
    const ids = [...plan.houses, ...plan.roofs].map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds Painted Row as navigable facades instead of flat color blocks", () => {
    const plan = createPaintedRowPlan();
    const all = [
      ...plan.opaque,
      ...plan.roofs,
      ...plan.glazing,
      ...plan.porchLights,
    ];

    expect(plan.opaque.length).toBeGreaterThanOrEqual(95);
    expect(plan.glazing).toHaveLength(25);
    expect(plan.roofs).toHaveLength(5);
    expect(plan.porchLights).toHaveLength(5);
    expect(plan.opaque.some((part) => part.id.endsWith("-step-low"))).toBe(
      true,
    );
    expect(plan.opaque.some((part) => part.id.endsWith("-bay-high"))).toBe(
      true,
    );
    expect(new Set(all.map((part) => part.id)).size).toBe(all.length);
  });

  it("gives the cable car readable platforms, windows, and undercarriage", () => {
    const plan = createCaliforniaCableCarPlan();
    const all = [...plan.opaque, ...plan.glazing, ...plan.lamps];

    expect(plan.opaque.length).toBeGreaterThanOrEqual(40);
    expect(plan.glazing).toHaveLength(12);
    expect(plan.lamps).toHaveLength(2);
    expect(plan.opaque.some((part) => part.id.includes("undercarriage"))).toBe(
      true,
    );
    expect(plan.opaque.some((part) => part.id.includes("platform-post"))).toBe(
      true,
    );
    expect(new Set(all.map((part) => part.id)).size).toBe(all.length);
  });
});
