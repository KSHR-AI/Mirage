import { describe, expect, it } from "vitest";

import { BAY_CITY_ROAD_GRAPH } from "../../world/road-graph";
import { planPursuit } from "./pursuit";

describe("police pursuit planning", () => {
  it("routes spawned cruisers from unseen road nodes toward the player", () => {
    const plan = planPursuit(BAY_CITY_ROAD_GRAPH, {
      tick: 120,
      seed: 2407,
      heat: {
        value: 50,
        wantedLevel: 2,
        mode: "pursue",
        lastSeenPosition: [14, 0, 14],
        unseenTicks: 0,
      },
      playerPosition: [14, 0, 14],
      playerVelocity: [0, 0, -12],
      existingUnitIds: [],
      mobile: false,
      isNodeVisible: () => false,
    });
    expect(plan.spawnUnits).toHaveLength(3);
    expect(plan.spawnUnits.every(({ route }) => route.nodes.length > 1)).toBe(
      true,
    );
  });

  it("respects mobile caps and refuses visible spawn nodes", () => {
    const hiddenPlan = planPursuit(BAY_CITY_ROAD_GRAPH, {
      tick: 1,
      seed: 9,
      heat: { value: 80, wantedLevel: 3, mode: "pursue", unseenTicks: 0 },
      playerPosition: [0, 0, 0],
      playerVelocity: [10, 0, 0],
      existingUnitIds: [21_000, 21_001, 21_002],
      mobile: true,
      isNodeVisible: () => false,
    });
    expect(hiddenPlan.spawnUnits).toHaveLength(1);
    const visiblePlan = planPursuit(BAY_CITY_ROAD_GRAPH, {
      tick: 1,
      seed: 9,
      heat: { value: 80, wantedLevel: 3, mode: "pursue", unseenTicks: 0 },
      playerPosition: [0, 0, 0],
      playerVelocity: [10, 0, 0],
      existingUnitIds: [],
      mobile: false,
      isNodeVisible: () => true,
    });
    expect(visiblePlan.spawnUnits).toEqual([]);
  });

  it("creates deterministic three-star roadblocks and none while returning", () => {
    const input = {
      tick: 600,
      seed: 88,
      heat: {
        value: 80,
        wantedLevel: 3 as const,
        mode: "pursue" as const,
        unseenTicks: 0,
      },
      playerPosition: [14, 0, 70] as const,
      playerVelocity: [0, 0, -20] as const,
      existingUnitIds: [] as const,
      mobile: false,
      isNodeVisible: () => false,
    };
    expect(planPursuit(BAY_CITY_ROAD_GRAPH, input).roadblock).toEqual(
      planPursuit(BAY_CITY_ROAD_GRAPH, input).roadblock,
    );
    expect(
      planPursuit(BAY_CITY_ROAD_GRAPH, {
        ...input,
        heat: { ...input.heat, mode: "return" },
      }),
    ).toEqual({ spawnUnits: [] });
  });
});
