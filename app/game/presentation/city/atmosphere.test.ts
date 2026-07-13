import { describe, expect, it } from "vitest";

import { CITY_DAY_ATMOSPHERE } from "./CityAtmosphere";

describe("CITY_DAY_ATMOSPHERE", () => {
  it("uses a bright coastal sky and a decisive late-morning key", () => {
    expect(CITY_DAY_ATMOSPHERE.skyTop).toBe("#4e9fd2");
    expect(CITY_DAY_ATMOSPHERE.skyHorizon).toBe("#d9edf0");
    expect(CITY_DAY_ATMOSPHERE.directionalIntensity).toBeGreaterThan(3);
    expect(CITY_DAY_ATMOSPHERE.hemisphereIntensity).toBeGreaterThan(1);
  });

  it("keeps mobile marine haze closer while retaining skyline depth", () => {
    expect(CITY_DAY_ATMOSPHERE.fogNearMobile).toBeLessThan(
      CITY_DAY_ATMOSPHERE.fogNearDesktop,
    );
    expect(CITY_DAY_ATMOSPHERE.fogFar).toBeGreaterThan(
      CITY_DAY_ATMOSPHERE.fogNearDesktop * 2,
    );
  });
});
