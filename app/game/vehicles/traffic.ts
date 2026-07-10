import type {
  EntityId,
  Tick,
  Vec3,
  VehicleKind,
  VehicleState,
} from "../core/contracts";
import {
  SeededRng,
  deriveSeed,
  normalizeSeed,
  type RngSeed,
} from "../core/rng";
import {
  findRoute,
  type RoadGraph,
  type RoadGraphEdge,
  type RoadRoute,
  type VehicleRoadNode,
} from "../world/road-graph";
import {
  advanceTrafficRoute,
  createTrafficRouteProgress,
  currentTrafficRouteEdge,
  sampleTrafficRoute,
  type TrafficRouteProgress,
} from "./route-progress";

export type TrafficPopulationClass = "desktop" | "mobile";
export type LaneFollowingVehicleKind = Exclude<VehicleKind, "hero">;

export interface TrafficPopulationBudget {
  readonly maxVehicles: number;
  readonly spawnPerCycle: number;
  readonly spawnIntervalTicks: number;
}

export const TRAFFIC_POPULATION_BUDGETS: Readonly<
  Record<TrafficPopulationClass, TrafficPopulationBudget>
> = Object.freeze({
  desktop: Object.freeze({
    maxVehicles: 28,
    spawnPerCycle: 2,
    spawnIntervalTicks: 12,
  }),
  mobile: Object.freeze({
    maxVehicles: 12,
    spawnPerCycle: 1,
    spawnIntervalTicks: 24,
  }),
});

export interface TrafficConfig {
  readonly acceleration: number;
  readonly braking: number;
  readonly minimumLeadGap: number;
  readonly timeHeadway: number;
  readonly vehicleLength: number;
  readonly reservationLookahead: number;
  readonly stopLineBuffer: number;
  readonly reservationTtlTicks: number;
  readonly stuckSpeedThreshold: number;
  readonly stuckDistanceEpsilon: number;
  readonly stuckTicksBeforeRecovery: number;
  readonly minimumSpawnDistance: number;
  readonly maximumSpawnDistance: number;
  readonly despawnDistance: number;
  readonly spawnSeparation: number;
  readonly minimumRouteDistance: number;
  readonly minimumCruiseSpeedFactor: number;
  readonly maximumCruiseSpeedFactor: number;
  readonly rideHeight: number;
  readonly maximumSpawnRouteAttempts: number;
}

export const DEFAULT_TRAFFIC_CONFIG: TrafficConfig = Object.freeze({
  acceleration: 3.8,
  braking: 8,
  minimumLeadGap: 3.5,
  timeHeadway: 1.2,
  vehicleLength: 4.4,
  reservationLookahead: 10,
  stopLineBuffer: 1.25,
  reservationTtlTicks: 180,
  stuckSpeedThreshold: 0.2,
  stuckDistanceEpsilon: 0.01,
  stuckTicksBeforeRecovery: 360,
  minimumSpawnDistance: 42,
  maximumSpawnDistance: 132,
  despawnDistance: 165,
  spawnSeparation: 9,
  minimumRouteDistance: 56,
  minimumCruiseSpeedFactor: 0.78,
  maximumCruiseSpeedFactor: 0.96,
  rideHeight: 1.35,
  maximumSpawnRouteAttempts: 12,
});

export interface TrafficAgentState {
  readonly vehicle: VehicleState;
  readonly route: TrafficRouteProgress;
  readonly cruiseSpeedFactor: number;
  readonly speed: number;
  readonly stuckTicks: number;
  readonly recoveryCount: number;
  readonly spawnedAtTick: Tick;
}

export interface IntersectionReservation {
  readonly intersectionId: string;
  readonly vehicleId: EntityId;
  readonly grantedAtTick: Tick;
  readonly expiresAtTick: Tick;
}

export interface TrafficPopulationState {
  readonly seed: number;
  readonly nextVehicleId: EntityId;
  readonly spawnSerial: number;
  readonly agents: ReadonlyMap<EntityId, TrafficAgentState>;
  readonly reservations: ReadonlyMap<string, IntersectionReservation>;
}

export interface CreateTrafficPopulationOptions {
  readonly firstVehicleId?: EntityId;
  readonly agents?: Iterable<readonly [EntityId, TrafficAgentState]>;
  readonly reservations?: Iterable<readonly [string, IntersectionReservation]>;
}

export interface CreateTrafficAgentOptions {
  readonly id: EntityId;
  readonly routeId: string;
  readonly route: RoadRoute;
  readonly spawnedAtTick: Tick;
  readonly kind?: LaneFollowingVehicleKind;
  readonly health?: number;
  readonly cruiseSpeedFactor?: number;
  readonly rideHeight?: number;
}

export interface TrafficStepContext {
  readonly tick: Tick;
  readonly dt: number;
  readonly playerPosition: Vec3;
  readonly populationClass: TrafficPopulationClass;
}

export interface TrafficStepOptions {
  readonly config?: Partial<TrafficConfig>;
  readonly budget?: Partial<TrafficPopulationBudget>;
}

export interface TrafficStepResult {
  readonly state: TrafficPopulationState;
  readonly spawnedIds: readonly EntityId[];
  readonly despawnedIds: readonly EntityId[];
  readonly recoveredIds: readonly EntityId[];
}

interface IntersectionNeed {
  readonly intersectionId: string;
  readonly distanceToEntry: number;
}

interface LeadVehicle {
  readonly agent: TrafficAgentState;
  readonly bumperGap: number;
}

const ROAD_EDGE_CACHE = new WeakMap<
  RoadGraph,
  ReadonlyMap<string, RoadGraphEdge>
>();
const DISTANCE_EPSILON = 1e-9;

function edgeMap(graph: RoadGraph) {
  const cached = ROAD_EDGE_CACHE.get(graph);
  if (cached) return cached;
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge] as const));
  ROAD_EDGE_CACHE.set(graph, edges);
  return edges;
}

function routeEdge(
  graph: RoadGraph,
  agent: TrafficAgentState,
  relativeIndex = 0,
) {
  const edgeId = agent.route.edgeIds[agent.route.edgeIndex + relativeIndex];
  if (!edgeId) return null;
  return edgeMap(graph).get(edgeId) ?? null;
}

function distanceXZ(first: Vec3, second: Vec3) {
  return Math.hypot(first[0] - second[0], first[2] - second[2]);
}

function moveToward(current: number, target: number, maximumDelta: number) {
  if (current < target) return Math.min(current + maximumDelta, target);
  if (current > target) return Math.max(current - maximumDelta, target);
  return target;
}

function positiveInteger(name: string, value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function resolveConfig(overrides: Partial<TrafficConfig> | undefined) {
  return { ...DEFAULT_TRAFFIC_CONFIG, ...overrides };
}

export function trafficPopulationBudget(
  populationClass: TrafficPopulationClass,
  overrides?: Partial<TrafficPopulationBudget>,
): TrafficPopulationBudget {
  const budget = {
    ...TRAFFIC_POPULATION_BUDGETS[populationClass],
    ...overrides,
  };
  positiveInteger("maxVehicles", budget.maxVehicles);
  positiveInteger("spawnPerCycle", budget.spawnPerCycle);
  positiveInteger("spawnIntervalTicks", budget.spawnIntervalTicks);
  return budget;
}

export function createTrafficPopulation(
  seed: RngSeed,
  options: CreateTrafficPopulationOptions = {},
): TrafficPopulationState {
  const agents = new Map(options.agents);
  const highestAgentId = Math.max(-1, ...agents.keys());
  const nextVehicleId =
    options.firstVehicleId ?? Math.max(1_000, highestAgentId + 1);
  if (!Number.isSafeInteger(nextVehicleId) || nextVehicleId < 0) {
    throw new RangeError("firstVehicleId must be a non-negative safe integer");
  }
  if (nextVehicleId <= highestAgentId) {
    throw new RangeError("firstVehicleId must exceed existing traffic ids");
  }
  return {
    seed: normalizeSeed(seed),
    nextVehicleId,
    spawnSerial: 0,
    agents,
    reservations: new Map(options.reservations),
  };
}

export function createTrafficAgent(
  graph: RoadGraph,
  options: CreateTrafficAgentOptions,
): TrafficAgentState {
  const cruiseSpeedFactor = options.cruiseSpeedFactor ?? 0.88;
  if (!Number.isFinite(cruiseSpeedFactor) || cruiseSpeedFactor <= 0) {
    throw new RangeError("cruiseSpeedFactor must be positive and finite");
  }
  const rideHeight = options.rideHeight ?? DEFAULT_TRAFFIC_CONFIG.rideHeight;
  if (!Number.isFinite(rideHeight)) {
    throw new RangeError("rideHeight must be finite");
  }
  const route = createTrafficRouteProgress(options.routeId, options.route);
  const sample = sampleTrafficRoute(graph, route);
  const vehicle: VehicleState = {
    id: options.id,
    kind: options.kind ?? "traffic",
    pose: {
      position: [
        sample.pose.position[0],
        sample.pose.position[1] + rideHeight,
        sample.pose.position[2],
      ],
      rotationY: sample.pose.rotationY,
    },
    velocity: [0, 0, 0],
    health: options.health ?? 100,
    life: "active",
    routeId: options.routeId,
  };

  return {
    vehicle,
    route,
    cruiseSpeedFactor,
    speed: 0,
    stuckTicks: 0,
    recoveryCount: 0,
    spawnedAtTick: options.spawnedAtTick,
  };
}

function intersectionForEdge(graph: RoadGraph, edge: RoadGraphEdge) {
  const from = graph.nodes.get(edge.from);
  return from?.intersectionId;
}

function intersectionNeed(
  graph: RoadGraph,
  agent: TrafficAgentState,
  config: TrafficConfig,
): IntersectionNeed | null {
  const currentEdge = routeEdge(graph, agent);
  if (!currentEdge) return null;

  if (currentEdge.kind !== "lane") {
    const intersectionId = intersectionForEdge(graph, currentEdge);
    return intersectionId ? { intersectionId, distanceToEntry: 0 } : null;
  }

  const nextEdge = routeEdge(graph, agent, 1);
  if (!nextEdge || nextEdge.kind === "lane") return null;
  const distanceToEntry = Math.max(
    0,
    currentEdge.length - agent.route.distanceOnEdge,
  );
  if (distanceToEntry > config.reservationLookahead) return null;
  const intersectionId = intersectionForEdge(graph, nextEdge);
  return intersectionId ? { intersectionId, distanceToEntry } : null;
}

export function resolveIntersectionReservations(
  graph: RoadGraph,
  agents: ReadonlyMap<EntityId, TrafficAgentState>,
  previous: ReadonlyMap<string, IntersectionReservation>,
  tick: Tick,
  config: TrafficConfig = DEFAULT_TRAFFIC_CONFIG,
) {
  const reservations = new Map<string, IntersectionReservation>();
  const needs = new Map<EntityId, IntersectionNeed>();

  for (const [id, agent] of agents) {
    if (agent.vehicle.life !== "active") continue;
    const need = intersectionNeed(graph, agent, config);
    if (need) needs.set(id, need);
  }

  for (const [intersectionId, reservation] of previous) {
    const need = needs.get(reservation.vehicleId);
    if (
      reservation.expiresAtTick >= tick &&
      need?.intersectionId === intersectionId
    ) {
      reservations.set(intersectionId, reservation);
    }
  }

  const requests = [...needs]
    .filter(([, need]) => !reservations.has(need.intersectionId))
    .sort(
      ([firstId, first], [secondId, second]) =>
        first.distanceToEntry - second.distanceToEntry || firstId - secondId,
    );
  for (const [vehicleId, need] of requests) {
    if (reservations.has(need.intersectionId)) continue;
    reservations.set(need.intersectionId, {
      intersectionId: need.intersectionId,
      vehicleId,
      grantedAtTick: tick,
      expiresAtTick: tick + config.reservationTtlTicks,
    });
  }

  return reservations as ReadonlyMap<string, IntersectionReservation>;
}

function findLeadVehicle(
  graph: RoadGraph,
  agent: TrafficAgentState,
  agents: ReadonlyMap<EntityId, TrafficAgentState>,
  config: TrafficConfig,
): LeadVehicle | null {
  const currentEdge = routeEdge(graph, agent);
  if (!currentEdge) return null;
  const nextEdge = routeEdge(graph, agent, 1);
  let nearest: LeadVehicle | null = null;

  for (const candidate of agents.values()) {
    if (
      candidate.vehicle.id === agent.vehicle.id ||
      candidate.vehicle.life !== "active" ||
      candidate.route.completed
    ) {
      continue;
    }
    const candidateEdge = routeEdge(graph, candidate);
    let centerGap: number | null = null;
    const sameEdgeDistance =
      candidate.route.distanceOnEdge - agent.route.distanceOnEdge;
    if (
      candidateEdge?.id === currentEdge.id &&
      (sameEdgeDistance > DISTANCE_EPSILON ||
        (Math.abs(sameEdgeDistance) <= DISTANCE_EPSILON &&
          candidate.vehicle.id < agent.vehicle.id))
    ) {
      centerGap = Math.max(0, sameEdgeDistance);
    } else if (nextEdge && candidateEdge?.id === nextEdge.id) {
      centerGap =
        currentEdge.length -
        agent.route.distanceOnEdge +
        candidate.route.distanceOnEdge;
    }
    if (centerGap === null) continue;
    const bumperGap = centerGap - config.vehicleLength;
    if (!nearest || bumperGap < nearest.bumperGap) {
      nearest = { agent: candidate, bumperGap };
    }
  }
  return nearest;
}

function reservationTravelCap(
  graph: RoadGraph,
  agent: TrafficAgentState,
  reservations: ReadonlyMap<string, IntersectionReservation>,
  config: TrafficConfig,
) {
  const need = intersectionNeed(graph, agent, config);
  if (!need) return Number.POSITIVE_INFINITY;
  if (reservations.get(need.intersectionId)?.vehicleId === agent.vehicle.id) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, need.distanceToEntry - config.stopLineBuffer);
}

function vehicleAtRouteSample(
  graph: RoadGraph,
  agent: TrafficAgentState,
  route: TrafficRouteProgress,
  speed: number,
): VehicleState {
  const sample = sampleTrafficRoute(graph, route);
  const rotationY = sample.pose.rotationY;
  const rawVelocityX = -Math.sin(rotationY) * speed;
  const rawVelocityZ = -Math.cos(rotationY) * speed;
  const velocityX = Object.is(rawVelocityX, -0) ? 0 : rawVelocityX;
  const velocityZ = Object.is(rawVelocityZ, -0) ? 0 : rawVelocityZ;
  return {
    ...agent.vehicle,
    pose: {
      position: [
        sample.pose.position[0],
        agent.vehicle.pose.position[1],
        sample.pose.position[2],
      ],
      rotationY,
    },
    velocity: [velocityX, agent.vehicle.velocity[1], velocityZ],
  };
}

export function recoverStuckTrafficAgent(
  graph: RoadGraph,
  agent: TrafficAgentState,
  seed: RngSeed,
): TrafficAgentState {
  if (agent.route.completed) return agent;
  const currentEdge = currentTrafficRouteEdge(graph, agent.route);
  const destinationNodeId = agent.route.nodeIds.at(-1);
  if (!currentEdge || !destinationNodeId) return agent;

  const reroute = findRoute(graph, currentEdge.to, destinationNodeId, {
    mode: "vehicle",
    seed: deriveSeed(
      seed,
      `traffic-recovery:${agent.vehicle.id}:${agent.recoveryCount + 1}`,
    ),
  });
  if (!reroute) {
    return {
      ...agent,
      vehicle: {
        ...agent.vehicle,
        velocity: [0, agent.vehicle.velocity[1], 0],
      },
      route: { ...agent.route, completed: true },
      speed: 0,
      stuckTicks: 0,
      recoveryCount: agent.recoveryCount + 1,
    };
  }

  const route = createTrafficRouteProgress(agent.route.routeId, reroute);
  const recovered = {
    ...agent,
    route,
    speed: 0,
    stuckTicks: 0,
    recoveryCount: agent.recoveryCount + 1,
  };
  return {
    ...recovered,
    vehicle: vehicleAtRouteSample(graph, recovered, route, 0),
  };
}

export interface StepTrafficAgentResult {
  readonly agent: TrafficAgentState;
  readonly recovered: boolean;
}

export function stepTrafficAgent(
  graph: RoadGraph,
  agent: TrafficAgentState,
  agents: ReadonlyMap<EntityId, TrafficAgentState>,
  reservations: ReadonlyMap<string, IntersectionReservation>,
  dt: number,
  seed: RngSeed,
  config: TrafficConfig = DEFAULT_TRAFFIC_CONFIG,
): StepTrafficAgentResult {
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new RangeError("Traffic dt must be a positive finite number");
  }
  if (agent.vehicle.life !== "active" || agent.route.completed) {
    return {
      agent: {
        ...agent,
        vehicle: {
          ...agent.vehicle,
          velocity: [0, agent.vehicle.velocity[1], 0],
        },
        speed: 0,
      },
      recovered: false,
    };
  }

  const edge = currentTrafficRouteEdge(graph, agent.route);
  if (!edge) return { agent, recovered: false };
  const freeFlowSpeed = edge.speedLimit * agent.cruiseSpeedFactor;
  const lead = findLeadVehicle(graph, agent, agents, config);
  let targetSpeed = freeFlowSpeed;
  let leadTravelCap = Number.POSITIVE_INFINITY;
  if (lead) {
    const desiredGap = config.minimumLeadGap + agent.speed * config.timeHeadway;
    if (lead.bumperGap <= config.minimumLeadGap) {
      targetSpeed = 0;
    } else if (lead.bumperGap < desiredGap) {
      const availableGap = lead.bumperGap - config.minimumLeadGap;
      const gapRange = Math.max(
        Number.EPSILON,
        desiredGap - config.minimumLeadGap,
      );
      targetSpeed = Math.min(
        targetSpeed,
        lead.agent.speed,
        freeFlowSpeed * (availableGap / gapRange),
      );
    }
    leadTravelCap = Math.max(0, lead.bumperGap - config.minimumLeadGap);
  }

  const intersectionTravelCap = reservationTravelCap(
    graph,
    agent,
    reservations,
    config,
  );
  if (Number.isFinite(intersectionTravelCap)) {
    targetSpeed = Math.min(
      targetSpeed,
      Math.sqrt(2 * config.braking * intersectionTravelCap),
    );
  }
  const rate =
    targetSpeed >= agent.speed ? config.acceleration : config.braking;
  const requestedSpeed = moveToward(agent.speed, targetSpeed, rate * dt);
  const requestedDistance = requestedSpeed * dt;
  const distance = Math.max(
    0,
    Math.min(requestedDistance, leadTravelCap, intersectionTravelCap),
  );
  const route = advanceTrafficRoute(graph, agent.route, distance);
  const speed = route.completed ? 0 : Math.min(requestedSpeed, distance / dt);
  const stuckTicks =
    !route.completed &&
    distance <= config.stuckDistanceEpsilon &&
    speed <= config.stuckSpeedThreshold
      ? agent.stuckTicks + 1
      : 0;
  const stepped: TrafficAgentState = {
    ...agent,
    vehicle: vehicleAtRouteSample(graph, agent, route, speed),
    route,
    speed,
    stuckTicks,
  };
  if (stuckTicks < config.stuckTicksBeforeRecovery) {
    return { agent: stepped, recovered: false };
  }

  return {
    agent: recoverStuckTrafficAgent(graph, stepped, seed),
    recovered: true,
  };
}

function eligibleSpawnNodes(
  graph: RoadGraph,
  playerPosition: Vec3,
  agents: ReadonlyMap<EntityId, TrafficAgentState>,
  config: TrafficConfig,
) {
  return [...graph.nodes.values()]
    .filter((node): node is VehicleRoadNode => {
      if (node.kind !== "lane" || node.phase !== "outgoing") return false;
      const playerDistance = Math.hypot(
        node.x - playerPosition[0],
        node.z - playerPosition[2],
      );
      if (
        playerDistance < config.minimumSpawnDistance ||
        playerDistance > config.maximumSpawnDistance
      ) {
        return false;
      }
      return [...agents.values()].every(
        (agent) =>
          Math.hypot(
            node.x - agent.vehicle.pose.position[0],
            node.z - agent.vehicle.pose.position[2],
          ) >= config.spawnSeparation,
      );
    })
    .sort((first, second) => first.id.localeCompare(second.id));
}

function destinationNodes(
  graph: RoadGraph,
  start: VehicleRoadNode,
  config: TrafficConfig,
) {
  return [...graph.nodes.values()]
    .filter(
      (node): node is VehicleRoadNode =>
        node.kind === "lane" &&
        node.phase === "incoming" &&
        Math.hypot(node.x - start.x, node.z - start.z) >=
          config.minimumRouteDistance,
    )
    .sort((first, second) => first.id.localeCompare(second.id));
}

interface SpawnAttempt {
  readonly agent: TrafficAgentState | null;
  readonly nextVehicleId: EntityId;
  readonly spawnSerial: number;
}

function spawnTrafficAgent(
  graph: RoadGraph,
  state: TrafficPopulationState,
  agents: ReadonlyMap<EntityId, TrafficAgentState>,
  context: TrafficStepContext,
  config: TrafficConfig,
  nextVehicleId: EntityId,
  spawnSerial: number,
): SpawnAttempt {
  const serial = spawnSerial;
  const rng = new SeededRng(deriveSeed(state.seed, `traffic-spawn:${serial}`));
  const starts = eligibleSpawnNodes(
    graph,
    context.playerPosition,
    agents,
    config,
  );
  if (starts.length === 0) {
    return { agent: null, nextVehicleId, spawnSerial: serial + 1 };
  }
  const start = rng.pick(starts);
  const destinations = destinationNodes(graph, start, config);
  if (destinations.length === 0) {
    return { agent: null, nextVehicleId, spawnSerial: serial + 1 };
  }

  let route: RoadRoute | null = null;
  for (
    let attempt = 0;
    attempt < config.maximumSpawnRouteAttempts;
    attempt += 1
  ) {
    const destination = rng.pick(destinations);
    const candidate = findRoute(graph, start, destination, {
      mode: "vehicle",
      seed: deriveSeed(state.seed, `traffic-route:${serial}:${attempt}`),
    });
    if (candidate && candidate.distance >= config.minimumRouteDistance) {
      route = candidate;
      break;
    }
  }
  if (!route) {
    return { agent: null, nextVehicleId, spawnSerial: serial + 1 };
  }

  const routeId = `traffic:${nextVehicleId}:${serial}`;
  const agent = createTrafficAgent(graph, {
    id: nextVehicleId,
    routeId,
    route,
    spawnedAtTick: context.tick,
    cruiseSpeedFactor: rng.range(
      config.minimumCruiseSpeedFactor,
      config.maximumCruiseSpeedFactor,
    ),
    rideHeight: config.rideHeight,
  });
  return {
    agent,
    nextVehicleId: nextVehicleId + 1,
    spawnSerial: serial + 1,
  };
}

function isAmbientDespawnCandidate(
  agent: TrafficAgentState,
  playerPosition: Vec3,
  config: TrafficConfig,
) {
  return (
    agent.route.completed ||
    distanceXZ(agent.vehicle.pose.position, playerPosition) >
      config.despawnDistance ||
    (agent.vehicle.kind === "traffic" && agent.vehicle.life !== "active")
  );
}

function filterReservations(
  graph: RoadGraph,
  reservations: ReadonlyMap<string, IntersectionReservation>,
  agents: ReadonlyMap<EntityId, TrafficAgentState>,
  tick: Tick,
  config: TrafficConfig,
) {
  const filtered = new Map<string, IntersectionReservation>();
  for (const [intersectionId, reservation] of reservations) {
    const agent = agents.get(reservation.vehicleId);
    const need = agent ? intersectionNeed(graph, agent, config) : null;
    if (
      reservation.expiresAtTick >= tick &&
      need?.intersectionId === intersectionId
    ) {
      filtered.set(intersectionId, reservation);
    }
  }
  return filtered;
}

export function stepTrafficPopulation(
  graph: RoadGraph,
  state: TrafficPopulationState,
  context: TrafficStepContext,
  options: TrafficStepOptions = {},
): TrafficStepResult {
  if (!Number.isSafeInteger(context.tick) || context.tick < 0) {
    throw new RangeError("Traffic tick must be a non-negative safe integer");
  }
  if (!Number.isFinite(context.dt) || context.dt <= 0) {
    throw new RangeError("Traffic dt must be a positive finite number");
  }
  if (
    context.playerPosition.some((coordinate) => !Number.isFinite(coordinate))
  ) {
    throw new RangeError("Player position must be finite");
  }

  const config = resolveConfig(options.config);
  const budget = trafficPopulationBudget(
    context.populationClass,
    options.budget,
  );
  const despawned = new Set<EntityId>();
  const eligibleAgents = [...state.agents.values()]
    .filter((agent) => {
      const remove = isAmbientDespawnCandidate(
        agent,
        context.playerPosition,
        config,
      );
      if (remove) despawned.add(agent.vehicle.id);
      return !remove;
    })
    .sort(
      (first, second) =>
        distanceXZ(first.vehicle.pose.position, context.playerPosition) -
          distanceXZ(second.vehicle.pose.position, context.playerPosition) ||
        first.vehicle.id - second.vehicle.id,
    );
  for (const overflow of eligibleAgents.slice(budget.maxVehicles)) {
    despawned.add(overflow.vehicle.id);
  }
  const activeAgents = new Map<EntityId, TrafficAgentState>(
    eligibleAgents
      .slice(0, budget.maxVehicles)
      .map((agent) => [agent.vehicle.id, agent] as const),
  );
  const reservations = resolveIntersectionReservations(
    graph,
    activeAgents,
    state.reservations,
    context.tick,
    config,
  );
  const steppedAgents = new Map<EntityId, TrafficAgentState>();
  const recoveredIds: EntityId[] = [];
  for (const [id, agent] of [...activeAgents].sort(
    ([firstId], [secondId]) => firstId - secondId,
  )) {
    const stepped = stepTrafficAgent(
      graph,
      agent,
      activeAgents,
      reservations,
      context.dt,
      state.seed,
      config,
    );
    if (stepped.recovered) recoveredIds.push(id);
    if (
      isAmbientDespawnCandidate(stepped.agent, context.playerPosition, config)
    ) {
      despawned.add(id);
    } else {
      steppedAgents.set(id, stepped.agent);
    }
  }

  const spawnedIds: EntityId[] = [];
  let nextVehicleId = state.nextVehicleId;
  let spawnSerial = state.spawnSerial;
  const spawnCycle = context.tick % budget.spawnIntervalTicks === 0;
  if (spawnCycle) {
    const spawnCount = Math.min(
      budget.spawnPerCycle,
      budget.maxVehicles - steppedAgents.size,
    );
    for (let index = 0; index < spawnCount; index += 1) {
      const attempt = spawnTrafficAgent(
        graph,
        state,
        steppedAgents,
        context,
        config,
        nextVehicleId,
        spawnSerial,
      );
      nextVehicleId = attempt.nextVehicleId;
      spawnSerial = attempt.spawnSerial;
      if (!attempt.agent) continue;
      steppedAgents.set(attempt.agent.vehicle.id, attempt.agent);
      spawnedIds.push(attempt.agent.vehicle.id);
    }
  }

  const nextReservations = filterReservations(
    graph,
    reservations,
    steppedAgents,
    context.tick,
    config,
  );
  return {
    state: {
      seed: state.seed,
      nextVehicleId,
      spawnSerial,
      agents: steppedAgents,
      reservations: nextReservations,
    },
    spawnedIds: Object.freeze(spawnedIds),
    despawnedIds: Object.freeze([...despawned].sort((a, b) => a - b)),
    recoveredIds: Object.freeze(recoveredIds),
  };
}

export function trafficVehicleStates(state: TrafficPopulationState) {
  return new Map(
    [...state.agents]
      .sort(([firstId], [secondId]) => firstId - secondId)
      .map(([id, agent]) => [id, agent.vehicle] as const),
  ) as ReadonlyMap<EntityId, VehicleState>;
}

export const stepTraffic = stepTrafficPopulation;
