import type { EntityId, HeatState, Tick, Vec3 } from "../../core/contracts";
import { deriveSeed } from "../../core/rng";
import {
  findNearestRoadNode,
  findRoute,
  type RoadGraph,
  type RoadRoute,
  type VehicleRoadNode,
} from "../../world/road-graph";

export interface PoliceUnitPlan {
  readonly id: EntityId;
  readonly spawnNodeId: string;
  readonly targetNodeId: string;
  readonly route: RoadRoute;
  readonly spawnedAtTick: Tick;
}

export interface RoadblockPlan {
  readonly id: string;
  readonly junctionId: string;
  readonly nodeIds: readonly string[];
  readonly position: Vec3;
}

export interface PursuitPlanningInput {
  readonly tick: Tick;
  readonly seed: number;
  readonly heat: HeatState;
  readonly playerPosition: Vec3;
  readonly playerVelocity: Vec3;
  readonly existingUnitIds: readonly EntityId[];
  readonly mobile: boolean;
  readonly isNodeVisible: (node: VehicleRoadNode) => boolean;
}

export interface PursuitPlan {
  readonly spawnUnits: readonly PoliceUnitPlan[];
  readonly roadblock?: RoadblockPlan;
}

function desiredPoliceUnits(level: 0 | 1 | 2 | 3, mobile: boolean) {
  return (mobile ? [0, 1, 2, 4] : [0, 1, 3, 6])[level] as number;
}

function squaredDistance(a: Vec3, node: VehicleRoadNode) {
  return (a[0] - node.x) ** 2 + (a[2] - node.z) ** 2;
}

function predictPosition(
  position: Vec3,
  velocity: Vec3,
  seconds: number,
): Vec3 {
  return [
    position[0] + velocity[0] * seconds,
    position[1],
    position[2] + velocity[2] * seconds,
  ];
}

function candidateSpawnNodes(
  graph: RoadGraph,
  input: PursuitPlanningInput,
): readonly VehicleRoadNode[] {
  const candidates = [...graph.nodes.values()].filter(
    (node): node is VehicleRoadNode =>
      node.kind === "lane" &&
      node.phase === "outgoing" &&
      !input.isNodeVisible(node) &&
      squaredDistance(input.playerPosition, node) >= 45 ** 2 &&
      squaredDistance(input.playerPosition, node) <= 110 ** 2,
  );
  return candidates.sort(
    (left, right) =>
      deriveSeed(input.seed, `dispatch:${input.tick}:${left.id}`) -
        deriveSeed(input.seed, `dispatch:${input.tick}:${right.id}`) ||
      left.id.localeCompare(right.id),
  );
}

function nextUnitId(existing: readonly EntityId[], offset: number) {
  return Math.max(20_000, ...existing) + offset + 1;
}

function createRoadblock(
  graph: RoadGraph,
  input: PursuitPlanningInput,
  target: VehicleRoadNode,
): RoadblockPlan | undefined {
  if (input.heat.wantedLevel < 3) return undefined;
  const start = findNearestRoadNode(graph, input.playerPosition);
  if (!start) return undefined;
  const route = findRoute(graph, start, target, {
    mode: "vehicle",
    seed: deriveSeed(input.seed, `roadblock:${input.tick}`),
  });
  if (!route || route.nodes.length < 4) return undefined;
  const selected = route.nodes[
    Math.floor(route.nodes.length * 0.7)
  ] as VehicleRoadNode;
  const nodeIds = [...graph.nodes.values()]
    .filter(
      (node): node is VehicleRoadNode =>
        node.kind === "lane" && node.junctionId === selected.junctionId,
    )
    .map(({ id }) => id)
    .sort();
  return {
    id: `roadblock:${input.seed}:${selected.junctionId}`,
    junctionId: selected.junctionId,
    nodeIds,
    position: selected.position,
  };
}

export function planPursuit(
  graph: RoadGraph,
  input: PursuitPlanningInput,
): PursuitPlan {
  if (input.heat.wantedLevel === 0 || input.heat.mode === "return") {
    return { spawnUnits: [] };
  }
  const predicted = predictPosition(
    input.playerPosition,
    input.playerVelocity,
    3,
  );
  const target =
    findNearestRoadNode(graph, predicted) ??
    findNearestRoadNode(graph, input.playerPosition);
  if (!target) return { spawnUnits: [] };

  const needed = Math.max(
    0,
    desiredPoliceUnits(input.heat.wantedLevel, input.mobile) -
      input.existingUnitIds.length,
  );
  const spawnUnits = candidateSpawnNodes(graph, input)
    .slice(0, needed)
    .flatMap((spawn, index) => {
      const route = findRoute(graph, spawn, target, {
        mode: "vehicle",
        seed: deriveSeed(input.seed, `unit-route:${input.tick}:${index}`),
      });
      return route
        ? [
            {
              id: nextUnitId(input.existingUnitIds, index),
              spawnNodeId: spawn.id,
              targetNodeId: target.id,
              route,
              spawnedAtTick: input.tick,
            } satisfies PoliceUnitPlan,
          ]
        : [];
    });

  const roadblock = createRoadblock(graph, input, target);
  return {
    spawnUnits,
    ...(roadblock ? { roadblock } : {}),
  };
}
