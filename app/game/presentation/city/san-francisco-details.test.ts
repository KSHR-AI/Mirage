import { describe, expect, it } from "vitest";
import {
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
});
