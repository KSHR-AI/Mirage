import { describe, expect, it } from "vitest";
import {
  CITY_BLOCKS,
  CITY_BUILDINGS,
  LANDMARKS,
  ROAD_LINES,
  isDriveable,
  recoverToRoad,
} from "./map";

describe("Mirage city map", () => {
  it("defines a compact six-by-six handcrafted district", () => {
    expect(CITY_BLOCKS).toHaveLength(36);
    expect(new Set(CITY_BLOCKS.map((block) => block.district))).toEqual(
      new Set(["chinatown", "downtown", "soma", "victorian", "waterfront"]),
    );
    expect(CITY_BUILDINGS.length).toBeGreaterThan(50);
  });

  it("contains the six recognizable city landmarks", () => {
    expect(LANDMARKS.map((landmark) => landmark.id)).toEqual([
      "painted-ladies",
      "chinatown-gate",
      "market-pyramid",
      "cable-car",
      "bay-bridge",
      "pier-11",
    ]);
  });

  it("keeps collision geometry independent from visual buildings", () => {
    for (const line of ROAD_LINES) {
      expect(isDriveable({ x: line, z: 12 })).toBe(true);
      expect(isDriveable({ x: 12, z: line })).toBe(true);
    }
    expect(isDriveable({ x: 18, z: 18 })).toBe(false);
  });

  it("returns stranded cars to a valid road center", () => {
    const recovered = recoverToRoad({ x: 20, z: 19 }, 1.2);
    expect(isDriveable(recovered)).toBe(true);
    expect(ROAD_LINES).toContain(recovered.x);
  });
});
