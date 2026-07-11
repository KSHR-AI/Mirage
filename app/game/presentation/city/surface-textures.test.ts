import { describe, expect, it } from "vitest";
import { liftFacadeColor } from "./surface-textures";

describe("facade material planning", () => {
  it("lifts dark procedural colors without removing district hue", () => {
    expect(liftFacadeColor("#263842")).toBe("#58656a");
    expect(liftFacadeColor("#a55361")).toBe("#b37881");
  });
});
