import { describe, expect, it } from "vitest";
import { facadeTextureTier, liftFacadeColor } from "./surface-textures";

describe("facade material planning", () => {
  it("batches buildings into stable texture-density tiers", () => {
    expect(facadeTextureTier(8)).toBe("low");
    expect(facadeTextureTier(13)).toBe("mid");
    expect(facadeTextureTier(24.9)).toBe("mid");
    expect(facadeTextureTier(25)).toBe("tower");
  });

  it("lifts dark procedural colors without removing district hue", () => {
    expect(liftFacadeColor("#263842")).toBe("#58656a");
    expect(liftFacadeColor("#a55361")).toBe("#b37881");
  });
});
