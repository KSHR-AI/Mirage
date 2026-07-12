import { describe, expect, it } from "vitest";

import { CITY_NIGHT_ATMOSPHERE } from "./CityAtmosphere";

describe("CITY_NIGHT_ATMOSPHERE", () => {
  it("keeps the night key restrained against a dark marine sky", () => {
    expect(CITY_NIGHT_ATMOSPHERE.skyTop).toBe("#020711");
    expect(CITY_NIGHT_ATMOSPHERE.skyHorizon).toBe("#17323c");
    expect(CITY_NIGHT_ATMOSPHERE.directionalIntensity).toBeLessThan(1.5);
    expect(CITY_NIGHT_ATMOSPHERE.hemisphereIntensity).toBeLessThan(0.75);
  });

  it("keeps mobile fog closer while retaining the same skyline depth", () => {
    expect(CITY_NIGHT_ATMOSPHERE.fogNearMobile).toBeLessThan(
      CITY_NIGHT_ATMOSPHERE.fogNearDesktop,
    );
    expect(CITY_NIGHT_ATMOSPHERE.fogFar).toBeGreaterThan(
      CITY_NIGHT_ATMOSPHERE.fogNearDesktop * 2,
    );
  });
});
