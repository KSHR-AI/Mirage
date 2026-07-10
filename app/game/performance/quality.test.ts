import { describe, expect, it } from "vitest";
import {
  PerformanceGovernor,
  lowerQuality,
  qualitySettings,
  selectInitialQuality,
  type DeviceProfile,
} from "./quality";

const DESKTOP_PROFILE: DeviceProfile = {
  viewportWidth: 1440,
  viewportHeight: 900,
  devicePixelRatio: 1,
  hardwareConcurrency: 10,
  deviceMemoryGb: 8,
  coarsePointer: false,
  reducedMotion: false,
};

describe("quality selection", () => {
  it("starts capable desktops at high quality", () => {
    expect(selectInitialQuality(DESKTOP_PROFILE)).toBe("high");
  });

  it("uses bounded mobile and accessibility tiers", () => {
    expect(
      selectInitialQuality({
        ...DESKTOP_PROFILE,
        viewportWidth: 390,
        viewportHeight: 844,
        coarsePointer: true,
      }),
    ).toBe("medium");
    expect(
      selectInitialQuality({ ...DESKTOP_PROFILE, reducedMotion: true }),
    ).toBe("low");
  });

  it("never lowers below the low tier", () => {
    expect(lowerQuality("high")).toBe("medium");
    expect(lowerQuality("medium")).toBe("low");
    expect(lowerQuality("low")).toBe("low");
  });

  it("returns stable immutable quality settings", () => {
    expect(qualitySettings("medium")).toMatchObject({
      trafficCount: 14,
      civilianCount: 18,
      shadowMapSize: 1024,
    });
    expect(Object.isFrozen(qualitySettings("medium"))).toBe(true);
  });
});

describe("PerformanceGovernor", () => {
  it("degrades sustained slow frames one tier at a time", () => {
    const governor = new PerformanceGovernor({
      initialTier: "high",
      evaluationWindow: 30,
      minimumSamples: 20,
      degradeCooldownSamples: 1,
    });

    let changed = false;
    for (let index = 0; index < 20; index += 1) {
      changed = governor.sample({
        frameMs: 32,
        droppedSimulationSeconds: 0,
      }).changed;
    }

    expect(changed).toBe(true);
    expect(governor.currentTier).toBe("medium");
  });

  it("keeps quality stable for healthy frames", () => {
    const governor = new PerformanceGovernor({ initialTier: "high" });

    for (let index = 0; index < 180; index += 1) {
      governor.sample({ frameMs: 12, droppedSimulationSeconds: 0 });
    }

    expect(governor.currentTier).toBe("high");
  });

  it("treats repeated dropped simulation time as pressure", () => {
    const governor = new PerformanceGovernor({
      initialTier: "medium",
      evaluationWindow: 30,
      minimumSamples: 20,
    });

    for (let index = 0; index < 20; index += 1) {
      governor.sample({ frameMs: 16, droppedSimulationSeconds: 0.02 });
    }

    expect(governor.currentTier).toBe("low");
  });
});
