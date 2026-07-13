import { describe, expect, it } from "vitest";

import {
  BLOCK_ASSET_BUDGETS,
  defineBlockAsset,
  getBlockSocket,
  validateBlockAsset,
  visibleBlockParts,
  type BlockAssetDefinition,
} from "./block-asset";
import { BLOCK_BARREL, BLOCK_HYDRANT, BLOCK_PROP_ASSETS } from "./block-props";

describe("block assets", () => {
  it("keeps every shipped prop valid inside desktop and mobile budgets", () => {
    for (const asset of BLOCK_PROP_ASSETS) {
      expect(validateBlockAsset(asset, "desktop")).toEqual([]);
      expect(validateBlockAsset(asset, "mobile")).toEqual([]);
      expect(asset.parts.length).toBeLessThanOrEqual(
        BLOCK_ASSET_BUDGETS.desktop.parts,
      );
    }
  });

  it("drops close-detail parts on mobile without changing the source definition", () => {
    expect(visibleBlockParts(BLOCK_HYDRANT, "desktop").length).toBeGreaterThan(
      visibleBlockParts(BLOCK_HYDRANT, "mobile").length,
    );
    expect(visibleBlockParts(BLOCK_BARREL, "desktop").length).toBeGreaterThan(
      visibleBlockParts(BLOCK_BARREL, "mobile").length,
    );
  });

  it("exposes stable attachment sockets", () => {
    expect(getBlockSocket(BLOCK_HYDRANT, "top")?.position).toEqual([
      0, 1.25, 0,
    ]);
    expect(getBlockSocket(BLOCK_BARREL, "missing")).toBeUndefined();
  });

  it("rejects duplicate parts and invalid transforms at definition time", () => {
    const invalid: BlockAssetDefinition = {
      colliders: [],
      id: "invalid",
      parts: [
        {
          id: "same",
          material: "ink",
          position: [0, 0, 0],
          scale: [1, 1, 1],
          shape: "box",
        },
        {
          id: "same",
          material: "ink",
          position: [0, Number.NaN, 0],
          scale: [1, 0, 1],
          shape: "box",
        },
      ],
      sockets: [],
    };

    expect(validateBlockAsset(invalid)).toEqual(
      expect.arrayContaining([
        "invalid: duplicate part id same",
        "invalid/same: position must be finite",
        "invalid/same: scale axes must be positive",
      ]),
    );
    expect(() => defineBlockAsset(invalid)).toThrow("duplicate part id same");
  });
});
