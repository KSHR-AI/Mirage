import type {
  MirageInput,
  MirageMissionPhase,
  MirageRunState,
  MissionTarget,
  Point2,
  PursuerState,
  TrafficResult,
} from "./types";

const FIXED_STEP = 1 / 60;
const CRUISE_SPEED = 11;
const BOOST_SPEED = 18;
const BRAKE_SPEED = 6;
const LANE_LIMIT = 4;
const LANE_SPEED = 8.5;
const TARGET_TIME = 55;
const TRAFFIC_LONGITUDINAL_RADIUS = 2.4;
const TRAFFIC_COLLISION_LANE_RADIUS = 2;
const TRAFFIC_NEAR_MISS_LANE_RADIUS = 5;
const MAX_COLLISIONS = 3;

export const EMPTY_INPUT: MirageInput = Object.freeze({
  boost: false,
  brake: false,
  steer: 0,
});

export const ROUTE_POINTS: readonly Point2[] = Object.freeze([
  { x: -72, z: 104 },
  { x: -72, z: 72 },
  { x: -72, z: 36 },
  { x: -72, z: 0 },
  { x: 0, z: 0 },
  { x: 36, z: 0 },
  { x: 36, z: 36 },
  { x: 72, z: 36 },
  { x: 108, z: 36 },
]);

const ROUTE_CUMULATIVE = (() => {
  const values = [0];
  for (let index = 1; index < ROUTE_POINTS.length; index += 1) {
    const previous = ROUTE_POINTS[index - 1];
    const current = ROUTE_POINTS[index];
    values.push(
      values[index - 1] +
        Math.hypot(current.x - previous.x, current.z - previous.z),
    );
  }
  return Object.freeze(values);
})();

export const ROUTE_LENGTH = ROUTE_CUMULATIVE[ROUTE_CUMULATIVE.length - 1];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function moveToward(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function pointAtRouteDistance(routeDistance: number): Point2 {
  const travel = clamp(routeDistance, 0, ROUTE_LENGTH);
  for (let index = 1; index < ROUTE_POINTS.length; index += 1) {
    const segmentEnd = ROUTE_CUMULATIVE[index];
    if (travel > segmentEnd) continue;
    const start = ROUTE_POINTS[index - 1];
    const end = ROUTE_POINTS[index];
    const segmentStart = ROUTE_CUMULATIVE[index - 1];
    const segmentLength = segmentEnd - segmentStart;
    const progress =
      segmentLength === 0 ? 0 : (travel - segmentStart) / segmentLength;
    return {
      x: start.x + (end.x - start.x) * progress,
      z: start.z + (end.z - start.z) * progress,
    };
  }
  return ROUTE_POINTS[ROUTE_POINTS.length - 1];
}

export function getRoutePose(routeDistance: number, laneOffset = 0) {
  const center = pointAtRouteDistance(routeDistance);
  const before = pointAtRouteDistance(routeDistance - 2.5);
  const after = pointAtRouteDistance(routeDistance + 2.5);
  const yaw = Math.atan2(after.x - before.x, -(after.z - before.z));
  return {
    laneOffset,
    routeDistance: clamp(routeDistance, 0, ROUTE_LENGTH),
    x: center.x + Math.cos(yaw) * laneOffset,
    yaw,
    z: center.z + Math.sin(yaw) * laneOffset,
  };
}

function targetAtPoint(
  pointIndex: number,
  target: Omit<MissionTarget, "routeDistance" | "x" | "z">,
): MissionTarget {
  return Object.freeze({
    ...target,
    routeDistance: ROUTE_CUMULATIVE[pointIndex],
    x: ROUTE_POINTS[pointIndex].x,
    z: ROUTE_POINTS[pointIndex].z,
  });
}

export const MISSION_TARGETS: readonly MissionTarget[] = Object.freeze([
  targetAtPoint(1, {
    id: "pickup",
    label: "Collect the package",
    type: "pickup",
  }),
  targetAtPoint(3, {
    id: "gate-downtown",
    label: "Lose them through Downtown",
    type: "checkpoint",
  }),
  targetAtPoint(5, {
    id: "gate-market",
    label: "Cut across Market Street",
    type: "checkpoint",
  }),
  targetAtPoint(6, {
    id: "gate-waterfront",
    label: "Break for the waterfront",
    type: "checkpoint",
  }),
  targetAtPoint(8, {
    id: "pier-11",
    label: "Deliver to Pier 11",
    type: "finish",
  }),
]);

interface RouteItem {
  readonly laneOffset: number;
  readonly routeDistance: number;
}

const BOOST_PAD_DEFINITIONS: readonly RouteItem[] = Object.freeze([
  { laneOffset: 0, routeDistance: 58 },
  { laneOffset: -4, routeDistance: 140 },
  { laneOffset: 0, routeDistance: 186 },
  { laneOffset: -4, routeDistance: 280 },
]);

export const BOOST_PADS = Object.freeze(
  BOOST_PAD_DEFINITIONS.map((pad) =>
    getRoutePose(pad.routeDistance, pad.laneOffset),
  ),
);

export const RAMP_ROUTE_DISTANCE = ROUTE_CUMULATIVE[5] + 14;
export const RAMP_POSITION: Point2 = Object.freeze(
  getRoutePose(RAMP_ROUTE_DISTANCE),
);

const TRAFFIC_DEFINITIONS = Object.freeze([
  { laneOffset: -3, routeDistance: 48 },
  { laneOffset: 3, routeDistance: 68 },
  { laneOffset: 0, routeDistance: 82 },
  { laneOffset: -3, routeDistance: 110 },
  { laneOffset: 0, routeDistance: 110 },
  { laneOffset: 3, routeDistance: 132 },
  { laneOffset: 0, routeDistance: 154 },
  { laneOffset: 3, routeDistance: 154 },
  { laneOffset: -3, routeDistance: 178 },
  { laneOffset: -3, routeDistance: 198 },
  { laneOffset: 3, routeDistance: 198 },
  { laneOffset: 0, routeDistance: 216 },
  { laneOffset: -3, routeDistance: 244 },
  { laneOffset: -3, routeDistance: 266 },
  { laneOffset: 0, routeDistance: 266 },
  { laneOffset: 3, routeDistance: 292 },
  { laneOffset: 0, routeDistance: 308 },
  { laneOffset: 3, routeDistance: 308 },
] as const);

function missionPhase(routeIndex: number): MirageMissionPhase {
  if (routeIndex === 0) return "pickup";
  if (routeIndex < MISSION_TARGETS.length - 1) return "checkpoints";
  if (routeIndex === MISSION_TARGETS.length - 1) return "delivery";
  return "complete";
}

export function getCurrentTarget(
  state: Pick<MirageRunState, "routeIndex">,
): MissionTarget {
  return (
    MISSION_TARGETS[Math.min(state.routeIndex, MISSION_TARGETS.length - 1)] ??
    MISSION_TARGETS[MISSION_TARGETS.length - 1]
  );
}

export function getTimeRemaining(state: Pick<MirageRunState, "elapsed">) {
  return Math.max(0, TARGET_TIME - state.elapsed);
}

export function calculateScore(
  state: Pick<
    MirageRunState,
    "car" | "collisions" | "elapsed" | "phase" | "routeIndex" | "styleScore"
  >,
): number {
  const completionBonus =
    state.phase === "complete"
      ? 2_000 + Math.max(0, TARGET_TIME - state.elapsed) * 60
      : 0;
  return Math.max(
    0,
    Math.round(
      state.car.routeDistance * 10 +
        state.routeIndex * 250 +
        state.styleScore +
        completionBonus -
        state.collisions * 800,
    ),
  );
}

export function getRank(score: number): "S" | "A" | "B" | "C" {
  if (score >= 9_500) return "S";
  if (score >= 7_500) return "A";
  if (score >= 4_500) return "B";
  return "C";
}

export function getTrafficPose(index: number) {
  const definition = TRAFFIC_DEFINITIONS[index % TRAFFIC_DEFINITIONS.length];
  return {
    ...getRoutePose(definition.routeDistance, definition.laneOffset),
    speed: 0,
  };
}

export function getTrafficCount(): number {
  return TRAFFIC_DEFINITIONS.length;
}

function createPursuers(
  routeDistance: number,
  laneOffset: number,
  collisions = 0,
) {
  const leadGap = Math.max(7, 15 - collisions * 2.5);
  return [
    { gap: leadGap, id: 0, laneOffset: laneOffset - 1.8 },
    { gap: leadGap + 8, id: 1, laneOffset: laneOffset + 2.2 },
  ].map(
    (definition): PursuerState => ({
      ...getRoutePose(
        Math.max(0, routeDistance - definition.gap),
        definition.laneOffset,
      ),
      id: definition.id,
    }),
  );
}

export function createMirageRunState(): MirageRunState {
  const pose = getRoutePose(0, 0);
  return {
    car: {
      ...pose,
      boost: 0.68,
      jumpRemaining: 0,
      laneTarget: 0,
      speed: 8,
    },
    collectedBoosts: BOOST_PAD_DEFINITIONS.map(() => false),
    collisions: 0,
    combo: 0,
    elapsed: 0,
    eventId: 0,
    eventLabel: "Package marked",
    finalScore: null,
    impactCooldown: 0,
    nearMisses: 0,
    phase: "pickup",
    pursuers: createPursuers(0, 0),
    rampUsed: false,
    routeIndex: 0,
    score: 0,
    steerLatch: 0,
    styleScore: 0,
    tick: 0,
    trafficResults: TRAFFIC_DEFINITIONS.map(() => "pending"),
  };
}

function withEvent(state: MirageRunState, eventLabel: string): MirageRunState {
  return { ...state, eventId: state.eventId + 1, eventLabel };
}

function updateMission(state: MirageRunState): MirageRunState {
  if (state.phase === "complete" || state.phase === "busted") return state;
  const target = getCurrentTarget(state);
  if (state.car.routeDistance < target.routeDistance) return state;

  const routeIndex = state.routeIndex + 1;
  const phase = missionPhase(routeIndex);
  const progressed = {
    ...state,
    phase,
    routeIndex,
    styleScore: state.styleScore + 150,
  };
  if (phase === "complete") {
    const finalScore = calculateScore(progressed);
    return withEvent(
      { ...progressed, finalScore, score: finalScore },
      "Package delivered",
    );
  }
  return withEvent(
    progressed,
    state.routeIndex === 0
      ? "Package secured. Two units inbound."
      : `Gate ${state.routeIndex} cleared +150`,
  );
}

function updateBoostPads(state: MirageRunState): MirageRunState {
  let next = state;
  BOOST_PAD_DEFINITIONS.forEach((pad, index) => {
    if (next.collectedBoosts[index]) return;
    if (Math.abs(next.car.routeDistance - pad.routeDistance) > 3.8) return;
    if (Math.abs(next.car.laneOffset - pad.laneOffset) > 2.2) return;
    const collectedBoosts = [...next.collectedBoosts];
    collectedBoosts[index] = true;
    next = withEvent(
      {
        ...next,
        car: { ...next.car, boost: 1 },
        collectedBoosts,
        styleScore: next.styleScore + 200,
      },
      "Boost refill +200",
    );
  });
  return next;
}

function resolveImpact(
  state: MirageRunState,
  results: TrafficResult[],
  index: number,
): MirageRunState {
  const collisions = state.collisions + 1;
  results[index] = "hit";
  const pose = getRoutePose(
    state.car.routeDistance + TRAFFIC_LONGITUDINAL_RADIUS + 1,
    state.car.laneOffset,
  );
  const impacted: MirageRunState = {
    ...state,
    car: { ...state.car, ...pose, speed: 5 },
    collisions,
    combo: 0,
    impactCooldown: 0.85,
    trafficResults: results,
  };
  if (collisions < MAX_COLLISIONS) {
    return withEvent(impacted, `Impact ${collisions} / ${MAX_COLLISIONS}`);
  }
  const busted = { ...impacted, phase: "busted" as const };
  const finalScore = calculateScore(busted);
  return withEvent({ ...busted, finalScore, score: finalScore }, "Busted");
}

function updateTraffic(state: MirageRunState): MirageRunState {
  if (state.car.jumpRemaining > 0 || state.phase === "busted") return state;
  let next = state;
  const results = [...state.trafficResults];

  for (let index = 0; index < TRAFFIC_DEFINITIONS.length; index += 1) {
    if (results[index] !== "pending") continue;
    const traffic = TRAFFIC_DEFINITIONS[index];
    const longitudinal = next.car.routeDistance - traffic.routeDistance;
    const lateral = Math.abs(next.car.laneOffset - traffic.laneOffset);

    if (
      Math.abs(longitudinal) < TRAFFIC_LONGITUDINAL_RADIUS &&
      lateral < TRAFFIC_COLLISION_LANE_RADIUS &&
      next.impactCooldown <= 0
    ) {
      next = resolveImpact(next, results, index);
      if (next.phase === "busted") return next;
      continue;
    }
    if (longitudinal <= TRAFFIC_LONGITUDINAL_RADIUS) continue;

    if (lateral < TRAFFIC_NEAR_MISS_LANE_RADIUS) {
      results[index] = "near";
      const combo = Math.min(5, next.combo + 1);
      const points = 150 * Math.min(3, combo);
      next = withEvent(
        {
          ...next,
          combo,
          nearMisses: next.nearMisses + 1,
          styleScore: next.styleScore + points,
          trafficResults: results,
        },
        `Near miss x${combo} +${points}`,
      );
    } else {
      results[index] = "clear";
      next = { ...next, trafficResults: results };
    }
  }
  return next;
}

function updatePursuit(state: MirageRunState): MirageRunState {
  if (state.routeIndex === 0) {
    return {
      ...state,
      pursuers: createPursuers(state.car.routeDistance, 0),
    };
  }
  return {
    ...state,
    pursuers: createPursuers(
      state.car.routeDistance,
      state.car.laneOffset,
      state.collisions,
    ),
  };
}

function stepOnce(
  previous: MirageRunState,
  input: MirageInput,
  delta: number,
): MirageRunState {
  if (previous.phase === "complete" || previous.phase === "busted") {
    return {
      ...previous,
      car: {
        ...previous.car,
        speed: moveToward(previous.car.speed, 0, 18 * delta),
      },
      impactCooldown: Math.max(0, previous.impactCooldown - delta),
      tick: previous.tick + 1,
    };
  }

  const boosting = input.boost && previous.car.boost > 0.015 && !input.brake;
  const targetSpeed = input.brake
    ? BRAKE_SPEED
    : boosting
      ? BOOST_SPEED
      : CRUISE_SPEED;
  const speed = moveToward(
    previous.car.speed,
    targetSpeed,
    (input.brake ? 18 : boosting ? 14 : 9) * delta,
  );
  const steering: -1 | 0 | 1 =
    input.steer < -0.2 ? -1 : input.steer > 0.2 ? 1 : 0;
  const laneTarget =
    steering !== 0 && steering !== previous.steerLatch
      ? clamp(previous.car.laneTarget + steering * 4, -LANE_LIMIT, LANE_LIMIT)
      : previous.car.laneTarget;
  const laneOffset = moveToward(
    previous.car.laneOffset,
    laneTarget,
    LANE_SPEED * delta,
  );
  const routeDistance = Math.min(
    ROUTE_LENGTH,
    previous.car.routeDistance + speed * delta,
  );
  const routePose = getRoutePose(routeDistance, laneOffset);
  let next: MirageRunState = {
    ...previous,
    car: {
      ...routePose,
      boost: boosting
        ? Math.max(0, previous.car.boost - delta * 0.27)
        : Math.min(1, previous.car.boost + delta * 0.035),
      jumpRemaining: Math.max(0, previous.car.jumpRemaining - delta),
      laneTarget,
      speed,
      yaw: routePose.yaw + steering * 0.07,
    },
    elapsed: previous.elapsed + delta,
    impactCooldown: Math.max(0, previous.impactCooldown - delta),
    steerLatch: steering,
    tick: previous.tick + 1,
  };

  if (!next.rampUsed && routeDistance >= RAMP_ROUTE_DISTANCE) {
    next = withEvent(
      {
        ...next,
        car: { ...next.car, jumpRemaining: 1.05, speed: Math.max(16, speed) },
        rampUsed: true,
        styleScore: next.styleScore + 500,
      },
      "Airborne +500",
    );
  }

  next = updateBoostPads(next);
  next = updateTraffic(next);
  next = updatePursuit(next);
  next = updateMission(next);
  return { ...next, score: next.finalScore ?? calculateScore(next) };
}

export function advanceMirageRun(
  state: MirageRunState,
  input: MirageInput,
  delta: number,
): MirageRunState {
  let next = state;
  let remaining = Math.min(0.1, Math.max(0, delta));
  while (remaining > 0.00001) {
    const step = Math.min(FIXED_STEP, remaining);
    next = stepOnce(next, input, step);
    remaining -= step;
  }
  return next;
}
