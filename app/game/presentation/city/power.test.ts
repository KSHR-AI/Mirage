import { describe, expect, it } from "vitest";
import { createBayCityLayout } from "./city-layout";
import {
  CITY_BLACKOUT_COLLAPSE_TICKS,
  CITY_BLACKOUT_SECTOR_COUNT,
  citySectorForPosition,
  filterPoweredCityFeatures,
  isCityLightPowered,
  resolveCityPowerState,
} from "./power";

describe("city blackout power state", () => {
  it("keeps procedural city lights powered before the blackout", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const powerState = resolveCityPowerState({
      blackoutActive: false,
      currentTick: 180,
      reducedMotion: false,
      seed: layout.seed,
    });

    expect(filterPoweredCityFeatures(layout.windows, powerState)).toHaveLength(
      layout.windows.length,
    );
    expect(
      filterPoweredCityFeatures(layout.neonSigns, powerState),
    ).toHaveLength(layout.neonSigns.length);
    expect(
      filterPoweredCityFeatures(layout.streetlights, powerState),
    ).toHaveLength(layout.streetlights.length);
  });

  it("maps stable positions into deterministic blackout sectors", () => {
    expect(citySectorForPosition([-104, 0, -238])).toBe(0);
    expect(citySectorForPosition([104, 0, -238])).toBe(3);
    expect(citySectorForPosition([-104, 0, 104])).toBe(8);
    expect(citySectorForPosition([104, 0, 104])).toBe(11);
    expect(citySectorForPosition([0, 0, -42])).toBe(6);
  });

  it("collapses sectors over 600ms and leaves at most 15% of target lights on", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const startTick = 900;
    const halfCollapse = resolveCityPowerState({
      blackoutActive: true,
      blackoutStartTick: startTick,
      currentTick: startTick + CITY_BLACKOUT_COLLAPSE_TICKS / 2,
      reducedMotion: false,
      seed: layout.seed,
    });
    const fullBlackout = resolveCityPowerState({
      blackoutActive: true,
      blackoutStartTick: startTick,
      currentTick: startTick + CITY_BLACKOUT_COLLAPSE_TICKS,
      reducedMotion: false,
      seed: layout.seed,
    });

    expect(halfCollapse.mode).toBe("collapsing");
    expect(halfCollapse.disabledSectors).toHaveLength(
      CITY_BLACKOUT_SECTOR_COUNT / 2,
    );
    expect(fullBlackout.mode).toBe("blackout");
    expect(fullBlackout.disabledSectors).toHaveLength(
      CITY_BLACKOUT_SECTOR_COUNT,
    );

    const poweredWindows = filterPoweredCityFeatures(
      layout.windows,
      fullBlackout,
    );
    const poweredNeon = filterPoweredCityFeatures(
      layout.neonSigns,
      fullBlackout,
    );
    const poweredStreetlights = filterPoweredCityFeatures(
      layout.streetlights,
      fullBlackout,
    );
    const landmarkPracticals = [
      ["afterlight-spire-crown", [42, 60.5, -42]],
      ["spire-window-a", [42, 8, -35.83]],
      ["spire-window-b", [42, 34, -35.7]],
      ["aurora-vault-portal", [14, 3.35, -50.78]],
      ["grid-seven-substation-light", [-70, 6, -41]],
      ["grid-insulator-a", [-77, 3.4, -39.8]],
      ["breakwater-terminal-face", [103.02, 15, 14]],
      ["dock-light-a", [109, 1.15, -56]],
      ["dock-light-b", [148, 1.15, 72]],
      ["city-hills-antenna", [-118, 34, -78]],
      ["bridge-light-west", [-7.2, 28.5, -132]],
      ["bridge-light-east", [7.2, 28.5, -196]],
      ["safehouse-window", [-78, 6.4, 74.27]],
    ] as const;
    const poweredLandmarks = landmarkPracticals.filter(([id, position]) =>
      isCityLightPowered(id, position, fullBlackout),
    );

    expect(poweredWindows.length / layout.windows.length).toBeLessThanOrEqual(
      0.15,
    );
    expect(poweredNeon.length / layout.neonSigns.length).toBeLessThanOrEqual(
      0.15,
    );
    expect(
      poweredStreetlights.length / layout.streetlights.length,
    ).toBeLessThanOrEqual(0.15);
    expect(
      poweredLandmarks.length / landmarkPracticals.length,
    ).toBeLessThanOrEqual(0.15);
  });

  it("removes collapse flicker when reduced motion is enabled", () => {
    const layout = createBayCityLayout({ quality: "desktop", seed: 2407 });
    const startTick = 1_200;
    const sampleTicks = [startTick + 6, startTick + 7, startTick + 8];
    const candidate = layout.windows.find((window) => {
      const states = sampleTicks.map((tick) =>
        isCityLightPowered(
          window.id,
          window.position,
          resolveCityPowerState({
            blackoutActive: true,
            blackoutStartTick: startTick,
            currentTick: tick,
            reducedMotion: false,
            seed: layout.seed,
          }),
        ),
      );
      return new Set(states).size > 1;
    });

    if (!candidate) {
      throw new Error(
        "Expected a blackout boundary feature with deterministic flicker",
      );
    }

    const reducedMotionStates = sampleTicks.map((tick) =>
      isCityLightPowered(
        candidate.id,
        candidate.position,
        resolveCityPowerState({
          blackoutActive: true,
          blackoutStartTick: startTick,
          currentTick: tick,
          reducedMotion: true,
          seed: layout.seed,
        }),
      ),
    );

    expect(new Set(reducedMotionStates).size).toBe(1);
  });
});
