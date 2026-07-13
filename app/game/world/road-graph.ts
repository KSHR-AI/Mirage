import { deriveSeed, type RngSeed } from "../core/rng";
import { WORLD_LAYOUT } from "./world-layout";

export type RoadTravelMode = "vehicle" | "pedestrian";
export type CardinalDirection = "north" | "east" | "south" | "west";
export type LaneNodePhase = "incoming" | "outgoing";
export type SidewalkCorner = "nw" | "ne" | "se" | "sw";
export type BridgeSide = "west" | "east";
export type RoadSurface = "city" | "bridge";
export type RoadGraphEdgeKind =
  | "lane"
  | "intersection-straight"
  | "turn-left"
  | "turn-right"
  | "turnaround"
  | "sidewalk"
  | "crosswalk"
  | "sidewalk-connector";

export type RoadGraphPosition =
  | readonly [x: number, z: number]
  | readonly [x: number, y: number, z: number]
  | { readonly x: number; readonly z: number };

interface RoadGraphNodeBase {
  readonly id: string;
  readonly mode: RoadTravelMode;
  readonly position: readonly [x: number, y: number, z: number];
  readonly x: number;
  readonly z: number;
  readonly junctionId: string;
  readonly intersectionId?: string;
  readonly bridge: boolean;
}

export interface VehicleRoadNode extends RoadGraphNodeBase {
  readonly kind: "lane";
  readonly mode: "vehicle";
  readonly direction: CardinalDirection;
  readonly phase: LaneNodePhase;
}

export interface SidewalkRoadNode extends RoadGraphNodeBase {
  readonly kind: "sidewalk";
  readonly mode: "pedestrian";
  readonly corner?: SidewalkCorner;
  readonly bridgeSide?: BridgeSide;
}

export type RoadGraphNode = VehicleRoadNode | SidewalkRoadNode;

export interface RoadGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly mode: RoadTravelMode;
  readonly kind: RoadGraphEdgeKind;
  readonly surface: RoadSurface;
  readonly length: number;
  readonly speedLimit: number;
  readonly travelTime: number;
}

export type RoadGraphJunctionKind =
  | "intersection"
  | "bridge-gateway"
  | "bridge-waypoint"
  | "bridge-end";

export interface RoadGraphJunction {
  readonly id: string;
  readonly kind: RoadGraphJunctionKind;
  readonly position: readonly [x: number, y: number, z: number];
  readonly x: number;
  readonly z: number;
  readonly nodeIds: readonly string[];
}

export interface RoadGraphSettings {
  readonly laneOffset: number;
  readonly intersectionOffset: number;
  readonly sidewalkOffset: number;
  readonly bridgeSidewalkOffset: number;
  readonly bridgeGatewayX: number;
  readonly bridgeEntryZ: number;
  readonly bridgeEndZ: number;
}

export interface RoadGraph {
  readonly nodes: ReadonlyMap<string, RoadGraphNode>;
  readonly edges: readonly RoadGraphEdge[];
  readonly outgoing: ReadonlyMap<string, readonly RoadGraphEdge[]>;
  readonly junctions: readonly RoadGraphJunction[];
  readonly intersections: readonly RoadGraphJunction[];
  readonly roadLines: readonly number[];
  readonly bridgeCenterZs: readonly number[];
  readonly settings: RoadGraphSettings;
}

export interface RoadGraphBuildOptions {
  readonly roadLines?: readonly number[];
  readonly laneOffset?: number;
  readonly intersectionOffset?: number;
  readonly sidewalkOffset?: number;
  readonly bridgeSidewalkOffset?: number;
  readonly bridgeGatewayX?: number;
  readonly bridgeEntryZ?: number;
  readonly bridgeEndZ?: number;
}

export interface NearestNodeOptions {
  readonly mode?: RoadTravelMode;
  readonly kind?: RoadGraphNode["kind"];
  readonly direction?: CardinalDirection;
  readonly phase?: LaneNodePhase;
  readonly maxDistance?: number;
  readonly predicate?: (node: RoadGraphNode) => boolean;
}

export type RouteCost = "time" | "distance";

export interface RouteSearchOptions {
  readonly mode?: RoadTravelMode;
  readonly cost?: RouteCost;
  readonly maxVisited?: number;
  readonly maxIterations?: number;
  readonly seed?: RngSeed;
}

export interface RouteBetweenOptions extends RouteSearchOptions {
  readonly mode: RoadTravelMode;
  readonly maxSnapDistance?: number;
}

export interface RoadRoute {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly nodes: readonly RoadGraphNode[];
  readonly edges: readonly RoadGraphEdge[];
  readonly distance: number;
  readonly duration: number;
  readonly cost: number;
  readonly visitedCount: number;
}

export interface RoadGraphValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly nodeCount: number;
  readonly edgeCount: number;
}

const ROAD_GRAPH_LANE_OFFSET = 2.5;
const ROAD_GRAPH_INTERSECTION_OFFSET = 4.5;
const ROAD_GRAPH_SIDEWALK_OFFSET = 6.5;
const ROAD_GRAPH_BRIDGE_SIDEWALK_OFFSET = 7;
const DEFAULT_MAX_ROUTE_VISITS = 2_048;

export const ROAD_GRAPH_SPEED_LIMITS = Object.freeze({
  city: 14,
  bridge: 22,
  intersection: 10,
  leftTurn: 7,
  rightTurn: 6,
  turnaround: 4,
  sidewalk: 1.8,
  crosswalk: 1.4,
});

const EPSILON = 1e-9;
const DIRECTIONS: readonly CardinalDirection[] = [
  "north",
  "east",
  "south",
  "west",
];
const CORNERS: readonly SidewalkCorner[] = ["nw", "ne", "se", "sw"];
const DIRECTION_VECTOR: Readonly<
  Record<CardinalDirection, readonly [x: number, z: number]>
> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};
const LEFT_TURN: Readonly<Record<CardinalDirection, CardinalDirection>> = {
  north: "west",
  east: "north",
  south: "east",
  west: "south",
};
const RIGHT_TURN: Readonly<Record<CardinalDirection, CardinalDirection>> = {
  north: "east",
  east: "south",
  south: "west",
  west: "north",
};
const OPPOSITE: Readonly<Record<CardinalDirection, CardinalDirection>> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};

interface MutableJunction {
  readonly id: string;
  kind: RoadGraphJunctionKind;
  readonly x: number;
  readonly z: number;
  readonly nodeIds: string[];
}

function coordinateKey(value: number) {
  return Object.is(value, -0) ? "0" : String(value);
}

export function getIntersectionId(x: number, z: number) {
  return `intersection:${coordinateKey(x)}:${coordinateKey(z)}`;
}

export function getBridgeJunctionId(z: number) {
  return `bridge:${coordinateKey(z)}`;
}

export function getLaneNodeId(
  junctionId: string,
  direction: CardinalDirection,
  phase: LaneNodePhase,
) {
  return `${junctionId}:lane:${direction}:${phase}`;
}

export function getSidewalkNodeId(
  junctionId: string,
  cornerOrSide: SidewalkCorner | BridgeSide,
) {
  return `${junctionId}:sidewalk:${cornerOrSide}`;
}

function isCityIntersection(kind: RoadGraphJunctionKind) {
  return kind === "intersection" || kind === "bridge-gateway";
}

function distanceBetween(a: RoadGraphNode, b: RoadGraphNode) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function requirePositiveFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return value;
}

function uniqueSortedNumbers(values: readonly number[], name: string) {
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`${name} must contain at least two finite values`);
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function typicalRoadSpacing(lines: readonly number[]) {
  let spacing = Number.POSITIVE_INFINITY;
  for (let index = 1; index < lines.length; index += 1) {
    spacing = Math.min(
      spacing,
      (lines[index] as number) - (lines[index - 1] as number),
    );
  }
  return spacing;
}

function buildBridgeCenters(
  gatewayZ: number,
  entryZ: number,
  endZ: number,
  spacing: number,
) {
  const centers = [gatewayZ, entryZ];
  let next = entryZ - spacing;
  while (next > endZ) {
    centers.push(next);
    next -= spacing;
  }
  if (centers.at(-1) !== endZ) centers.push(endZ);
  return centers;
}

function isNumberArray(
  value: RoadGraphBuildOptions | readonly number[],
): value is readonly number[] {
  return Array.isArray(value);
}

function isPositionTuple(
  value: RoadGraphPosition,
): value is
  | readonly [x: number, z: number]
  | readonly [x: number, y: number, z: number] {
  return Array.isArray(value);
}

class GraphBuilder {
  readonly nodes = new Map<string, RoadGraphNode>();
  readonly edges: RoadGraphEdge[] = [];
  readonly outgoing = new Map<string, RoadGraphEdge[]>();
  readonly junctions = new Map<string, MutableJunction>();
  readonly #settings: RoadGraphSettings;

  constructor(settings: RoadGraphSettings) {
    this.#settings = settings;
  }

  addJunction(id: string, kind: RoadGraphJunctionKind, x: number, z: number) {
    const existing = this.junctions.get(id);
    if (existing) {
      if (kind === "bridge-gateway") existing.kind = kind;
      return existing;
    }
    const junction: MutableJunction = { id, kind, x, z, nodeIds: [] };
    this.junctions.set(id, junction);
    return junction;
  }

  addNode(node: RoadGraphNode) {
    if (this.nodes.has(node.id))
      throw new Error(`Duplicate road node ${node.id}`);
    const junction = this.junctions.get(node.junctionId);
    if (!junction) throw new Error(`Missing junction ${node.junctionId}`);
    const frozen = Object.freeze(node);
    this.nodes.set(node.id, frozen);
    this.outgoing.set(node.id, []);
    junction.nodeIds.push(node.id);
    return frozen;
  }

  ensureLaneNode(
    junctionId: string,
    direction: CardinalDirection,
    phase: LaneNodePhase,
  ) {
    const id = getLaneNodeId(junctionId, direction, phase);
    const existing = this.nodes.get(id);
    if (existing) return existing as VehicleRoadNode;
    const junction = this.junctions.get(junctionId);
    if (!junction) throw new Error(`Missing junction ${junctionId}`);
    const [directionX, directionZ] = DIRECTION_VECTOR[direction];
    const longitudinal =
      phase === "incoming"
        ? -this.#settings.intersectionOffset
        : this.#settings.intersectionOffset;
    const x =
      junction.x +
      directionX * longitudinal -
      directionZ * this.#settings.laneOffset;
    const z =
      junction.z +
      directionZ * longitudinal +
      directionX * this.#settings.laneOffset;

    return this.addNode({
      id,
      kind: "lane",
      mode: "vehicle",
      position: [x, 0, z],
      x,
      z,
      junctionId,
      intersectionId: isCityIntersection(junction.kind)
        ? junctionId
        : undefined,
      bridge: junction.kind !== "intersection",
      direction,
      phase,
    }) as VehicleRoadNode;
  }

  addSidewalkCorner(junctionId: string, corner: SidewalkCorner) {
    const id = getSidewalkNodeId(junctionId, corner);
    const existing = this.nodes.get(id);
    if (existing) return existing as SidewalkRoadNode;
    const junction = this.junctions.get(junctionId);
    if (!junction) throw new Error(`Missing junction ${junctionId}`);
    const west = corner === "nw" || corner === "sw";
    const north = corner === "nw" || corner === "ne";
    const x = junction.x + (west ? -1 : 1) * this.#settings.sidewalkOffset;
    const z = junction.z + (north ? -1 : 1) * this.#settings.sidewalkOffset;

    return this.addNode({
      id,
      kind: "sidewalk",
      mode: "pedestrian",
      position: [x, 0, z],
      x,
      z,
      junctionId,
      intersectionId: junctionId,
      bridge: junction.kind === "bridge-gateway",
      corner,
    }) as SidewalkRoadNode;
  }

  addBridgeSidewalkNode(junctionId: string, side: BridgeSide) {
    const id = getSidewalkNodeId(junctionId, side);
    const existing = this.nodes.get(id);
    if (existing) return existing as SidewalkRoadNode;
    const junction = this.junctions.get(junctionId);
    if (!junction) throw new Error(`Missing junction ${junctionId}`);
    const x =
      this.#settings.bridgeGatewayX +
      (side === "west" ? -1 : 1) * this.#settings.bridgeSidewalkOffset;

    return this.addNode({
      id,
      kind: "sidewalk",
      mode: "pedestrian",
      position: [x, 0, junction.z],
      x,
      z: junction.z,
      junctionId,
      bridge: true,
      bridgeSide: side,
    }) as SidewalkRoadNode;
  }

  addEdge(
    fromId: string,
    toId: string,
    kind: RoadGraphEdgeKind,
    surface: RoadSurface,
    speedLimit: number,
  ) {
    const from = this.nodes.get(fromId);
    const to = this.nodes.get(toId);
    if (!from || !to)
      throw new Error(`Cannot connect missing nodes ${fromId} -> ${toId}`);
    if (from.mode !== to.mode)
      throw new Error(`Cannot mix travel modes ${fromId} -> ${toId}`);
    const length = distanceBetween(from, to);
    if (length <= EPSILON)
      throw new Error(`Zero-length road edge ${fromId} -> ${toId}`);
    const id = `${kind}:${fromId}->${toId}`;
    if (this.edges.some((edge) => edge.id === id)) {
      throw new Error(`Duplicate road edge ${id}`);
    }
    const edge = Object.freeze({
      id,
      from: fromId,
      to: toId,
      mode: from.mode,
      kind,
      surface,
      length,
      speedLimit,
      travelTime: length / speedLimit,
    });
    this.edges.push(edge);
    (this.outgoing.get(fromId) as RoadGraphEdge[]).push(edge);
    return edge;
  }

  finish(
    roadLines: readonly number[],
    bridgeCenterZs: readonly number[],
  ): RoadGraph {
    const junctions = [...this.junctions.values()]
      .map((junction) =>
        Object.freeze({
          id: junction.id,
          kind: junction.kind,
          position: [junction.x, 0, junction.z] as const,
          x: junction.x,
          z: junction.z,
          nodeIds: Object.freeze([...junction.nodeIds].sort()),
        }),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const outgoing = new Map<string, readonly RoadGraphEdge[]>();
    for (const [nodeId, edges] of this.outgoing) {
      outgoing.set(
        nodeId,
        Object.freeze([...edges].sort((a, b) => a.id.localeCompare(b.id))),
      );
    }
    const edges = Object.freeze(
      [...this.edges].sort((a, b) => a.id.localeCompare(b.id)),
    );

    return Object.freeze({
      nodes: this.nodes,
      edges,
      outgoing,
      junctions: Object.freeze(junctions),
      intersections: Object.freeze(
        junctions.filter((junction) => isCityIntersection(junction.kind)),
      ),
      roadLines: Object.freeze([...roadLines]),
      bridgeCenterZs: Object.freeze([...bridgeCenterZs]),
      settings: Object.freeze({ ...this.#settings }),
    });
  }
}

function addBidirectionalEdge(
  builder: GraphBuilder,
  firstId: string,
  secondId: string,
  kind: RoadGraphEdgeKind,
  surface: RoadSurface,
  speedLimit: number,
) {
  builder.addEdge(firstId, secondId, kind, surface, speedLimit);
  builder.addEdge(secondId, firstId, kind, surface, speedLimit);
}

function connectVehicleSegment(
  builder: GraphBuilder,
  lowerId: string,
  upperId: string,
  positiveDirection: "east" | "south",
  surface: RoadSurface,
) {
  const negativeDirection = OPPOSITE[positiveDirection];
  const positiveFrom = builder.ensureLaneNode(
    lowerId,
    positiveDirection,
    "outgoing",
  );
  const positiveTo = builder.ensureLaneNode(
    upperId,
    positiveDirection,
    "incoming",
  );
  const negativeFrom = builder.ensureLaneNode(
    upperId,
    negativeDirection,
    "outgoing",
  );
  const negativeTo = builder.ensureLaneNode(
    lowerId,
    negativeDirection,
    "incoming",
  );
  const speedLimit =
    surface === "bridge"
      ? ROAD_GRAPH_SPEED_LIMITS.bridge
      : ROAD_GRAPH_SPEED_LIMITS.city;
  builder.addEdge(positiveFrom.id, positiveTo.id, "lane", surface, speedLimit);
  builder.addEdge(negativeFrom.id, negativeTo.id, "lane", surface, speedLimit);
}

function movementKind(
  incoming: CardinalDirection,
  outgoing: CardinalDirection,
  junctionKind: RoadGraphJunctionKind,
): RoadGraphEdgeKind | null {
  if (incoming === outgoing) return "intersection-straight";
  if (LEFT_TURN[incoming] === outgoing) return "turn-left";
  if (RIGHT_TURN[incoming] === outgoing) return "turn-right";
  if (junctionKind === "bridge-end" && OPPOSITE[incoming] === outgoing) {
    return "turnaround";
  }
  return null;
}

function movementSpeed(kind: RoadGraphEdgeKind, surface: RoadSurface) {
  if (kind === "turn-left") return ROAD_GRAPH_SPEED_LIMITS.leftTurn;
  if (kind === "turn-right") return ROAD_GRAPH_SPEED_LIMITS.rightTurn;
  if (kind === "turnaround") return ROAD_GRAPH_SPEED_LIMITS.turnaround;
  return surface === "bridge"
    ? ROAD_GRAPH_SPEED_LIMITS.bridge
    : ROAD_GRAPH_SPEED_LIMITS.intersection;
}

function normalizeBuildOptions(
  optionsOrRoadLines: RoadGraphBuildOptions | readonly number[],
) {
  const options: RoadGraphBuildOptions = isNumberArray(optionsOrRoadLines)
    ? { roadLines: optionsOrRoadLines }
    : optionsOrRoadLines;
  const roadLines = uniqueSortedNumbers(
    options.roadLines ?? WORLD_LAYOUT.roadLines,
    "roadLines",
  );
  const laneOffset = requirePositiveFinite(
    "laneOffset",
    options.laneOffset ?? ROAD_GRAPH_LANE_OFFSET,
  );
  const intersectionOffset = requirePositiveFinite(
    "intersectionOffset",
    options.intersectionOffset ?? ROAD_GRAPH_INTERSECTION_OFFSET,
  );
  const sidewalkOffset = requirePositiveFinite(
    "sidewalkOffset",
    options.sidewalkOffset ?? ROAD_GRAPH_SIDEWALK_OFFSET,
  );
  const bridgeSidewalkOffset = requirePositiveFinite(
    "bridgeSidewalkOffset",
    options.bridgeSidewalkOffset ?? ROAD_GRAPH_BRIDGE_SIDEWALK_OFFSET,
  );
  const bridgeGatewayX = options.bridgeGatewayX ?? 0;
  const bridgeEntryZ = options.bridgeEntryZ ?? WORLD_LAYOUT.extents.landMin;
  const bridgeEndZ = options.bridgeEndZ ?? WORLD_LAYOUT.extents.bridgeEndZ;
  const northRoad = roadLines[0] as number;
  if (
    !Number.isFinite(bridgeGatewayX) ||
    bridgeGatewayX < (roadLines[0] as number) ||
    bridgeGatewayX > (roadLines.at(-1) as number)
  ) {
    throw new RangeError(
      "bridgeGatewayX must be finite and inside the road grid",
    );
  }
  if (!(bridgeEndZ < bridgeEntryZ && bridgeEntryZ < northRoad)) {
    throw new RangeError(
      "Bridge coordinates must satisfy end < entry < north road",
    );
  }
  const spacing = typicalRoadSpacing(roadLines);
  if (
    spacing <= intersectionOffset * 2 ||
    Math.min(
      ...roadLines
        .map((line) => Math.abs(line - bridgeGatewayX))
        .filter(Boolean),
    ) <=
      intersectionOffset * 2
  ) {
    throw new RangeError(
      "Road junctions must leave space between intersection nodes",
    );
  }

  const settings: RoadGraphSettings = {
    laneOffset,
    intersectionOffset,
    sidewalkOffset,
    bridgeSidewalkOffset,
    bridgeGatewayX,
    bridgeEntryZ,
    bridgeEndZ,
  };
  return {
    roadLines,
    settings,
    bridgeCenterZs: buildBridgeCenters(
      northRoad,
      bridgeEntryZ,
      bridgeEndZ,
      spacing,
    ),
  };
}

export function createRoadGraph(
  optionsOrRoadLines: RoadGraphBuildOptions | readonly number[] = {},
): RoadGraph {
  const { roadLines, settings, bridgeCenterZs } =
    normalizeBuildOptions(optionsOrRoadLines);
  const builder = new GraphBuilder(settings);
  const northRoad = roadLines[0] as number;
  const gatewayId = getIntersectionId(settings.bridgeGatewayX, northRoad);

  for (const z of roadLines) {
    for (const x of roadLines) {
      builder.addJunction(getIntersectionId(x, z), "intersection", x, z);
    }
  }
  builder.addJunction(
    gatewayId,
    "bridge-gateway",
    settings.bridgeGatewayX,
    northRoad,
  );
  for (const z of bridgeCenterZs.slice(1)) {
    builder.addJunction(
      getBridgeJunctionId(z),
      z === settings.bridgeEndZ ? "bridge-end" : "bridge-waypoint",
      settings.bridgeGatewayX,
      z,
    );
  }

  for (const z of roadLines) {
    const xCoordinates =
      z === northRoad
        ? uniqueSortedNumbers(
            [...roadLines, settings.bridgeGatewayX],
            "north road",
          )
        : roadLines;
    for (let index = 1; index < xCoordinates.length; index += 1) {
      const westX = xCoordinates[index - 1] as number;
      const eastX = xCoordinates[index] as number;
      connectVehicleSegment(
        builder,
        getIntersectionId(westX, z),
        getIntersectionId(eastX, z),
        "east",
        "city",
      );
    }
  }
  for (const x of roadLines) {
    for (let index = 1; index < roadLines.length; index += 1) {
      const northZ = roadLines[index - 1] as number;
      const southZ = roadLines[index] as number;
      connectVehicleSegment(
        builder,
        getIntersectionId(x, northZ),
        getIntersectionId(x, southZ),
        "south",
        "city",
      );
    }
  }
  const ascendingBridgeZs = [...bridgeCenterZs].sort((a, b) => a - b);
  for (let index = 1; index < ascendingBridgeZs.length; index += 1) {
    const northZ = ascendingBridgeZs[index - 1] as number;
    const southZ = ascendingBridgeZs[index] as number;
    connectVehicleSegment(
      builder,
      northZ === northRoad ? gatewayId : getBridgeJunctionId(northZ),
      southZ === northRoad ? gatewayId : getBridgeJunctionId(southZ),
      "south",
      "bridge",
    );
  }

  for (const junction of builder.junctions.values()) {
    for (const incoming of DIRECTIONS) {
      const incomingNode = builder.nodes.get(
        getLaneNodeId(junction.id, incoming, "incoming"),
      );
      if (!incomingNode) continue;
      for (const outgoing of DIRECTIONS) {
        const outgoingNode = builder.nodes.get(
          getLaneNodeId(junction.id, outgoing, "outgoing"),
        );
        if (!outgoingNode) continue;
        const kind = movementKind(incoming, outgoing, junction.kind);
        if (!kind) continue;
        const surface =
          junction.kind === "bridge-waypoint" ||
          junction.kind === "bridge-end" ||
          (junction.kind === "bridge-gateway" &&
            (incoming === "south" || outgoing === "north"))
            ? "bridge"
            : "city";
        builder.addEdge(
          incomingNode.id,
          outgoingNode.id,
          kind,
          surface,
          movementSpeed(kind, surface),
        );
      }
    }
  }

  const cityJunctionIds: string[] = [];
  for (const z of roadLines) {
    for (const x of roadLines) cityJunctionIds.push(getIntersectionId(x, z));
  }
  if (!cityJunctionIds.includes(gatewayId)) cityJunctionIds.push(gatewayId);
  for (const junctionId of cityJunctionIds) {
    for (const corner of CORNERS) builder.addSidewalkCorner(junctionId, corner);
    const pairs: readonly (readonly [SidewalkCorner, SidewalkCorner])[] = [
      ["nw", "ne"],
      ["sw", "se"],
      ["nw", "sw"],
      ["ne", "se"],
    ];
    for (const [first, second] of pairs) {
      addBidirectionalEdge(
        builder,
        getSidewalkNodeId(junctionId, first),
        getSidewalkNodeId(junctionId, second),
        "crosswalk",
        "city",
        ROAD_GRAPH_SPEED_LIMITS.crosswalk,
      );
    }
  }

  for (const z of roadLines) {
    const xCoordinates =
      z === northRoad
        ? uniqueSortedNumbers(
            [...roadLines, settings.bridgeGatewayX],
            "north sidewalk",
          )
        : roadLines;
    for (let index = 1; index < xCoordinates.length; index += 1) {
      const westId = getIntersectionId(xCoordinates[index - 1] as number, z);
      const eastId = getIntersectionId(xCoordinates[index] as number, z);
      for (const [westCorner, eastCorner] of [
        ["ne", "nw"],
        ["se", "sw"],
      ] as const) {
        addBidirectionalEdge(
          builder,
          getSidewalkNodeId(westId, westCorner),
          getSidewalkNodeId(eastId, eastCorner),
          "sidewalk",
          "city",
          ROAD_GRAPH_SPEED_LIMITS.sidewalk,
        );
      }
    }
  }
  for (const x of roadLines) {
    for (let index = 1; index < roadLines.length; index += 1) {
      const northId = getIntersectionId(x, roadLines[index - 1] as number);
      const southId = getIntersectionId(x, roadLines[index] as number);
      for (const [northCorner, southCorner] of [
        ["sw", "nw"],
        ["se", "ne"],
      ] as const) {
        addBidirectionalEdge(
          builder,
          getSidewalkNodeId(northId, northCorner),
          getSidewalkNodeId(southId, southCorner),
          "sidewalk",
          "city",
          ROAD_GRAPH_SPEED_LIMITS.sidewalk,
        );
      }
    }
  }

  const bridgeEndSidewalkIds: string[] = [];
  for (const side of ["west", "east"] as const) {
    let previousId = getSidewalkNodeId(
      gatewayId,
      side === "west" ? "nw" : "ne",
    );
    for (const z of bridgeCenterZs.slice(1)) {
      const junctionId = getBridgeJunctionId(z);
      const node = builder.addBridgeSidewalkNode(junctionId, side);
      addBidirectionalEdge(
        builder,
        previousId,
        node.id,
        previousId.includes("bridge:") ? "sidewalk" : "sidewalk-connector",
        "bridge",
        ROAD_GRAPH_SPEED_LIMITS.sidewalk,
      );
      previousId = node.id;
    }
    bridgeEndSidewalkIds.push(previousId);
  }
  addBidirectionalEdge(
    builder,
    bridgeEndSidewalkIds[0] as string,
    bridgeEndSidewalkIds[1] as string,
    "crosswalk",
    "bridge",
    ROAD_GRAPH_SPEED_LIMITS.crosswalk,
  );

  return assertValidRoadGraph(builder.finish(roadLines, bridgeCenterZs));
}

function reachableNodeIds(
  graph: RoadGraph,
  mode: RoadTravelMode,
  reverse: boolean,
) {
  const modeNodes = [...graph.nodes.values()].filter(
    (node) => node.mode === mode,
  );
  const first = modeNodes[0];
  if (!first) return new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const node of modeNodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    if (edge.mode !== mode) continue;
    const from = reverse ? edge.to : edge.from;
    const to = reverse ? edge.from : edge.to;
    adjacency.get(from)?.push(to);
  }
  const visited = new Set([first.id]);
  const queue = [first.id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

export function validateRoadGraph(graph: RoadGraph): RoadGraphValidation {
  const errors: string[] = [];
  const edgeById = new Map<string, RoadGraphEdge>();
  const adjacencyCount = new Map<string, number>();

  for (const [key, node] of graph.nodes) {
    if (key !== node.id)
      errors.push(`Node map key ${key} does not match ${node.id}`);
    if (
      !Number.isFinite(node.x) ||
      !Number.isFinite(node.z) ||
      node.position.some((coordinate) => !Number.isFinite(coordinate))
    ) {
      errors.push(`Node ${node.id} has a non-finite position`);
    }
    if (node.position[0] !== node.x || node.position[2] !== node.z) {
      errors.push(`Node ${node.id} position fields disagree`);
    }
    if (!graph.outgoing.has(node.id))
      errors.push(`Node ${node.id} has no adjacency entry`);
  }

  for (const edge of graph.edges) {
    if (edgeById.has(edge.id)) errors.push(`Duplicate edge id ${edge.id}`);
    edgeById.set(edge.id, edge);
    const from = graph.nodes.get(edge.from);
    const to = graph.nodes.get(edge.to);
    if (!from || !to) {
      errors.push(`Edge ${edge.id} references a missing node`);
      continue;
    }
    if (from.mode !== edge.mode || to.mode !== edge.mode) {
      errors.push(`Edge ${edge.id} mixes travel modes`);
    }
    if (
      !Number.isFinite(edge.length) ||
      edge.length <= 0 ||
      !Number.isFinite(edge.speedLimit) ||
      edge.speedLimit <= 0 ||
      !Number.isFinite(edge.travelTime) ||
      edge.travelTime <= 0
    ) {
      errors.push(`Edge ${edge.id} has invalid traversal metrics`);
    } else if (
      Math.abs(edge.travelTime - edge.length / edge.speedLimit) > EPSILON
    ) {
      errors.push(`Edge ${edge.id} has inconsistent travel time`);
    }
    if (edge.kind === "lane") {
      if (
        from.kind !== "lane" ||
        to.kind !== "lane" ||
        from.phase !== "outgoing" ||
        to.phase !== "incoming" ||
        from.direction !== to.direction
      ) {
        errors.push(`Lane edge ${edge.id} is not outgoing-to-incoming`);
      }
    } else if (
      edge.kind === "intersection-straight" ||
      edge.kind === "turn-left" ||
      edge.kind === "turn-right" ||
      edge.kind === "turnaround"
    ) {
      if (
        from.kind !== "lane" ||
        to.kind !== "lane" ||
        from.phase !== "incoming" ||
        to.phase !== "outgoing" ||
        from.junctionId !== to.junctionId ||
        movementKind(
          from.direction,
          to.direction,
          edge.kind === "turnaround" ? "bridge-end" : "intersection",
        ) !== edge.kind
      ) {
        errors.push(
          `Intersection edge ${edge.id} has invalid turn connectivity`,
        );
      }
    } else if (from.kind !== "sidewalk" || to.kind !== "sidewalk") {
      errors.push(`Pedestrian edge ${edge.id} is not between sidewalk nodes`);
    }
  }

  for (const [nodeId, outgoing] of graph.outgoing) {
    if (!graph.nodes.has(nodeId))
      errors.push(`Adjacency references missing node ${nodeId}`);
    for (const edge of outgoing) {
      if (edge.from !== nodeId)
        errors.push(`Edge ${edge.id} is indexed under ${nodeId}`);
      if (!edgeById.has(edge.id))
        errors.push(`Adjacency contains unknown edge ${edge.id}`);
      adjacencyCount.set(edge.id, (adjacencyCount.get(edge.id) ?? 0) + 1);
    }
  }
  for (const edge of graph.edges) {
    if (adjacencyCount.get(edge.id) !== 1) {
      errors.push(`Edge ${edge.id} must appear once in outgoing adjacency`);
    }
  }

  const junctionIds = new Set<string>();
  for (const junction of graph.junctions) {
    if (junctionIds.has(junction.id))
      errors.push(`Duplicate junction ${junction.id}`);
    junctionIds.add(junction.id);
    for (const nodeId of junction.nodeIds) {
      const node = graph.nodes.get(nodeId);
      if (!node || node.junctionId !== junction.id) {
        errors.push(
          `Junction ${junction.id} references invalid node ${nodeId}`,
        );
      }
    }
  }
  for (const node of graph.nodes.values()) {
    if (!junctionIds.has(node.junctionId)) {
      errors.push(
        `Node ${node.id} references missing junction ${node.junctionId}`,
      );
    }
  }

  for (const mode of ["vehicle", "pedestrian"] as const) {
    const count = [...graph.nodes.values()].filter(
      (node) => node.mode === mode,
    ).length;
    if (reachableNodeIds(graph, mode, false).size !== count) {
      errors.push(`${mode} graph is not fully reachable`);
    }
    if (reachableNodeIds(graph, mode, true).size !== count) {
      errors.push(`${mode} graph cannot route back to every node`);
    }
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.length,
  });
}

function assertValidRoadGraph<T extends RoadGraph>(graph: T): T {
  const validation = validateRoadGraph(graph);
  if (!validation.valid) {
    throw new Error(`Invalid road graph:\n${validation.errors.join("\n")}`);
  }
  return graph;
}

function positionXZ(position: RoadGraphPosition) {
  const x = isPositionTuple(position) ? position[0] : position.x;
  const z = isPositionTuple(position)
    ? position.length === 3
      ? position[2]
      : position[1]
    : position.z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new RangeError(
      "Road graph position must contain finite x and z coordinates",
    );
  }
  return [x, z] as const;
}

function findNearestNode(
  graph: RoadGraph,
  position: RoadGraphPosition,
  options: NearestNodeOptions = {},
): RoadGraphNode | null {
  const [x, z] = positionXZ(position);
  const maxDistance = options.maxDistance ?? Number.POSITIVE_INFINITY;
  if (Number.isNaN(maxDistance) || maxDistance < 0) {
    throw new RangeError("maxDistance must be non-negative");
  }
  const maxDistanceSquared = maxDistance * maxDistance;
  let nearest: RoadGraphNode | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const node of graph.nodes.values()) {
    if (options.mode && node.mode !== options.mode) continue;
    if (options.kind && node.kind !== options.kind) continue;
    if (
      options.direction &&
      (node.kind !== "lane" || node.direction !== options.direction)
    ) {
      continue;
    }
    if (
      options.phase &&
      (node.kind !== "lane" || node.phase !== options.phase)
    ) {
      continue;
    }
    if (options.predicate && !options.predicate(node)) continue;
    const distanceSquared = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (distanceSquared > maxDistanceSquared + EPSILON) continue;
    if (
      distanceSquared < nearestDistanceSquared - EPSILON ||
      (Math.abs(distanceSquared - nearestDistanceSquared) <= EPSILON &&
        (!nearest || node.id.localeCompare(nearest.id) < 0))
    ) {
      nearest = node;
      nearestDistanceSquared = distanceSquared;
    }
  }
  return nearest;
}

export function findNearestRoadNode(
  graph: RoadGraph,
  position: RoadGraphPosition,
  options: Omit<NearestNodeOptions, "mode" | "kind"> = {},
) {
  return findNearestNode(graph, position, {
    ...options,
    mode: "vehicle",
    kind: "lane",
  }) as VehicleRoadNode | null;
}

export function findNearestSidewalkNode(
  graph: RoadGraph,
  position: RoadGraphPosition,
  options: Omit<
    NearestNodeOptions,
    "mode" | "kind" | "direction" | "phase"
  > = {},
) {
  return findNearestNode(graph, position, {
    ...options,
    mode: "pedestrian",
    kind: "sidewalk",
  }) as SidewalkRoadNode | null;
}

export function getOutgoingEdges(graph: RoadGraph, node: RoadNodeReference) {
  return graph.outgoing.get(nodeId(node)) ?? [];
}

export type RoadNodeReference = string | RoadGraphNode;

function nodeId(reference: RoadNodeReference) {
  return typeof reference === "string" ? reference : reference.id;
}

function routeRank(seed: RngSeed, key: string) {
  return deriveSeed(seed, `road-route:${key}`);
}

function edgeCost(edge: RoadGraphEdge, cost: RouteCost) {
  return cost === "distance" ? edge.length : edge.travelTime;
}

function routeHeuristic(
  node: RoadGraphNode,
  goal: RoadGraphNode,
  cost: RouteCost,
  maxSpeed: number,
) {
  const distance = Math.hypot(node.x - goal.x, node.z - goal.z);
  return cost === "distance" ? distance : distance / maxSpeed;
}

interface OpenRouteNode {
  readonly id: string;
  readonly g: number;
  readonly h: number;
  readonly f: number;
  readonly tie: number;
}

function compareOpenNodes(first: OpenRouteNode, second: OpenRouteNode) {
  if (Math.abs(first.f - second.f) > EPSILON) return first.f - second.f;
  if (Math.abs(first.h - second.h) > EPSILON) return first.h - second.h;
  if (first.tie !== second.tie) return first.tie - second.tie;
  return first.id.localeCompare(second.id);
}

function reconstructRoute(
  graph: RoadGraph,
  startId: string,
  goalId: string,
  cameFrom: ReadonlyMap<string, RoadGraphEdge>,
  costKind: RouteCost,
  visitedCount: number,
) {
  const reversedEdges: RoadGraphEdge[] = [];
  let current = goalId;
  while (current !== startId) {
    const edge = cameFrom.get(current);
    if (!edge) return null;
    reversedEdges.push(edge);
    current = edge.from;
  }
  const edges = reversedEdges.reverse();
  const nodeIds = [startId, ...edges.map((edge) => edge.to)];
  const nodes = nodeIds.map((id) => graph.nodes.get(id) as RoadGraphNode);
  const distance = edges.reduce((total, edge) => total + edge.length, 0);
  const duration = edges.reduce((total, edge) => total + edge.travelTime, 0);
  return Object.freeze({
    nodeIds: Object.freeze(nodeIds),
    edgeIds: Object.freeze(edges.map((edge) => edge.id)),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    distance,
    duration,
    cost: costKind === "distance" ? distance : duration,
    visitedCount,
  });
}

export function findRoute(
  graph: RoadGraph,
  start: RoadNodeReference,
  goal: RoadNodeReference,
  options: RouteSearchOptions = {},
): RoadRoute | null {
  const startId = nodeId(start);
  const goalId = nodeId(goal);
  const startNode = graph.nodes.get(startId);
  const goalNode = graph.nodes.get(goalId);
  if (!startNode || !goalNode || startNode.mode !== goalNode.mode) return null;
  if (options.mode && options.mode !== startNode.mode) return null;
  const maxVisited =
    options.maxVisited ?? options.maxIterations ?? DEFAULT_MAX_ROUTE_VISITS;
  if (!Number.isSafeInteger(maxVisited) || maxVisited <= 0) {
    throw new RangeError("maxVisited must be a positive safe integer");
  }
  const costKind = options.cost ?? "time";
  const seed = options.seed ?? 0;
  const maxSpeed = Math.max(
    ...graph.edges
      .filter((edge) => edge.mode === startNode.mode)
      .map((edge) => edge.speedLimit),
  );
  const initialH = routeHeuristic(startNode, goalNode, costKind, maxSpeed);
  const open: OpenRouteNode[] = [
    {
      id: startId,
      g: 0,
      h: initialH,
      f: initialH,
      tie: routeRank(seed, startId),
    },
  ];
  const gScore = new Map<string, number>([[startId, 0]]);
  const cameFrom = new Map<string, RoadGraphEdge>();
  const closed = new Set<string>();

  while (open.length > 0) {
    open.sort(compareOpenNodes);
    const currentEntry = open.shift() as OpenRouteNode;
    if (closed.has(currentEntry.id)) continue;
    if (
      currentEntry.g >
      (gScore.get(currentEntry.id) ?? Number.POSITIVE_INFINITY) + EPSILON
    ) {
      continue;
    }
    if (closed.size >= maxVisited) return null;
    closed.add(currentEntry.id);
    if (currentEntry.id === goalId) {
      return reconstructRoute(
        graph,
        startId,
        goalId,
        cameFrom,
        costKind,
        closed.size,
      );
    }

    const outgoing = [...(graph.outgoing.get(currentEntry.id) ?? [])].sort(
      (first, second) =>
        routeRank(seed, first.id) - routeRank(seed, second.id) ||
        first.id.localeCompare(second.id),
    );
    for (const edge of outgoing) {
      if (edge.mode !== startNode.mode || closed.has(edge.to)) continue;
      const tentativeG = currentEntry.g + edgeCost(edge, costKind);
      const existingG = gScore.get(edge.to) ?? Number.POSITIVE_INFINITY;
      const existingEdge = cameFrom.get(edge.to);
      const winsSeededTie =
        Math.abs(tentativeG - existingG) <= EPSILON &&
        (!existingEdge ||
          routeRank(seed, edge.id) < routeRank(seed, existingEdge.id));
      if (tentativeG > existingG - EPSILON && !winsSeededTie) continue;
      gScore.set(edge.to, tentativeG);
      cameFrom.set(edge.to, edge);
      const next = graph.nodes.get(edge.to) as RoadGraphNode;
      const h = routeHeuristic(next, goalNode, costKind, maxSpeed);
      open.push({
        id: edge.to,
        g: tentativeG,
        h,
        f: tentativeG + h,
        tie: routeRank(seed, edge.to),
      });
    }
  }
  return null;
}

export function findSeededRoute(
  graph: RoadGraph,
  start: RoadNodeReference,
  goal: RoadNodeReference,
  seed: RngSeed,
  options: Omit<RouteSearchOptions, "seed"> = {},
) {
  return findRoute(graph, start, goal, { ...options, seed });
}

export function findRouteBetween(
  graph: RoadGraph,
  start: RoadGraphPosition,
  goal: RoadGraphPosition,
  options: RouteBetweenOptions,
) {
  const { maxSnapDistance, ...routeOptions } = options;
  const nearestOptions: NearestNodeOptions = {
    mode: options.mode,
    maxDistance: maxSnapDistance,
  };
  const startNode = findNearestNode(graph, start, nearestOptions);
  const goalNode = findNearestNode(graph, goal, nearestOptions);
  if (!startNode || !goalNode) return null;
  return findRoute(graph, startNode, goalNode, routeOptions);
}

export const BAY_CITY_ROAD_GRAPH = createRoadGraph();
