import { describe, expect, it } from "vitest";
import { createBayCityLayout } from "./city-layout";
import { createFacadeDetailPlan } from "./facade-details";

describe("createFacadeDetailPlan", () => {
  it("derives stable facade geometry from the authoritative city layout", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const first = createFacadeDetailPlan(layout);
    const second = createFacadeDetailPlan(layout);

    expect(second).toEqual(first);
    expect(first.glazing.length).toBeGreaterThan(
      layout.windows.length / 2 + layout.buildings.length,
    );
    expect(first.glazing.length).toBeLessThan(
      layout.windows.length + layout.buildings.length * 2,
    );
    expect(first.frames.length).toBeGreaterThan(first.glazing.length * 2);
    expect(first.structure.length).toBeGreaterThan(layout.buildings.length * 8);
    expect(first.structure.length).toBeLessThan(12_000);
  });

  it("keeps mobile geometry materially lighter than desktop", () => {
    const desktop = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const mobile = createBayCityLayout({ quality: "mobile", seed: 2407 });
    const desktopPlan = createFacadeDetailPlan(desktop);
    const mobilePlan = createFacadeDetailPlan(mobile);

    expect(mobilePlan.glazing).toHaveLength(
      mobile.windows.length + mobile.buildings.length,
    );
    expect(mobilePlan.glazing.length).toBeLessThan(desktopPlan.glazing.length);
    expect(mobilePlan.frames.length).toBeLessThan(desktopPlan.frames.length);
    expect(mobilePlan.structure.length).toBeLessThan(
      desktopPlan.structure.length,
    );
  });

  it("emits unique, finite, positive-size instances", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const plan = createFacadeDetailPlan(layout);
    const instances = [...plan.glazing, ...plan.frames, ...plan.structure];
    const ids = new Set(instances.map((instance) => instance.id));

    expect(ids.size).toBe(instances.length);
    for (const instance of instances) {
      expect(instance.position.every(Number.isFinite), instance.id).toBe(true);
      expect(
        instance.scale.every((value) => value > 0),
        instance.id,
      ).toBe(true);
    }
  });
});
