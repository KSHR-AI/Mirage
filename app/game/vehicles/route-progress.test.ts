import { describe, expect, it } from "vitest";

import {
  BAY_CITY_ROAD_GRAPH,
  findRoute,
  getIntersectionId,
  getLaneNodeId,
  type RoadRoute,
} from "../world/road-graph";
import {
  advanceTrafficRoute,
  createTrafficRouteProgress,
  sampleTrafficRoute,
  trafficRouteDistanceRemaining,
} from "./route-progress";

function cityRoute(): RoadRoute {
  const route = findRoute(
    BAY_CITY_ROAD_GRAPH,
    getLaneNodeId(getIntersectionId(-70, 70), "east", "outgoing"),
    getLaneNodeId(getIntersectionId(14, 70), "east", "incoming"),
    { mode: "vehicle", seed: "route-progress-test" },
  );
  if (!route) throw new Error("Expected test route");
  return route;
}

describe("traffic route progress", () => {
  it("advances across edge boundaries without losing distance", () => {
    const route = cityRoute();
    const initial = createTrafficRouteProgress("traffic:1", route);
    const distance =
      (route.edges[0]?.length as number) +
      (route.edges[1]?.length as number) / 2;
    const advanced = advanceTrafficRoute(
      BAY_CITY_ROAD_GRAPH,
      initial,
      distance,
    );

    expect(advanced.edgeIndex).toBe(1);
    expect(advanced.distanceOnEdge).toBeCloseTo(
      (route.edges[1]?.length as number) / 2,
    );
    expect(advanced.distanceTravelled).toBeCloseTo(distance);
    expect(trafficRouteDistanceRemaining(advanced)).toBeCloseTo(
      route.distance - distance,
    );
    expect(initial).toMatchObject({ edgeIndex: 0, distanceOnEdge: 0 });
  });

  it("samples an exact lane pose and heading from graph nodes", () => {
    const route = cityRoute();
    const firstEdge = route.edges[0] as (typeof route.edges)[number];
    const progress = advanceTrafficRoute(
      BAY_CITY_ROAD_GRAPH,
      createTrafficRouteProgress("traffic:2", route),
      firstEdge.length / 2,
    );
    const sample = sampleTrafficRoute(BAY_CITY_ROAD_GRAPH, progress);
    const from = BAY_CITY_ROAD_GRAPH.nodes.get(firstEdge.from);
    const to = BAY_CITY_ROAD_GRAPH.nodes.get(firstEdge.to);

    expect(sample.pose.position[0]).toBeCloseTo(
      ((from?.x as number) + (to?.x as number)) / 2,
    );
    expect(sample.pose.position[2]).toBeCloseTo(
      ((from?.z as number) + (to?.z as number)) / 2,
    );
    expect(sample.pose.rotationY).toBeCloseTo(-Math.PI / 2);
    expect(sample.speedLimit).toBe(firstEdge.speedLimit);
  });

  it("caps progress at the destination and samples the final node", () => {
    const route = cityRoute();
    const completed = advanceTrafficRoute(
      BAY_CITY_ROAD_GRAPH,
      createTrafficRouteProgress("traffic:3", route),
      route.distance + 100,
    );
    const sample = sampleTrafficRoute(BAY_CITY_ROAD_GRAPH, completed);
    const finalNode = route.nodes.at(-1);

    expect(completed.completed).toBe(true);
    expect(completed.edgeIndex).toBe(route.edgeIds.length);
    expect(completed.distanceTravelled).toBeCloseTo(route.distance);
    expect(sample.pose.position).toEqual(finalNode?.position);
    expect(sample.edge).toBeNull();
  });

  it("supports a zero-edge route and rejects invalid distances or edge ids", () => {
    const nodeId = getLaneNodeId(
      getIntersectionId(-70, 70),
      "east",
      "outgoing",
    );
    const empty = findRoute(BAY_CITY_ROAD_GRAPH, nodeId, nodeId, {
      mode: "vehicle",
    });
    if (!empty) throw new Error("Expected zero-edge route");
    const progress = createTrafficRouteProgress("traffic:empty", empty);
    expect(progress.completed).toBe(true);
    expect(
      sampleTrafficRoute(BAY_CITY_ROAD_GRAPH, progress).pose.position,
    ).toEqual(empty.nodes[0]?.position);

    expect(() =>
      advanceTrafficRoute(BAY_CITY_ROAD_GRAPH, progress, -1),
    ).toThrow(/distance/);
    expect(() =>
      sampleTrafficRoute(BAY_CITY_ROAD_GRAPH, {
        ...createTrafficRouteProgress("traffic:bad", cityRoute()),
        edgeIds: ["missing-edge"],
      }),
    ).toThrow(/missing edge/);
  });
});
