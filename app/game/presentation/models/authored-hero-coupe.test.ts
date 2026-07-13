import { describe, expect, it } from "vitest";

import {
  AUTHORED_HERO_COUPE_SCALE,
  AUTHORED_HERO_COUPE_REQUIRED_NODES,
  AUTHORED_POLICE_COUPE_PALETTE,
  advanceAuthoredWheelSpin,
  getAuthoredHeroCoupeMaterialTreatment,
  getAuthoredTrafficCoupePalette,
  sampleAuthoredCoupeBodyMotion,
  sampleAuthoredCoupeIdleMotion,
} from "./authored-hero-coupe";

describe("authored hero coupe", () => {
  it("advances wheel spin deterministically and wraps full rotations", () => {
    const first = advanceAuthoredWheelSpin(6.2, 12, 1 / 60);
    const second = advanceAuthoredWheelSpin(6.2, 12, 1 / 60);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(Math.PI * 2);
    expect(advanceAuthoredWheelSpin(1, -2, 1 / 60)).toBeLessThan(1);
  });

  it("clamps suspended-frame time and rejects non-finite signals", () => {
    expect(advanceAuthoredWheelSpin(1, Number.NaN, 1)).toBe(1);
    expect(advanceAuthoredWheelSpin(0, 10, 10)).toBeCloseTo(4.8);
    expect(AUTHORED_HERO_COUPE_SCALE).toEqual([0.76, 1.08, 1.04]);
  });

  it("adds restrained engine vibration only to an idling active coupe", () => {
    const idle = sampleAuthoredCoupeIdleMotion(0.4, 0, false);
    const moving = sampleAuthoredCoupeIdleMotion(0.4, 1, false);
    const disabled = sampleAuthoredCoupeIdleMotion(0.4, 0, true);

    expect(Math.abs(idle.height)).toBeLessThanOrEqual(0.006);
    expect(Math.abs(idle.roll)).toBeLessThanOrEqual(0.0016);
    expect(moving).toEqual({ height: 0, roll: 0 });
    expect(disabled).toEqual({ height: 0, roll: 0 });
  });

  it("converts vehicle loads into bounded chassis pitch, roll, and heave", () => {
    const loaded = sampleAuthoredCoupeBodyMotion(0.5, 9, 1, -1, false);
    const neutral = sampleAuthoredCoupeBodyMotion(0.5, 9, 0, 0, false);
    const disabled = sampleAuthoredCoupeBodyMotion(0.5, 9, 1, -1, true);

    expect(loaded.roll).toBeLessThan(neutral.roll - 0.05);
    expect(loaded.pitch).toBeGreaterThan(0.02);
    expect(Math.abs(loaded.height)).toBeLessThanOrEqual(0.0022);
    expect(disabled).toEqual({ height: 0, pitch: 0, roll: 0 });
  });

  it("keeps the optimized asset's chassis and wheel pivot contract explicit", () => {
    expect(AUTHORED_HERO_COUPE_REQUIRED_NODES).toEqual([
      "BodyUnderside",
      "WheelFrontL",
      "WheelFrontR",
      "WheelRearL",
      "WheelRearR",
    ]);
  });

  it("drives premium paint and lamp materials from gameplay state", () => {
    const paint = getAuthoredHeroCoupeMaterialTreatment(
      "Paint 1 Carmine",
      false,
      false,
      0,
    );
    const damagedPaint = getAuthoredHeroCoupeMaterialTreatment(
      "Paint 1 Carmine",
      false,
      false,
      1,
    );
    const idleBrake = getAuthoredHeroCoupeMaterialTreatment(
      "Brakelight",
      false,
      false,
      0,
    );
    const braking = getAuthoredHeroCoupeMaterialTreatment(
      "Brakelight",
      true,
      false,
      0,
    );

    expect(paint).toMatchObject({ clearcoat: 1, metalness: 0.58 });
    expect(damagedPaint?.roughness).toBeGreaterThan(paint?.roughness ?? 0);
    expect(braking?.emissiveIntensity).toBeGreaterThan(
      idleBrake?.emissiveIntensity ?? 0,
    );
    expect(
      getAuthoredHeroCoupeMaterialTreatment("Headlight", false, true, 0),
    ).toMatchObject({ emissiveIntensity: 4.4 });
  });

  it("assigns stable varied paint to authored traffic coupes", () => {
    expect(getAuthoredTrafficCoupePalette(704)).toEqual(
      getAuthoredTrafficCoupePalette(704),
    );
    const palettes = new Set(
      Array.from({ length: 24 }, (_, index) =>
        JSON.stringify(getAuthoredTrafficCoupePalette(700 + index)),
      ),
    );

    expect(palettes.size).toBeGreaterThanOrEqual(5);
    for (const serialized of palettes) {
      expect(serialized).toMatch(/#[0-9a-f]{6}/i);
    }
  });

  it("keeps the authored response fleet on a restrained readable palette", () => {
    expect(AUTHORED_POLICE_COUPE_PALETTE).toEqual({
      primary: "#d4dcda",
      secondary: "#173039",
    });
    expect(Object.isFrozen(AUTHORED_POLICE_COUPE_PALETTE)).toBe(true);
  });
});
