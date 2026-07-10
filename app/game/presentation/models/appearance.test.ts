import { describe, expect, it } from "vitest";

import {
  clampPresentationSignal,
  getAgentAppearance,
  getModelGeometryDetail,
  getVehicleAppearance,
  hashVisualId,
} from "./appearance";

describe("model appearance helpers", () => {
  it("hashes visual IDs deterministically while keeping role streams separate", () => {
    expect(hashVisualId("civilian-42", "civilian")).toBe(
      hashVisualId("civilian-42", "civilian"),
    );
    expect(hashVisualId("civilian-42", "civilian")).not.toBe(
      hashVisualId("civilian-42", "guard"),
    );
    expect(hashVisualId(Number.NaN)).toBe(hashVisualId(0));
  });

  it("produces stable, bounded civilian variation", () => {
    const first = getAgentAppearance(17, "civilian");
    const again = getAgentAppearance(17, "civilian");
    const neighbor = getAgentAppearance(18, "civilian");

    expect(first).toEqual(again);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.heightScale).toBeGreaterThanOrEqual(0.94);
    expect(first.heightScale).toBeLessThanOrEqual(1.06);
    expect(first.shoulderScale).toBeGreaterThanOrEqual(0.94);
    expect(first.shoulderScale).toBeLessThanOrEqual(1.05);
    expect(neighbor).not.toEqual(first);
  });

  it("keeps faction silhouettes authored while varying people", () => {
    const playerA = getAgentAppearance("player-a", "player");
    const playerB = getAgentAppearance("player-b", "player");
    const police = getAgentAppearance("officer-a", "police");

    expect(playerA.jacket).toBe(playerB.jacket);
    expect(playerA.accent).toBe("#d7ec62");
    expect(police.jacket).toBe("#263f54");
    expect(["cap", "crop"]).toContain(police.hairStyle);
  });

  it("returns stable authored and traffic vehicle palettes", () => {
    expect(getVehicleAppearance(1, "hero-coupe")).toEqual(
      getVehicleAppearance(999, "hero-coupe"),
    );
    expect(getVehicleAppearance(4, "traffic-sedan")).toEqual(
      getVehicleAppearance(4, "traffic-sedan"),
    );
    expect(getVehicleAppearance(4, "traffic-sedan")).not.toEqual(
      getVehicleAppearance(5, "traffic-sedan"),
    );
  });

  it("selects immutable quality budgets and sanitizes presentation signals", () => {
    const desktop = getModelGeometryDetail("desktop");
    const mobile = getModelGeometryDetail("mobile");

    expect(Object.isFrozen(desktop)).toBe(true);
    expect(desktop.radialSegments).toBeGreaterThan(mobile.radialSegments);
    expect(clampPresentationSignal(-1)).toBe(0);
    expect(clampPresentationSignal(0.35)).toBe(0.35);
    expect(clampPresentationSignal(3)).toBe(1);
    expect(clampPresentationSignal(Number.NaN)).toBe(0);
  });
});
