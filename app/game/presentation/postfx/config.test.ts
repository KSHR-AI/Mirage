import { describe, expect, it } from "vitest";
import { resolveAfterlightPostFxConfig } from "./config";

describe("resolveAfterlightPostFxConfig", () => {
  it.each(["low", "medium"] as const)(
    "keeps the %s tier free of post-processing passes",
    (quality) => {
      expect(resolveAfterlightPostFxConfig(quality, false).enabled).toBe(false);
    },
  );

  it("disables post-processing when reduced motion is active", () => {
    expect(resolveAfterlightPostFxConfig("high", true).enabled).toBe(false);
  });

  it("uses restrained high-tier effects", () => {
    const config = resolveAfterlightPostFxConfig("high", false);

    expect(config.enabled).toBe(true);
    expect(config.bloom.threshold).toBeGreaterThan(1);
    expect(config.bloom.intensity).toBeLessThan(0.75);
    expect(config.vignette.darkness).toBeLessThan(0.5);
  });
});
