import { describe, expect, it } from "vitest";
import { layerMask, CollisionLayer } from "../physics/collision-layers";
import {
  createInitialAfterlightState,
  AFTERLIGHT_ENTITY_IDS,
} from "./afterlight-state";
import {
  AfterlightPhysicsQuery,
  type WorldCollisionBox,
} from "./afterlight-physics";

const ALL_HITSCAN = layerMask(
  CollisionLayer.World,
  CollisionLayer.Player,
  CollisionLayer.Actor,
  CollisionLayer.Vehicle,
);

describe("AfterlightPhysicsQuery", () => {
  it("returns the closest actor hit", () => {
    const state = createInitialAfterlightState();
    const physics = new AfterlightPhysicsQuery(state, []);
    const hit = physics.raycast({
      origin: [65, 2, 64],
      direction: [0, 0, -1],
      maxDistance: 20,
      collisionMask: ALL_HITSCAN,
      excludeEntityIds: [],
    });

    expect(hit).toMatchObject({
      kind: "actor",
      entityId: AFTERLIGHT_ENTITY_IDS.keyholderGuardA,
    });
  });

  it("honors exclusions and collision masks", () => {
    const state = createInitialAfterlightState();
    const physics = new AfterlightPhysicsQuery(state, []);
    const hit = physics.raycast({
      origin: [65, 2, 64],
      direction: [0, 0, -1],
      maxDistance: 20,
      collisionMask: layerMask(CollisionLayer.Actor),
      excludeEntityIds: [AFTERLIGHT_ENTITY_IDS.keyholderGuardA],
    });

    expect(hit).toBeNull();
  });

  it("lets authored cover block an actor", () => {
    const state = createInitialAfterlightState();
    const cover: WorldCollisionBox = {
      id: "test-cover",
      center: [65, 2, 60],
      halfExtents: [1, 2, 0.5],
    };
    const physics = new AfterlightPhysicsQuery(state, [cover]);
    const hit = physics.raycast({
      origin: [65, 2, 64],
      direction: [0, 0, -1],
      maxDistance: 20,
      collisionMask: ALL_HITSCAN,
      excludeEntityIds: [],
    });

    expect(hit).toMatchObject({ kind: "world", distance: 3.5 });
  });

  it("selects vehicles independently from actors", () => {
    const state = createInitialAfterlightState();
    const physics = new AfterlightPhysicsQuery(state, []);
    const hit = physics.raycast({
      origin: [68, 1.5, 60],
      direction: [0, 0, -1],
      maxDistance: 20,
      collisionMask: layerMask(CollisionLayer.Vehicle),
      excludeEntityIds: [],
    });

    expect(hit).toMatchObject({
      kind: "vehicle",
      entityId: AFTERLIGHT_ENTITY_IDS.courier,
    });
  });
});
