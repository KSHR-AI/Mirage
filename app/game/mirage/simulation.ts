import type {
  MirageInput,
  MirageMissionPhase,
  MirageRunState,
  MissionTarget,
  Point2,
  PursuerState,
} from "./types";

const FIXED_STEP = 1 / 60;
const CRUISE_SPEED = 10.5;
const BOOST_SPEED = 17;
const BRAKE_SPEED = 6.5;
const LANE_LIMIT = 4;
const LANE_SPEED = 6.2;
const TARGET_TIME = 55;
const TRAFFIC_COLLISION_RADIUS = 2.4;
const TRAFFIC_NEAR_MISS_RADIUS = 4.6;

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

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
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
  { laneOffset: 0, routeDistance: 55 },
  { laneOffset: -2.8, routeDistance: 120 },
  { laneOffset: 2.8, routeDistance: 190 },
  { laneOffset: 0, routeDistance: 258 },
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
  { laneOffset: -2.9, routeDistance: 72, speed: 4.2 },
  { laneOffset: 2.8, routeDistance: 132, speed: 4.8 },
  { laneOffset: 0, routeDistance: 186, speed: 4.4 },
  { laneOffset: -2.7, routeDistance: 238, speed: 5 },
  { laneOffset: 2.7, routeDistance: 280, speed: 4.6 },
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
    "collectedBoosts" | "collisions" | "elapsed" | "nearMisses" | "rampUsed"
  >,
): number {
  const boostBonus = state.collectedBoosts.filter(Boolean).length * 200;
  return Math.max(
    1_000,
    Math.round(
      10_000 -
        state.elapsed * 80 -
        state.collisions * 450 +
        state.nearMisses * 300 +
        boostBonus +
        (state.rampUsed ? 500 : 0),
    ),
  );
}

export function getRank(score: number): "S" | "A" | "B" | "C" {
  if (score >= 9_000) return "S";
  if (score >= 7_700) return "A";
  if (score >= 6_200) return "B";
  return "C";
}

export function getTrafficPose(index: number, elapsed: number) {
  const definition = TRAFFIC_DEFINITIONS[index % TRAFFIC_DEFINITIONS.length];
  const routeDistance =
    (definition.routeDistance + elapsed * definition.speed) % ROUTE_LENGTH;
  return {
    ...getRoutePose(routeDistance, definition.laneOffset),
    speed: definition.speed,
  };
}

export function getTrafficCount(): number {
  return TRAFFIC_DEFINITIONS.length;
}

function createPursuers(routeDistance: number, laneOffset: number) {
  return [
    { gap: 12, id: 0, laneOffset: laneOffset - 1.8 },
    { gap: 20, id: 1, laneOffset: laneOffset + 2.2 },
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
      boost: 0.74,
      jumpRemaining: 0,
      speed: 8,
    },
    collectedBoosts: BOOST_PAD_DEFINITIONS.map(() => false),
    collisions: 0,
    elapsed: 0,
    eventId: 0,
    eventLabel: "Package marked",
    finalScore: null,
    heat: 0,
    nearMissArmed: TRAFFIC_DEFINITIONS.map(() => true),
    nearMisses: 0,
    phase: "pickup",
    pursuers: createPursuers(0, 0),
    rampUsed: false,
    recoveries: 0,
    routeIndex: 0,
    score: 10_000,
    tick: 0,
    trafficCooldowns: TRAFFIC_DEFINITIONS.map(() => 0),
  };
}

function withEvent(state: MirageRunState, eventLabel: string): MirageRunState {
  return { ...state, eventId: state.eventId + 1, eventLabel };
}

function updateMission(state: MirageRunState): MirageRunState {
  if (state.phase === "complete") return state;
  const target = getCurrentTarget(state);
  if (state.car.routeDistance < target.routeDistance) return state;

  const routeIndex = state.routeIndex + 1;
  const phase = missionPhase(routeIndex);
  if (phase === "complete") {
    const finalScore = calculateScore(state);
    return withEvent(
      { ...state, finalScore, phase, routeIndex, score: finalScore },
      "Package delivered",
    );
  }
  return withEvent(
    { ...state, phase, routeIndex },
    state.routeIndex === 0
      ? "Package secured. Two units inbound."
      : `Gate ${state.routeIndex} cleared`,
  );
}

function updateBoostPads(state: MirageRunState): MirageRunState {
  let next = state;
  BOOST_PAD_DEFINITIONS.forEach((pad, index) => {
    if (next.collectedBoosts[index]) return;
    if (Math.abs(next.car.routeDistance - pad.routeDistance) > 3.8) return;
    if (Math.abs(next.car.laneOffset - pad.laneOffset) > 2.25) return;
    const collectedBoosts = [...next.collectedBoosts];
    collectedBoosts[index] = true;
    next = withEvent(
      {
        ...next,
        car: { ...next.car, boost: 1 },
        collectedBoosts,
      },
      "Boost refilled",
    );
  });
  return next;
}

function updateTraffic(state: MirageRunState, delta: number): MirageRunState {
  let next: MirageRunState = {
    ...state,
    nearMissArmed: [...state.nearMissArmed],
    trafficCooldowns: state.trafficCooldowns.map((value) =>
      Math.max(0, value - delta),
    ),
  };
  if (next.car.jumpRemaining > 0) return next;

  for (let index = 0; index < TRAFFIC_DEFINITIONS.length; index += 1) {
    const traffic = getTrafficPose(index, next.elapsed);
    const separation = distance(next.car, traffic);
    if (
      separation < TRAFFIC_COLLISION_RADIUS &&
      next.trafficCooldowns[index] <= 0
    ) {
      const cooldowns = [...next.trafficCooldowns];
      const armed = [...next.nearMissArmed];
      const safeLane = traffic.laneOffset >= 0 ? -LANE_LIMIT : LANE_LIMIT;
      const pose = getRoutePose(next.car.routeDistance + 2.5, safeLane);
      cooldowns[index] = 1.4;
      armed[index] = false;
      next = withEvent(
        {
          ...next,
          car: {
            ...next.car,
            ...pose,
            speed: Math.max(7, next.car.speed * 0.72),
          },
          collisions: next.collisions + 1,
          nearMissArmed: armed,
          recoveries: next.recoveries + 1,
          trafficCooldowns: cooldowns,
        },
        "Impact avoided",
      );
    } else if (
      separation < TRAFFIC_NEAR_MISS_RADIUS &&
      next.nearMissArmed[index]
    ) {
      const armed = [...next.nearMissArmed];
      armed[index] = false;
      next = withEvent(
        { ...next, nearMissArmed: armed, nearMisses: next.nearMisses + 1 },
        "Near miss +300",
      );
    } else if (separation > 8 && !next.nearMissArmed[index]) {
      const armed = [...next.nearMissArmed];
      armed[index] = true;
      next = { ...next, nearMissArmed: armed };
    }
  }
  return next;
}

function updatePursuit(state: MirageRunState): MirageRunState {
  if (state.routeIndex === 0 || state.phase === "complete") {
    return {
      ...state,
      heat: 0,
      pursuers: createPursuers(state.car.routeDistance, 0),
    };
  }
  const pursuers = createPursuers(
    state.car.routeDistance,
    state.car.laneOffset,
  );
  const leadGap = state.car.routeDistance - pursuers[0].routeDistance;
  return {
    ...state,
    heat: leadGap < 10 ? 3 : leadGap < 15 ? 2 : 1,
    pursuers,
  };
}

function stepOnce(
  previous: MirageRunState,
  input: MirageInput,
  delta: number,
): MirageRunState {
  if (previous.phase === "complete") {
    return {
      ...previous,
      car: {
        ...previous.car,
        speed: moveToward(previous.car.speed, 0, 18 * delta),
      },
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
    (input.brake ? 16 : boosting ? 12 : 8) * delta,
  );
  const laneOffset = clamp(
    previous.car.laneOffset + clamp(input.steer, -1, 1) * LANE_SPEED * delta,
    -LANE_LIMIT,
    LANE_LIMIT,
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
        ? Math.max(0, previous.car.boost - delta * 0.24)
        : Math.min(1, previous.car.boost + delta * 0.05),
      jumpRemaining: Math.max(0, previous.car.jumpRemaining - delta),
      speed,
      yaw: routePose.yaw + clamp(input.steer, -1, 1) * 0.08,
    },
    elapsed: previous.elapsed + delta,
    tick: previous.tick + 1,
  };

  if (!next.rampUsed && routeDistance >= RAMP_ROUTE_DISTANCE) {
    next = withEvent(
      {
        ...next,
        car: { ...next.car, jumpRemaining: 1.05, speed: Math.max(15, speed) },
        rampUsed: true,
      },
      "Airborne +500",
    );
  }

  next = updateBoostPads(next);
  next = updateTraffic(next, delta);
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
