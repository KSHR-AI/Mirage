import { describe, expect, it } from "vitest";

import { CollisionLayer, layerBit } from "../physics/collision-layers";
import {
  HITSCAN_COLLISION_MASK,
  traceHitscan,
  type PhysicsQueryPort,
  type PhysicsRaycastHit,
  type PhysicsRaycastQuery,
} from "./physics-query";

const worldHit: PhysicsRaycastHit = {
  kind: "world",
  distance: 5,
  point: [0, 0, 5],
  normal: [0, 0, -1],
};

function recordingPort(hit: PhysicsRaycastHit | null) {
  const queries: PhysicsRaycastQuery[] = [];
  const physics: PhysicsQueryPort = {
    raycast(query) {
      queries.push(query);
      return hit;
    },
  };
  return { physics, queries };
}

describe("PhysicsQueryPort hitscan", () => {
  it("requests one normalized closest blocking ray", () => {
    const { physics, queries } = recordingPort(worldHit);
    const trace = traceHitscan(physics, {
      origin: [1, 2, 3],
      direction: [0, 0, 10],
      maxDistance: 120,
      sourceEntityId: 7,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toEqual({
      origin: [1, 2, 3],
      direction: [0, 0, 1],
      maxDistance: 120,
      collisionMask: HITSCAN_COLLISION_MASK,
      excludeEntityIds: [7],
    });
    expect(trace.hit).toEqual(worldHit);
  });

  it("normalizes very large finite directions without overflow", () => {
    const { physics, queries } = recordingPort(null);
    traceHitscan(physics, {
      origin: [0, 0, 0],
      direction: [Number.MAX_VALUE, 0, Number.MAX_VALUE],
      maxDistance: 1,
    });

    expect(queries[0]?.direction.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...(queries[0]?.direction ?? []))).toBeCloseTo(1);
  });

  it("includes cover, player, actor, and vehicle colliders", () => {
    for (const layer of [
      CollisionLayer.World,
      CollisionLayer.Player,
      CollisionLayer.Actor,
      CollisionLayer.Vehicle,
    ]) {
      expect(HITSCAN_COLLISION_MASK & layerBit(layer)).not.toBe(0);
    }
    expect(HITSCAN_COLLISION_MASK & layerBit(CollisionLayer.Trigger)).toBe(0);
  });

  it("clones the port hit so adapters cannot mutate the result later", () => {
    const point: [number, number, number] = [0, 0, 5];
    const normal: [number, number, number] = [0, 0, -1];
    const { physics } = recordingPort({
      ...worldHit,
      point,
      normal,
    });
    const trace = traceHitscan(physics, {
      origin: [0, 0, 0],
      direction: [0, 0, 1],
      maxDistance: 10,
    });

    point[2] = 9;
    normal[2] = 1;
    expect(trace.hit?.point).toEqual([0, 0, 5]);
    expect(trace.hit?.normal).toEqual([0, 0, -1]);
  });

  it.each([
    [{ ...worldHit, distance: -1 }, "negative distance"],
    [{ ...worldHit, distance: 121 }, "out-of-range distance"],
    [{ ...worldHit, distance: Number.NaN }, "non-finite distance"],
    [{ ...worldHit, point: [Number.NaN, 0, 0] as const }, "non-finite point"],
  ])("discards a port hit with %s", (hit) => {
    const { physics } = recordingPort(hit);
    const trace = traceHitscan(physics, {
      origin: [0, 0, 0],
      direction: [0, 0, 1],
      maxDistance: 120,
    });
    expect(trace.hit).toBeUndefined();
  });

  it("reports a clean miss from the port", () => {
    const { physics } = recordingPort(null);
    expect(
      traceHitscan(physics, {
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        maxDistance: 10,
      }).hit,
    ).toBeUndefined();
  });

  it("validates a ray before consulting physics", () => {
    const { physics, queries } = recordingPort(worldHit);
    expect(() =>
      traceHitscan(physics, {
        origin: [Number.NaN, 0, 0],
        direction: [1, 0, 0],
        maxDistance: 10,
      }),
    ).toThrow("origin");
    expect(() =>
      traceHitscan(physics, {
        origin: [0, 0, 0],
        direction: [0, 0, 0],
        maxDistance: 10,
      }),
    ).toThrow("non-zero");
    expect(() =>
      traceHitscan(physics, {
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        maxDistance: 0,
      }),
    ).toThrow("maxDistance");
    expect(queries).toHaveLength(0);
  });
});
