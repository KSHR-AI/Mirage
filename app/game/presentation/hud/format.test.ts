import { describe, expect, it } from "vitest";
import {
  calculateMapRoadLayout,
  clampPercent,
  formatCash,
  formatElapsedTicks,
  formatSpeed,
  mapPointToPercent,
  summarizeObjectives,
} from "./format";

describe("HUD formatting", () => {
  it("formats bounded cash and speed values", () => {
    expect(formatCash(12500.7)).toBe("$12,501");
    expect(formatCash(-80)).toBe("$0");
    expect(formatCash(Number.NaN)).toBe("$0");
    expect(formatSpeed(7.6)).toBe("008");
    expect(formatSpeed(-4)).toBe("000");
  });

  it("formats deterministic simulation time", () => {
    expect(formatElapsedTicks(0)).toBe("00:00.00");
    expect(formatElapsedTicks(60 * 83 + 15)).toBe("01:23.25");
    expect(formatElapsedTicks(300, 30)).toBe("00:10.00");
  });

  it("clamps vital percentages", () => {
    expect(clampPercent(75, 100)).toBe(75);
    expect(clampPercent(120, 100)).toBe(100);
    expect(clampPercent(-4, 100)).toBe(0);
    expect(clampPercent(10, 0)).toBe(0);
  });
});

describe("HUD objective progress", () => {
  it("keeps required and optional progress separate", () => {
    expect(
      summarizeObjectives([
        { id: "a", label: "Required one", completed: true },
        { id: "b", label: "Required two", completed: false },
        { id: "c", label: "Optional", completed: true, optional: true },
      ]),
    ).toEqual({
      requiredCompleted: 1,
      requiredTotal: 2,
      optionalCompleted: 1,
      optionalTotal: 1,
      fraction: 0.5,
    });
  });

  it("treats an objective-free phase as complete", () => {
    expect(summarizeObjectives([]).fraction).toBe(1);
  });
});

describe("HUD minimap geometry", () => {
  it("clamps normalized points into map percentages", () => {
    expect(mapPointToPercent({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 100 });
  });

  it("lays out road segments from normalized endpoints", () => {
    expect(
      calculateMapRoadLayout({ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.6 }),
    ).toEqual({
      left: 10,
      top: 20,
      width: 50,
      rotationDegrees: 53.13010235415598,
    });
  });
});
