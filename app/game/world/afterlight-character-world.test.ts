import { describe, expect, it } from "vitest";
import {
  AFTERLIGHT_ENTITY_IDS,
  createInitialAfterlightState,
} from "../core/afterlight-state";
import { createBayCityLayout } from "../presentation/city/city-layout";
import {
  createAfterlightCharacterWorld,
  createAfterlightVehicleObstacles,
  sampleAfterlightCharacterGround,
} from "./afterlight-character-world";
import { AFTERLIGHT_SPACE_COLLIDERS } from "./afterlight-space";

describe("Afterlight character world", () => {
  it("matches the authored road, sidewalk, bridge, and ramp elevations", () => {
    expect(sampleAfterlightCharacterGround(56, 56)).toMatchObject({
      height: 1.165,
      normal: [0, 1, 0],
    });
    expect(sampleAfterlightCharacterGround(42, 42)).toMatchObject({
      height: 1.3,
      normal: [0, 1, 0],
    });
    expect(sampleAfterlightCharacterGround(0, -120)).toMatchObject({
      height: 1.405,
      normal: [0, 1, 0],
    });
    expect(sampleAfterlightCharacterGround(0, -105)?.normal[2]).toBeGreaterThan(
      0,
    );
    expect(sampleAfterlightCharacterGround(20, -120)).toBeNull();
  });

  it("matches the rendered procedural building collision", () => {
    const seed = 2407;
    const layout = createBayCityLayout({ quality: "mobile", seed });
    const world = createAfterlightCharacterWorld(seed);
    const building = layout.buildings[0];
    if (!building) throw new Error("missing building fixture");
    const obstacle = world.obstacles.find(
      (candidate) => candidate.id === building.id,
    );

    expect(world.obstacles).toHaveLength(
      layout.buildings.length + AFTERLIGHT_SPACE_COLLIDERS.length,
    );
    expect(obstacle).toEqual({
      id: building.id,
      minX: building.position[0] - building.scale[0] * 0.5,
      maxX: building.position[0] + building.scale[0] * 0.5,
      minY: building.position[1] - building.scale[1] * 0.5,
      maxY: building.position[1] + building.scale[1] * 0.5,
      minZ: building.position[2] - building.scale[2] * 0.5,
      maxZ: building.position[2] + building.scale[2] * 0.5,
    });
    expect(world.obstacles.some(({ id }) => id.startsWith("authored-"))).toBe(
      false,
    );
    expect(createAfterlightCharacterWorld(seed)).toBe(world);
  });

  it("creates rotation-aware dynamic obstacles for vehicles", () => {
    const state = createInitialAfterlightState();
    const hero = state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (!hero) throw new Error("missing hero vehicle fixture");
    const obstacles = createAfterlightVehicleObstacles(
      new Map([[hero.id, hero]]),
    );

    expect(obstacles).toEqual([
      expect.objectContaining({
        id: `vehicle-${hero.id}`,
        minX: hero.pose.position[0] - 1.08,
        maxX: hero.pose.position[0] + 1.08,
        minZ: hero.pose.position[2] - 2.2,
        maxZ: hero.pose.position[2] + 2.2,
      }),
    ]);
  });
});
