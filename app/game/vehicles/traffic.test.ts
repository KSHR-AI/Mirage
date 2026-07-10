import { describe, expect, it } from "vitest";

import type { EntityId, Vec3 } from "../core/contracts";
import {
  BAY_CITY_ROAD_GRAPH,
  findRoute,
  getIntersectionId,
  getLaneNodeId,
  type CardinalDirection,
  type RoadRoute,
} from "../world/road-graph";
import { sampleTrafficRoute } from "./route-progress";
import {
  DEFAULT_TRAFFIC_CONFIG,
  TRAFFIC_POPULATION_BUDGETS,
  createTrafficAgent,
  createTrafficPopulation,
  resolveIntersectionReservations,
  stepTrafficAgent,
  stepTrafficPopulation,
  trafficVehicleStates,
  type TrafficAgentState,
  type TrafficPopulationState,
} from "./traffic";

const GRAPH = BAY_CITY_ROAD_GRAPH;

function route(
  start: readonly [x: number, z: number],
  goal: readonly [x: number, z: number],
  direction: CardinalDirection,
  goalPhase: "incoming" | "outgoing" = "outgoing",
): RoadRoute {
  const found = findRoute(
    GRAPH,
    getLaneNodeId(getIntersectionId(start[0], start[1]), direction, "outgoing"),
    getLaneNodeId(getIntersectionId(goal[0], goal[1]), direction, goalPhase),
    { mode: "vehicle", seed: `${start}:${goal}:${direction}` },
  );
  if (!found) throw new Error("Expected traffic test route");
  return found;
}

function agent(
  id: EntityId,
  roadRoute: RoadRoute,
  distanceOnFirstEdge = 0,
  speed = 0,
): TrafficAgentState {
  const created = createTrafficAgent(GRAPH, {
    id,
    routeId: `test:${id}`,
    route: roadRoute,
    spawnedAtTick: 0,
    cruiseSpeedFactor: 0.9,
  });
  const progress = {
    ...created.route,
    distanceOnEdge: distanceOnFirstEdge,
    distanceTravelled: distanceOnFirstEdge,
  };
  const sample = sampleTrafficRoute(GRAPH, progress);
  return {
    ...created,
    route: progress,
    speed,
    vehicle: {
      ...created.vehicle,
      pose: {
        position: [
          sample.pose.position[0],
          created.vehicle.pose.position[1],
          sample.pose.position[2],
        ],
        rotationY: sample.pose.rotationY,
      },
      velocity: [
        -Math.sin(sample.pose.rotationY) * speed,
        0,
        -Math.cos(sample.pose.rotationY) * speed,
      ],
    },
  };
}

function mapOf(...agents: readonly TrafficAgentState[]) {
  return new Map(agents.map((value) => [value.vehicle.id, value] as const));
}

function signature(state: TrafficPopulationState) {
  return [...state.agents.values()]
    .sort((first, second) => first.vehicle.id - second.vehicle.id)
    .map((value) => ({
      id: value.vehicle.id,
      route: value.route.edgeIds,
      position: value.vehicle.pose.position,
      cruiseSpeedFactor: value.cruiseSpeedFactor,
    }));
}

describe("lane-following traffic", () => {
  it("maintains a braking lead gap on the same directed edge", () => {
    const roadRoute = route([-70, 70], [14, 70], "east", "incoming");
    const follower = agent(1, roadRoute, 8, 5);
    const leader = agent(2, roadRoute, 12, 2);
    const agents = mapOf(follower, leader);
    const stepped = stepTrafficAgent(
      GRAPH,
      follower,
      agents,
      new Map(),
      0.5,
      10,
    );

    expect(stepped.agent.route.distanceOnEdge).toBe(8);
    expect(stepped.agent.speed).toBe(0);
    expect(stepped.agent.stuckTicks).toBe(1);
    expect(follower.route.distanceOnEdge).toBe(8);
  });

  it("grants one deterministic reservation per intersection", () => {
    const westRoute = route([-14, 14], [14, 14], "east");
    const northRoute = route([14, -14], [14, 14], "south");
    const westEdge = westRoute.edges[0];
    const northEdge = northRoute.edges[0];
    if (!westEdge || !northEdge) throw new Error("Expected approach edges");
    const west = agent(2, westRoute, westEdge.length - 2, 4);
    const north = agent(1, northRoute, northEdge.length - 2, 4);
    const agents = mapOf(west, north);
    const reservations = resolveIntersectionReservations(
      GRAPH,
      agents,
      new Map(),
      50,
    );

    expect(reservations.size).toBe(1);
    expect([...reservations.values()][0]).toMatchObject({
      intersectionId: getIntersectionId(14, 14),
      vehicleId: 1,
      grantedAtTick: 50,
    });

    const retained = resolveIntersectionReservations(
      GRAPH,
      agents,
      new Map([
        [
          getIntersectionId(14, 14),
          {
            intersectionId: getIntersectionId(14, 14),
            vehicleId: 2,
            grantedAtTick: 40,
            expiresAtTick: 100,
          },
        ],
      ]),
      51,
    );
    expect([...retained.values()][0]?.vehicleId).toBe(2);
  });

  it("holds a loser at the stop line while the owner enters", () => {
    const westRoute = route([-14, 14], [14, 14], "east");
    const northRoute = route([14, -14], [14, 14], "south");
    const westEdge = westRoute.edges[0];
    const northEdge = northRoute.edges[0];
    if (!westEdge || !northEdge) throw new Error("Expected approach edges");
    const loser = agent(2, westRoute, westEdge.length - 2, 5);
    const owner = agent(1, northRoute, northEdge.length - 2, 5);
    const agents = mapOf(loser, owner);
    const reservations = resolveIntersectionReservations(
      GRAPH,
      agents,
      new Map(),
      1,
    );
    const stopped = stepTrafficAgent(
      GRAPH,
      loser,
      agents,
      reservations,
      1,
      1,
    ).agent;
    const entered = stepTrafficAgent(
      GRAPH,
      owner,
      agents,
      reservations,
      1,
      1,
    ).agent;

    expect(westEdge.length - stopped.route.distanceOnEdge).toBeCloseTo(
      DEFAULT_TRAFFIC_CONFIG.stopLineBuffer,
    );
    expect(entered.route.edgeIndex).toBe(1);
    expect(stopped.route.edgeIndex).toBe(0);
  });

  it("follows graph speed limits and route poses over repeated fixed steps", () => {
    const roadRoute = route([-70, 70], [70, 70], "east", "incoming");
    let current = agent(10, roadRoute);
    let reservations = new Map();
    let maximumSpeed = 0;

    for (let tick = 0; tick < 360 && !current.route.completed; tick += 1) {
      const agents = mapOf(current);
      reservations = new Map(
        resolveIntersectionReservations(GRAPH, agents, reservations, tick),
      );
      current = stepTrafficAgent(
        GRAPH,
        current,
        agents,
        reservations,
        1 / 60,
        42,
      ).agent;
      maximumSpeed = Math.max(maximumSpeed, current.speed);
      const sample = sampleTrafficRoute(GRAPH, current.route);
      expect(current.vehicle.pose.position[0]).toBeCloseTo(
        sample.pose.position[0],
      );
      expect(current.vehicle.pose.position[2]).toBeCloseTo(
        sample.pose.position[2],
      );
    }

    expect(current.route.distanceTravelled).toBeGreaterThan(1);
    expect(maximumSpeed).toBeLessThanOrEqual(14 * 0.9);
  });
});

describe("traffic population", () => {
  it("replays seeded spawns without mutating the input population", () => {
    const initial = createTrafficPopulation("population-replay");
    const context = {
      tick: 0,
      dt: 1 / 60,
      playerPosition: [0, 0, 0] as Vec3,
      populationClass: "desktop" as const,
    };
    const options = {
      budget: { maxVehicles: 4, spawnPerCycle: 4, spawnIntervalTicks: 1 },
    };
    const first = stepTrafficPopulation(GRAPH, initial, context, options);
    const replay = stepTrafficPopulation(GRAPH, initial, context, options);
    const other = stepTrafficPopulation(
      GRAPH,
      createTrafficPopulation("different-seed"),
      context,
      options,
    );

    expect(first.spawnedIds).toHaveLength(4);
    expect(signature(first.state)).toEqual(signature(replay.state));
    expect(signature(first.state)).not.toEqual(signature(other.state));
    expect(initial.agents.size).toBe(0);
    expect(initial.spawnSerial).toBe(0);
    expect(trafficVehicleStates(first.state).size).toBe(4);
  });

  it("allocates new ids above seeded agents and rejects an overlapping range", () => {
    const roadRoute = route([-70, 70], [14, 70], "east", "incoming");
    const existing = agent(1_004, roadRoute);
    expect(
      createTrafficPopulation(1, {
        agents: [[existing.vehicle.id, existing]],
      }).nextVehicleId,
    ).toBe(1_005);
    expect(() =>
      createTrafficPopulation(1, {
        firstVehicleId: 1_004,
        agents: [[existing.vehicle.id, existing]],
      }),
    ).toThrow(/exceed existing/);
  });

  it("enforces distinct desktop and mobile population budgets", () => {
    expect(TRAFFIC_POPULATION_BUDGETS.desktop.maxVehicles).toBeGreaterThan(
      TRAFFIC_POPULATION_BUDGETS.mobile.maxVehicles,
    );
    const roadRoute = route([-70, 70], [14, 70], "east", "incoming");
    const entries = Array.from({ length: 15 }, (_, index) => {
      const value = agent(100 + index, roadRoute);
      return [value.vehicle.id, value] as const;
    });
    const playerPosition = entries[0]?.[1].vehicle.pose.position as Vec3;
    const initial = createTrafficPopulation(5, { agents: entries });
    const mobile = stepTrafficPopulation(GRAPH, initial, {
      tick: 1,
      dt: 1 / 60,
      playerPosition,
      populationClass: "mobile",
    });
    const desktop = stepTrafficPopulation(GRAPH, initial, {
      tick: 1,
      dt: 1 / 60,
      playerPosition,
      populationClass: "desktop",
    });

    expect(mobile.state.agents.size).toBe(
      TRAFFIC_POPULATION_BUDGETS.mobile.maxVehicles,
    );
    expect(mobile.despawnedIds).toEqual([112, 113, 114]);
    expect(desktop.state.agents.size).toBe(15);
  });

  it("despawns completed or distant ambient traffic deterministically", () => {
    const roadRoute = route([-70, 70], [14, 70], "east", "incoming");
    const nearby = agent(1, roadRoute);
    const initial = createTrafficPopulation(7, {
      agents: [[nearby.vehicle.id, nearby]],
    });
    const result = stepTrafficPopulation(GRAPH, initial, {
      tick: 1,
      dt: 1 / 60,
      playerPosition: [1_000, 0, 1_000],
      populationClass: "mobile",
    });

    expect(result.state.agents.size).toBe(0);
    expect(result.despawnedIds).toEqual([1]);
    expect(result.spawnedIds).toEqual([]);
  });

  it("recovers a blocked agent by seeded rerouting after the stuck threshold", () => {
    const roadRoute = route([-14, 14], [14, 14], "east");
    const blocked = {
      ...agent(1, roadRoute, 4, 0),
      stuckTicks: 2,
    };
    const blocker = agent(2, roadRoute, 4.1, 0);
    const initial = createTrafficPopulation(99, {
      agents: [
        [1, blocked],
        [2, blocker],
      ],
    });
    const result = stepTrafficPopulation(
      GRAPH,
      initial,
      {
        tick: 1,
        dt: 1 / 60,
        playerPosition: blocked.vehicle.pose.position,
        populationClass: "mobile",
      },
      { config: { stuckTicksBeforeRecovery: 3 } },
    );
    const recovered = result.state.agents.get(1);

    expect(result.recoveredIds).toEqual([1]);
    expect(recovered).toMatchObject({ recoveryCount: 1, stuckTicks: 0 });
    expect(recovered?.route.routeId).toBe(blocked.route.routeId);
    expect(recovered?.vehicle.pose.position).not.toEqual(
      blocked.vehicle.pose.position,
    );
  });
});
