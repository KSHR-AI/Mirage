import { describe, expect, it } from "vitest";

import type { Vec3 } from "../../core/contracts";
import type {
  RoadGraph,
  RoadGraphEdge,
  RoadGraphEdgeKind,
  SidewalkRoadNode,
} from "../../world/road-graph";
import { CivilianAiSystem } from "./civilian-ai";
import type { ThreatStimulus } from "./perception";

interface EdgeFixture {
  readonly from: string;
  readonly to: string;
  readonly kind: RoadGraphEdgeKind;
}

function pedestrianGraph(
  positions: Readonly<Record<string, Vec3>>,
  edgeFixtures: readonly EdgeFixture[],
): RoadGraph {
  const nodes = new Map<string, SidewalkRoadNode>(
    Object.entries(positions).map(([id, position]) => [
      id,
      {
        id,
        kind: "sidewalk",
        mode: "pedestrian",
        position,
        x: position[0],
        z: position[2],
        junctionId: id,
        intersectionId: id,
        bridge: false,
      },
    ]),
  );
  const edges: RoadGraphEdge[] = edgeFixtures.map((fixture) => {
    const from = nodes.get(fixture.from) as SidewalkRoadNode;
    const to = nodes.get(fixture.to) as SidewalkRoadNode;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    return {
      id: `${fixture.from}:${fixture.to}`,
      from: fixture.from,
      to: fixture.to,
      mode: "pedestrian",
      kind: fixture.kind,
      surface: "city",
      length,
      speedLimit: 2,
      travelTime: length / 2,
    };
  });
  const outgoing = new Map<string, readonly RoadGraphEdge[]>();
  for (const id of nodes.keys()) outgoing.set(id, []);
  for (const edge of edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }
  return {
    nodes,
    edges,
    outgoing,
    junctions: [],
    intersections: [],
    roadLines: [],
    bridgeCenterZs: [],
    settings: {
      laneOffset: 1,
      intersectionOffset: 1,
      sidewalkOffset: 1,
      bridgeSidewalkOffset: 1,
      bridgeGatewayX: 0,
      bridgeEntryZ: 0,
      bridgeEndZ: 0,
    },
  };
}

const gunfire: ThreatStimulus = {
  id: "gunfire-1",
  position: [-5, 0, 0],
  sense: "sound",
  severity: 1,
  radius: 50,
  createdAtTick: 0,
  expiresAtTick: 1,
};

describe("CivilianAiSystem", () => {
  it("reuses fixed pool slots without growing past capacity", () => {
    const graph = pedestrianGraph({ a: [0, 0, 0], b: [5, 0, 0] }, [
      { from: "a", to: "b", kind: "sidewalk" },
    ]);
    const civilians = new CivilianAiSystem({
      graph,
      seed: "pool",
      config: { capacity: 1 },
    });

    expect(civilians.spawn({ actorId: 1, nodeId: "a" })).toBe(0);
    expect(civilians.spawn({ actorId: 2, nodeId: "a" })).toBeNull();
    expect(civilians.despawn(1)).toBe(true);
    expect(civilians.spawn({ actorId: 2, nodeId: "a" })).toBe(0);
    expect(civilians.size).toBe(1);

    civilians.update({
      tick: 5,
      actors: [{ actorId: 2, position: [0, 0, 0] }],
    });
    civilians.despawn(2);
    civilians.spawn({ actorId: 3, nodeId: "a", spawnTick: 5 });
    expect(() =>
      civilians.update({
        tick: 4,
        actors: [{ actorId: 3, position: [0, 0, 0] }],
      }),
    ).toThrow(/backwards/);
  });

  it("waits at crosswalks, crosses on permission, then resumes wandering", () => {
    const graph = pedestrianGraph({ a: [0, 0, 0], b: [5, 0, 0] }, [
      { from: "a", to: "b", kind: "crosswalk" },
      { from: "b", to: "a", kind: "sidewalk" },
    ]);
    const civilians = new CivilianAiSystem({
      graph,
      seed: "crossing",
      config: {
        capacity: 1,
        perceptionChecksPerTick: 1,
        waitCrossMinTicks: 2,
        waitCrossMaxTicks: 2,
      },
    });
    civilians.spawn({ actorId: 1, nodeId: "a" });

    expect(
      civilians.update({
        tick: 0,
        actors: [{ actorId: 1, position: [0, 0, 0] }],
      })[0],
    ).toMatchObject({ state: "wait-cross", move: undefined });
    expect(
      civilians.update({
        tick: 2,
        actors: [{ actorId: 1, position: [0, 0, 0] }],
        crosswalkOpen: () => false,
      })[0]?.state,
    ).toBe("wait-cross");
    expect(
      civilians.update({
        tick: 3,
        actors: [{ actorId: 1, position: [0, 0, 0] }],
        crosswalkOpen: () => true,
      })[0],
    ).toMatchObject({
      state: "cross",
      move: { target: [5, 0, 0], speed: 2 },
    });
    expect(
      civilians.update({
        tick: 4,
        actors: [{ actorId: 1, position: [5, 0, 0] }],
      })[0],
    ).toMatchObject({
      state: "wander",
      move: { target: [0, 0, 0] },
    });
  });

  it("spreads threat checks across the pool and flees away from danger", () => {
    const graph = pedestrianGraph(
      { a: [0, 0, 0], west: [-10, 0, 0], east: [10, 0, 0] },
      [
        { from: "a", to: "west", kind: "sidewalk" },
        { from: "a", to: "east", kind: "sidewalk" },
      ],
    );
    const civilians = new CivilianAiSystem({
      graph,
      seed: "panic",
      config: { capacity: 2, perceptionChecksPerTick: 1 },
    });
    civilians.spawn({ actorId: 2, nodeId: "a" });
    civilians.spawn({ actorId: 1, nodeId: "a" });
    const actors = [
      { actorId: 2, position: [0, 0, 0] as Vec3 },
      { actorId: 1, position: [0, 0, 0] as Vec3 },
    ];

    const first = civilians.update({ tick: 0, actors, threats: [gunfire] });
    expect(first.find((intent) => intent.actorId === 1)).toMatchObject({
      state: "flee",
      move: { target: [10, 0, 0] },
    });
    expect(first.find((intent) => intent.actorId === 2)?.state).toBe("wander");

    const second = civilians.update({ tick: 1, actors, threats: [gunfire] });
    expect(second.find((intent) => intent.actorId === 2)?.state).toBe("flee");
  });

  it("cowers after escape and deterministically recovers when threat memory clears", () => {
    const graph = pedestrianGraph({ a: [0, 0, 0], b: [10, 0, 0] }, [
      { from: "a", to: "b", kind: "sidewalk" },
    ]);
    const civilians = new CivilianAiSystem({
      graph,
      seed: "recover",
      config: {
        capacity: 1,
        perceptionChecksPerTick: 1,
        minimumFleeTicks: 1,
        threatMemoryTicks: 0,
        cowerTicks: 2,
      },
    });
    civilians.spawn({ actorId: 1, nodeId: "a" });
    const actors = [{ actorId: 1, position: [0, 0, 0] as Vec3 }];

    expect(
      civilians.update({ tick: 0, actors, threats: [gunfire] })[0]?.state,
    ).toBe("flee");
    expect(civilians.update({ tick: 1, actors })[0]).toMatchObject({
      state: "cower",
      cower: true,
      move: undefined,
    });
    expect(civilians.update({ tick: 2, actors })[0]?.state).toBe("cower");
    expect(civilians.update({ tick: 3, actors })[0]?.state).toBe("wander");
  });
});
