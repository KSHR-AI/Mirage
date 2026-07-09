import { describe, expect, it } from "vitest";

import {
  COLLISION_GROUPS,
  CollisionLayer,
  filtersFromGroups,
  interactionGroups,
  layerBit,
  layerMask,
  membershipsFromGroups,
} from "./collision-layers";

describe("collision layers", () => {
  it("encodes Rapier membership and filter masks", () => {
    const groups = interactionGroups(
      [CollisionLayer.Player],
      [CollisionLayer.World, CollisionLayer.Trigger],
    );
    expect(membershipsFromGroups(groups)).toBe(layerBit(CollisionLayer.Player));
    expect(filtersFromGroups(groups)).toBe(
      layerMask(CollisionLayer.World, CollisionLayer.Trigger),
    );
  });

  it("keeps projectiles from colliding with the player layer", () => {
    expect(
      filtersFromGroups(COLLISION_GROUPS.projectile) &
        layerBit(CollisionLayer.Player),
    ).toBe(0);
    expect(
      filtersFromGroups(COLLISION_GROUPS.projectile) &
        layerBit(CollisionLayer.Actor),
    ).not.toBe(0);
  });

  it("allows triggers to observe player, vehicle, and actor layers", () => {
    const expected = layerMask(
      CollisionLayer.Player,
      CollisionLayer.Vehicle,
      CollisionLayer.Actor,
    );
    expect(filtersFromGroups(COLLISION_GROUPS.trigger)).toBe(expected);
  });
});
