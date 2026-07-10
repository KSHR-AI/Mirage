import { describe, expect, it } from "vitest";

import {
  BLOCK_CENTERS,
  BRIDGE_END,
  ROAD_LINES,
} from "../../components/bay-city-data";
import {
  CITY_ROAD_LINES,
  createBayCityLayout,
} from "../presentation/city/city-layout";
import { WORLD_LAYOUT } from "./world-layout";
import {
  BAY_CITY_ROAD_GRAPH,
  ROAD_GRAPH_SPEED_LIMITS,
  createRoadGraph,
  findNearestRoadNode,
  findNearestSidewalkNode,
  findRoute,
  findRouteBetween,
  findSeededRoute,
  getBridgeJunctionId,
  getIntersectionId,
  getLaneNodeId,
  getOutgoingEdges,
  getSidewalkNodeId,
  validateRoadGraph,
  type RoadGraph,
  type RoadGraphEdge,
} from "./road-graph";

function edgeTo(edges: readonly RoadGraphEdge[], nodeId: string) {
  return edges.find((edge) => edge.to === nodeId);
}

function graphSignature(graph: RoadGraph) {
  return {
    nodes: [...graph.nodes.values()].map((node) => ({
      id: node.id,
      position: node.position,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      length: edge.length,
      speedLimit: edge.speedLimit,
    })),
    junctions: graph.junctions.map((junction) => junction.id),
  };
}

function distanceToSegment(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
) {
  const segmentX = end[0] - start[0];
  const segmentZ = end[1] - start[1];
  const lengthSquared = segmentX ** 2 + segmentZ ** 2;
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * segmentX + (point[1] - start[1]) * segmentZ) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    point[0] - (start[0] + segmentX * projection),
    point[1] - (start[1] + segmentZ * projection),
  );
}

describe("Bay City road graph", () => {
  it("builds the same directed topology from ROAD_LINES every time", () => {
    const first = createRoadGraph();
    const second = createRoadGraph([...ROAD_LINES].reverse());

    expect(graphSignature(second)).toEqual(graphSignature(first));
    expect(first.roadLines).toEqual(ROAD_LINES);
    expect(first.intersections).toHaveLength(ROAD_LINES.length ** 2);
    expect(first.nodes.size).toBeGreaterThan(400);
    expect(first.edges.length).toBeGreaterThan(first.nodes.size);
    expect(validateRoadGraph(first)).toEqual(
      expect.objectContaining({
        valid: true,
        nodeCount: first.nodes.size,
        edgeCount: first.edges.length,
      }),
    );
  });

  it("keeps every city vehicle edge on rendered roads and off block centers", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const renderedRoads = createBayCityLayout({ seed: "road-contract" }).roads;
    const cityVehicleEdges = graph.edges.filter(
      (edge) => edge.mode === "vehicle" && edge.surface === "city",
    );

    expect(ROAD_LINES).toBe(WORLD_LAYOUT.roadLines);
    expect(CITY_ROAD_LINES).toBe(WORLD_LAYOUT.roadLines);
    expect(graph.roadLines).toEqual(WORLD_LAYOUT.roadLines);
    expect(graph.roadLines.some((line) => BLOCK_CENTERS.includes(line))).toBe(
      false,
    );

    for (const edge of cityVehicleEdges) {
      const from = graph.nodes.get(edge.from);
      const to = graph.nodes.get(edge.to);
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      if (!from || !to) continue;

      const containedByRenderedRoad = renderedRoads.some((road) => {
        const contains = (x: number, z: number) => {
          const halfWidth = road.scale[0] / 2;
          const halfDepth = road.scale[2] / 2;
          return (
            Math.abs(x - road.position[0]) <= halfWidth + 1e-9 &&
            Math.abs(z - road.position[2]) <= halfDepth + 1e-9
          );
        };
        return contains(from.x, from.z) && contains(to.x, to.z);
      });
      expect(
        containedByRenderedRoad,
        `${edge.id} leaves rendered asphalt`,
      ).toBe(true);

      for (const blockX of BLOCK_CENTERS) {
        for (const blockZ of BLOCK_CENTERS) {
          expect(
            distanceToSegment([blockX, blockZ], [from.x, from.z], [to.x, to.z]),
            `${edge.id} crosses block center ${blockX},${blockZ}`,
          ).toBeGreaterThan(1e-9);
        }
      }
    }
  });

  it("offsets opposing lanes and separates approaches from departures", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const intersectionId = getIntersectionId(0, 0);
    const eastOutId = getLaneNodeId(intersectionId, "east", "outgoing");
    const eastInId = getLaneNodeId(intersectionId, "east", "incoming");
    const westOutId = getLaneNodeId(intersectionId, "west", "outgoing");
    const eastOut = graph.nodes.get(eastOutId);
    const eastIn = graph.nodes.get(eastInId);
    const westOut = graph.nodes.get(westOutId);

    expect(eastOut?.position).toEqual([4.5, 0, 2.5]);
    expect(eastIn?.position).toEqual([-4.5, 0, 2.5]);
    expect(westOut?.position).toEqual([-4.5, 0, -2.5]);

    const nextIntersection = getIntersectionId(28, 0);
    const eastLane = edgeTo(
      getOutgoingEdges(graph, eastOutId),
      getLaneNodeId(nextIntersection, "east", "incoming"),
    );
    expect(eastLane).toMatchObject({
      kind: "lane",
      mode: "vehicle",
      surface: "city",
      speedLimit: ROAD_GRAPH_SPEED_LIMITS.city,
    });
    expect(
      edgeTo(getOutgoingEdges(graph, eastOutId), westOutId),
    ).toBeUndefined();
  });

  it("connects only straight, left, and right movements inside intersections", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const intersectionId = getIntersectionId(0, 0);
    const eastInId = getLaneNodeId(intersectionId, "east", "incoming");
    const outgoing = getOutgoingEdges(graph, eastInId);

    expect(
      edgeTo(outgoing, getLaneNodeId(intersectionId, "east", "outgoing"))?.kind,
    ).toBe("intersection-straight");
    expect(
      edgeTo(outgoing, getLaneNodeId(intersectionId, "north", "outgoing"))
        ?.kind,
    ).toBe("turn-left");
    expect(
      edgeTo(outgoing, getLaneNodeId(intersectionId, "south", "outgoing"))
        ?.kind,
    ).toBe("turn-right");
    expect(
      edgeTo(outgoing, getLaneNodeId(intersectionId, "west", "outgoing")),
    ).toBeUndefined();
  });

  it("extends both travel modes through the bridge and permits a return trip", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const gatewayId = getIntersectionId(0, ROAD_LINES[0] as number);
    const firstBridgeId = getBridgeJunctionId(
      graph.bridgeCenterZs[1] as number,
    );
    const bridgeEndId = getBridgeJunctionId(BRIDGE_END);
    const northGateway = getLaneNodeId(gatewayId, "north", "outgoing");
    const northBridge = getLaneNodeId(firstBridgeId, "north", "incoming");
    const northEnd = getLaneNodeId(bridgeEndId, "north", "incoming");
    const southEnd = getLaneNodeId(bridgeEndId, "south", "outgoing");

    expect(
      edgeTo(getOutgoingEdges(graph, northGateway), northBridge),
    ).toMatchObject({
      kind: "lane",
      surface: "bridge",
      speedLimit: ROAD_GRAPH_SPEED_LIMITS.bridge,
    });
    expect(edgeTo(getOutgoingEdges(graph, northEnd), southEnd)?.kind).toBe(
      "turnaround",
    );

    const westWalkway = graph.nodes.get(getSidewalkNodeId(bridgeEndId, "west"));
    const eastWalkway = graph.nodes.get(getSidewalkNodeId(bridgeEndId, "east"));
    expect(westWalkway?.position).toEqual([-7, 0, BRIDGE_END]);
    expect(eastWalkway?.position).toEqual([7, 0, BRIDGE_END]);
    expect(
      edgeTo(
        getOutgoingEdges(graph, westWalkway?.id as string),
        eastWalkway?.id as string,
      ),
    ).toMatchObject({ kind: "crosswalk", surface: "bridge" });
  });

  it("links sidewalk corners along blocks and through explicit crosswalks", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const westIntersection = getIntersectionId(0, 0);
    const eastIntersection = getIntersectionId(28, 0);
    const westNorthEast = getSidewalkNodeId(westIntersection, "ne");
    const eastNorthWest = getSidewalkNodeId(eastIntersection, "nw");
    const westNorthWest = getSidewalkNodeId(westIntersection, "nw");

    expect(
      edgeTo(getOutgoingEdges(graph, westNorthEast), eastNorthWest),
    ).toMatchObject({
      kind: "sidewalk",
      mode: "pedestrian",
      speedLimit: ROAD_GRAPH_SPEED_LIMITS.sidewalk,
    });
    expect(
      edgeTo(getOutgoingEdges(graph, westNorthEast), westNorthWest),
    ).toMatchObject({
      kind: "crosswalk",
      speedLimit: ROAD_GRAPH_SPEED_LIMITS.crosswalk,
    });
  });

  it("finds the nearest compatible node with deterministic ties and bounds", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const road = findNearestRoadNode(graph, [4.4, 2.4], {
      direction: "east",
      phase: "outgoing",
    });
    expect(road?.id).toBe(
      getLaneNodeId(getIntersectionId(0, 0), "east", "outgoing"),
    );

    const sidewalk = findNearestSidewalkNode(graph, [6.5, 99, 6.5]);
    expect(sidewalk?.id).toBe(getSidewalkNodeId(getIntersectionId(0, 0), "se"));
    expect(
      findNearestRoadNode(graph, [4.4, 2.4], {
        direction: "east",
        phase: "outgoing",
        maxDistance: 0.05,
      }),
    ).toBeNull();
  });

  it("finds continuous A* routes and respects the visited-node bound", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const start = getLaneNodeId(getIntersectionId(-84, 84), "east", "outgoing");
    const goal = getLaneNodeId(getIntersectionId(84, -84), "east", "incoming");
    const route = findRoute(graph, start, goal, {
      mode: "vehicle",
      seed: "traffic-12",
    });

    expect(route).not.toBeNull();
    expect(route?.nodeIds[0]).toBe(start);
    expect(route?.nodeIds.at(-1)).toBe(goal);
    expect(route?.distance).toBeGreaterThan(0);
    expect(route?.duration).toBeGreaterThan(0);
    expect(
      route?.edges.every((edge, index) => {
        return (
          edge.from === route.nodeIds[index] &&
          edge.to === route.nodeIds[index + 1]
        );
      }),
    ).toBe(true);
    expect(
      findRoute(graph, start, goal, { maxVisited: 1, seed: "traffic-12" }),
    ).toBeNull();
    expect(() => findRoute(graph, start, goal, { maxVisited: 0 })).toThrow(
      /maxVisited/,
    );
  });

  it("replays seeded choices while allowing equal-cost alternatives", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const start = getLaneNodeId(getIntersectionId(-84, 84), "east", "outgoing");
    const goal = getLaneNodeId(getIntersectionId(84, -84), "east", "incoming");
    const first = findSeededRoute(graph, start, goal, "civilian-7");
    const replay = findSeededRoute(graph, start, goal, "civilian-7");
    const alternatives = new Set(
      Array.from({ length: 16 }, (_, seed) =>
        findSeededRoute(graph, start, goal, seed)?.edgeIds.join("|"),
      ),
    );

    expect(replay?.edgeIds).toEqual(first?.edgeIds);
    expect(alternatives.size).toBeGreaterThan(1);
  });

  it("routes positions to bridge and sidewalk destinations", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const vehicleRoute = findRouteBetween(
      graph,
      [0, 86],
      [0, 0, BRIDGE_END + 8],
      { mode: "vehicle", seed: "bridge-run" },
    );
    const pedestrianRoute = findRouteBetween(
      graph,
      [6.5, 6.5],
      [-7, BRIDGE_END],
      { mode: "pedestrian", cost: "distance", seed: "walker" },
    );

    expect(vehicleRoute?.edges.some((edge) => edge.surface === "bridge")).toBe(
      true,
    );
    expect(
      pedestrianRoute?.edges.some((edge) => edge.surface === "bridge"),
    ).toBe(true);
  });

  it("reports malformed endpoints and adjacency without mutating the graph", () => {
    const graph = BAY_CITY_ROAD_GRAPH;
    const removedNodeId = graph.edges[0]?.to as string;
    const nodes = new Map(graph.nodes);
    nodes.delete(removedNodeId);
    const invalid = { ...graph, nodes } as RoadGraph;
    const validation = validateRoadGraph(invalid);

    expect(validation.valid).toBe(false);
    expect(
      validation.errors.some((error) => error.includes("missing node")),
    ).toBe(true);
    expect(validateRoadGraph(graph).valid).toBe(true);
  });
});
