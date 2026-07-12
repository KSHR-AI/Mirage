import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createColorTexture, liftFacadeColor } from "./surface-textures";

describe("facade material planning", () => {
  it("lifts dark procedural colors without removing district hue", () => {
    expect(liftFacadeColor("#263842")).toBe("#58656a");
    expect(liftFacadeColor("#a55361")).toBe("#b37881");
  });

  it("clones a repeated color map without mutating its shared source", () => {
    const source = new THREE.Texture();
    const repeated = createColorTexture(source, [3, 7]);

    expect(repeated).not.toBe(source);
    expect(repeated.repeat.toArray()).toEqual([3, 7]);
    expect(repeated.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(source.repeat.toArray()).toEqual([1, 1]);
    repeated.dispose();
  });
});
