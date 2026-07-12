import { describe, expect, it } from "vitest";

import { createBayCityLayout } from "./city-layout";
import {
  SIGNATURE_CORNER_BUILDING_ID,
  createSignatureCornerPlan,
  findSignatureCornerBuilding,
  replaceSignatureCornerBuilding,
} from "./signature-corner-layout";

describe("signature corner building", () => {
  it("replaces only its procedural presentation shell and attached details", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const building = findSignatureCornerBuilding(layout);
    const result = replaceSignatureCornerBuilding(layout);

    expect(building?.id).toBe(SIGNATURE_CORNER_BUILDING_ID);
    expect(result.buildings).toHaveLength(layout.buildings.length - 1);
    expect(result.buildings).not.toContainEqual(
      expect.objectContaining({ id: SIGNATURE_CORNER_BUILDING_ID }),
    );
    expect(
      result.windows.some((window) =>
        window.id.startsWith(`${SIGNATURE_CORNER_BUILDING_ID}-`),
      ),
    ).toBe(false);
    expect(
      result.roofDetails.some((detail) =>
        detail.id.startsWith(`${SIGNATURE_CORNER_BUILDING_ID}-`),
      ),
    ).toBe(false);
    expect(layout.buildings).toContain(building);
    expect(result.roads).toBe(layout.roads);
    expect(result.sidewalks).toBe(layout.sidewalks);
  });

  it("builds a deterministic two-sided corner facade on the canonical footprint", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const building = findSignatureCornerBuilding(layout);
    if (!building) throw new Error("missing signature corner building");

    const first = createSignatureCornerPlan(building, "desktop");
    const second = createSignatureCornerPlan(building, "desktop");
    expect(second).toEqual(first);
    expect(first.mass.position[0]).toBe(building.position[0]);
    expect(first.mass.position[2]).toBe(building.position[2]);
    expect(first.mass.scale[0]).toBe(building.scale[0]);
    expect(first.mass.scale[2]).toBe(building.scale[2]);
    expect(first.mass.chamfer).toBeGreaterThan(1.5);
    expect(first.groundStructure).toHaveLength(4);
    expect(first.glass.length).toBeGreaterThan(60);
    expect(first.frames.length).toBeGreaterThan(35);
    expect(first.trim.length).toBeGreaterThan(10);
    expect(first.roof).toHaveLength(3);
    expect(first.glass.some((part) => part.id.endsWith("portal-glass"))).toBe(
      true,
    );
    expect(
      first.trim.find((part) => part.id.endsWith("portal-canopy"))?.rotationY,
    ).toBe(-Math.PI / 4);
  });

  it("keeps detail transforms valid and the mobile plan lighter", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const building = findSignatureCornerBuilding(layout);
    if (!building) throw new Error("missing signature corner building");
    const desktop = createSignatureCornerPlan(building, "desktop");
    const mobile = createSignatureCornerPlan(building, "mobile");
    const desktopParts = [
      ...desktop.frames,
      ...desktop.glass,
      ...desktop.groundStructure,
      ...desktop.lightPanels,
      ...desktop.roof,
      ...desktop.trim,
    ];
    const mobileParts = [
      ...mobile.frames,
      ...mobile.glass,
      ...mobile.groundStructure,
      ...mobile.lightPanels,
      ...mobile.roof,
      ...mobile.trim,
    ];

    expect(mobileParts.length).toBeLessThan(desktopParts.length);
    expect(new Set(desktopParts.map((part) => part.id)).size).toBe(
      desktopParts.length,
    );
    for (const part of desktopParts) {
      expect(part.position.every(Number.isFinite), part.id).toBe(true);
      expect(
        part.scale.every((value) => value > 0),
        part.id,
      ).toBe(true);
      expect(Number.isFinite(part.rotationY), part.id).toBe(true);
    }
  });
});
