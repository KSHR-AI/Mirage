import type { Pose } from "../core/contracts";
import type { RoadGraph, RoadGraphEdge, RoadRoute } from "../world/road-graph";

export interface TrafficRouteProgress {
  readonly routeId: string;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly edgeIndex: number;
  readonly distanceOnEdge: number;
  readonly distanceTravelled: number;
  readonly totalDistance: number;
  readonly completed: boolean;
}

export interface TrafficRouteSample {
  readonly pose: Pose;
  readonly edge: RoadGraphEdge | null;
  readonly speedLimit: number;
}

const EPSILON = 1e-9;

function edgeLookup(graph: RoadGraph) {
  return new Map(graph.edges.map((edge) => [edge.id, edge] as const));
}

function requireEdge(
  edges: ReadonlyMap<string, RoadGraphEdge>,
  edgeId: string,
) {
  const edge = edges.get(edgeId);
  if (!edge) throw new Error(`Traffic route references missing edge ${edgeId}`);
  return edge;
}

export function createTrafficRouteProgress(
  routeId: string,
  route: RoadRoute,
): TrafficRouteProgress {
  if (!routeId) throw new TypeError("Traffic route id must not be empty");
  return {
    routeId,
    nodeIds: Object.freeze([...route.nodeIds]),
    edgeIds: Object.freeze([...route.edgeIds]),
    edgeIndex: 0,
    distanceOnEdge: 0,
    distanceTravelled: 0,
    totalDistance: route.distance,
    completed: route.edgeIds.length === 0,
  };
}

export function currentTrafficRouteEdge(
  graph: RoadGraph,
  progress: TrafficRouteProgress,
) {
  const edgeId = progress.edgeIds[progress.edgeIndex];
  if (!edgeId) return null;
  return requireEdge(edgeLookup(graph), edgeId);
}

export function trafficRouteDistanceRemaining(progress: TrafficRouteProgress) {
  return Math.max(0, progress.totalDistance - progress.distanceTravelled);
}

export function advanceTrafficRoute(
  graph: RoadGraph,
  progress: TrafficRouteProgress,
  distance: number,
): TrafficRouteProgress {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new RangeError("Route distance must be a non-negative finite number");
  }
  if (progress.completed || distance <= EPSILON) return progress;

  const edges = edgeLookup(graph);
  let remaining = distance;
  let edgeIndex = progress.edgeIndex;
  let distanceOnEdge = progress.distanceOnEdge;
  let distanceTravelled = progress.distanceTravelled;

  while (edgeIndex < progress.edgeIds.length && remaining > EPSILON) {
    const edge = requireEdge(edges, progress.edgeIds[edgeIndex] as string);
    const available = Math.max(0, edge.length - distanceOnEdge);
    const consumed = Math.min(available, remaining);
    distanceOnEdge += consumed;
    distanceTravelled += consumed;
    remaining -= consumed;

    if (distanceOnEdge >= edge.length - EPSILON) {
      edgeIndex += 1;
      distanceOnEdge = 0;
    } else {
      break;
    }
  }

  const completed = edgeIndex >= progress.edgeIds.length;
  return {
    ...progress,
    edgeIndex,
    distanceOnEdge,
    distanceTravelled: Math.min(progress.totalDistance, distanceTravelled),
    completed,
  };
}

function edgeRotationY(graph: RoadGraph, edge: RoadGraphEdge) {
  const from = graph.nodes.get(edge.from);
  const to = graph.nodes.get(edge.to);
  if (!from || !to)
    throw new Error(`Traffic edge ${edge.id} has missing nodes`);
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function sampleTrafficRoute(
  graph: RoadGraph,
  progress: TrafficRouteProgress,
): TrafficRouteSample {
  const edges = edgeLookup(graph);
  const edgeId = progress.edgeIds[progress.edgeIndex];
  const edge = edgeId ? requireEdge(edges, edgeId) : null;

  if (!edge) {
    const finalNodeId = progress.nodeIds.at(-1);
    const finalNode = finalNodeId ? graph.nodes.get(finalNodeId) : undefined;
    if (!finalNode) {
      throw new Error(`Traffic route ${progress.routeId} has no final node`);
    }
    const finalEdgeId = progress.edgeIds.at(-1);
    const finalEdge = finalEdgeId ? requireEdge(edges, finalEdgeId) : null;
    return {
      pose: {
        position: finalNode.position,
        rotationY: finalEdge ? edgeRotationY(graph, finalEdge) : 0,
      },
      edge: null,
      speedLimit: 0,
    };
  }

  const from = graph.nodes.get(edge.from);
  const to = graph.nodes.get(edge.to);
  if (!from || !to)
    throw new Error(`Traffic edge ${edge.id} has missing nodes`);
  const alpha = Math.max(0, Math.min(1, progress.distanceOnEdge / edge.length));

  return {
    pose: {
      position: [
        from.position[0] + (to.position[0] - from.position[0]) * alpha,
        from.position[1] + (to.position[1] - from.position[1]) * alpha,
        from.position[2] + (to.position[2] - from.position[2]) * alpha,
      ],
      rotationY: edgeRotationY(graph, edge),
    },
    edge,
    speedLimit: edge.speedLimit,
  };
}
