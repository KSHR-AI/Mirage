import { CITY_LIMIT, ROAD_LINES, isDriveable, recoverToRoad } from "./map";
import type {
  MirageInput,
  MirageMissionPhase,
  MirageRunState,
  MissionTarget,
  Point2,
  PursuerState,
} from "./types";

const FIXED_STEP = 1 / 60;
const CRUISE_SPEED = 12;
const BOOST_SPEED = 19;
const TURN_RATE = 2.35;
const TARGET_TIME = 90;
const TRAFFIC_COLLISION_RADIUS = 2.75;
const TRAFFIC_NEAR_MISS_RADIUS = 4.8;

export const EMPTY_INPUT: MirageInput = Object.freeze({
  boost: false,
  brake: false,
  steer: 0,
});

export const MISSION_TARGETS: readonly MissionTarget[] = Object.freeze([
  {
    id: "pickup",
    label: "Collect the package",
    radius: 8,
    type: "pickup",
    x: -72,
    z: 72,
  },
  {
    id: "gate-downtown",
    label: "Lose them through Downtown",
    radius: 9,
    type: "checkpoint",
    x: -72,
    z: 0,
  },
  {
    id: "gate-market",
    label: "Cut across Market Street",
    radius: 9,
    type: "checkpoint",
    x: 36,
    z: 0,
  },
  {
    id: "gate-waterfront",
    label: "Break for the waterfront",
    radius: 9,
    type: "checkpoint",
    x: 36,
    z: 36,
  },
  {
    id: "pier-11",
    label: "Deliver to Pier 11",
    radius: 10,
    type: "finish",
    x: 108,
    z: 36,
  },
]);

export const BOOST_PADS: readonly Point2[] = Object.freeze([
  { x: -72, z: 36 },
  { x: 0, z: 0 },
  { x: 36, z: 18 },
  { x: 72, z: 36 },
]);

export const RAMP_POSITION: Point2 = Object.freeze({ x: 36, z: 18 });

const TRAFFIC_ROUTES = Object.freeze([
  {
    offset: 32,
    points: [
      { x: -108, z: -108 },
      { x: 108, z: -108 },
      { x: 108, z: 108 },
      { x: -108, z: 108 },
    ],
    speed: 7.2,
  },
  {
    offset: 118,
    points: [
      { x: -36, z: -72 },
      { x: 72, z: -72 },
      { x: 72, z: 72 },
      { x: -36, z: 72 },
    ],
    speed: 6.4,
  },
  {
    offset: 205,
    points: [
      { x: -72, z: -36 },
      { x: 36, z: -36 },
      { x: 36, z: 108 },
      { x: -72, z: 108 },
    ],
    speed: 8.1,
  },
  {
    offset: 76,
    points: [
      { x: 0, z: -108 },
      { x: 108, z: -108 },
      { x: 108, z: 0 },
      { x: 0, z: 0 },
    ],
    speed: 7.6,
  },
] as const);

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function moveToward(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function wrapAngle(angle: number): number {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

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
  const boostBonus = state.collectedBoosts.filter(Boolean).length * 150;
  const rampBonus = state.rampUsed ? 500 : 0;
  return Math.max(
    1_000,
    Math.round(
      12_000 -
        state.elapsed * 75 -
        state.collisions * 300 +
        state.nearMisses * 350 +
        boostBonus +
        rampBonus,
    ),
  );
}

export function getRank(score: number): "S" | "A" | "B" | "C" {
  if (score >= 10_500) return "S";
  if (score >= 8_500) return "A";
  if (score >= 6_500) return "B";
  return "C";
}

export function createMirageRunState(): MirageRunState {
  const base: MirageRunState = {
    car: {
      boost: 0.72,
      jumpRemaining: 0,
      speed: 6,
      x: -72,
      yaw: 0,
      z: 104,
    },
    collectedBoosts: BOOST_PADS.map(() => false),
    collisionCooldown: 0,
    collisions: 0,
    elapsed: 0,
    eventId: 0,
    eventLabel: "Package marked",
    finalScore: null,
    heat: 0,
    nearMissArmed: TRAFFIC_ROUTES.map(() => true),
    nearMisses: 0,
    phase: "pickup",
    pursuers: [
      {
        axis: "z",
        direction: -1,
        id: 0,
        speed: 10.4,
        x: -72,
        yaw: 0,
        z: 108,
      },
      {
        axis: "x",
        direction: 1,
        id: 1,
        speed: 10.9,
        x: -108,
        yaw: Math.PI / 2,
        z: 72,
      },
    ],
    rampUsed: false,
    recoveries: 0,
    routeIndex: 0,
    score: 12_000,
    stuckSeconds: 0,
    targetHold: 0,
    tick: 0,
    trafficCooldowns: TRAFFIC_ROUTES.map(() => 0),
  };
  return base;
}

function polylineLength(points: readonly Point2[]): number {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    total += distance(points[index], points[(index + 1) % points.length]);
  }
  return total;
}

export function getTrafficPose(index: number, elapsed: number) {
  const route = TRAFFIC_ROUTES[index % TRAFFIC_ROUTES.length];
  const totalLength = polylineLength(route.points);
  let travel = (route.offset + elapsed * route.speed) % totalLength;
  for (let pointIndex = 0; pointIndex < route.points.length; pointIndex += 1) {
    const start = route.points[pointIndex];
    const end = route.points[(pointIndex + 1) % route.points.length];
    const segmentLength = distance(start, end);
    if (travel <= segmentLength) {
      const progress = segmentLength === 0 ? 0 : travel / segmentLength;
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      return {
        speed: route.speed,
        x: start.x + dx * progress,
        yaw: Math.atan2(dx, -dz),
        z: start.z + dz * progress,
      };
    }
    travel -= segmentLength;
  }
  return {
    speed: route.speed,
    x: route.points[0].x,
    yaw: 0,
    z: route.points[0].z,
  };
}

export function getTrafficCount(): number {
  return TRAFFIC_ROUTES.length;
}

function choosePursuerDirection(
  pursuer: PursuerState,
  target: Point2,
): Pick<PursuerState, "axis" | "direction" | "yaw"> {
  const dx = target.x - pursuer.x;
  const dz = target.z - pursuer.z;
  if (Math.abs(dx) > Math.abs(dz)) {
    const direction = (dx >= 0 ? 1 : -1) as -1 | 1;
    return {
      axis: "x",
      direction,
      yaw: direction > 0 ? Math.PI / 2 : -Math.PI / 2,
    };
  }
  const direction = (dz >= 0 ? 1 : -1) as -1 | 1;
  return {
    axis: "z",
    direction,
    yaw: direction > 0 ? Math.PI : 0,
  };
}

function advancePursuer(
  pursuer: PursuerState,
  target: Point2,
  delta: number,
): PursuerState {
  let next = { ...pursuer };
  let remaining = pursuer.speed * delta;
  for (let iteration = 0; iteration < 2 && remaining > 0; iteration += 1) {
    const coordinate = next.axis === "x" ? next.x : next.z;
    const forwardLines = ROAD_LINES.filter((line) =>
      next.direction > 0 ? line > coordinate + 0.05 : line < coordinate - 0.05,
    );
    const nextIntersection =
      next.direction > 0
        ? Math.min(...forwardLines, CITY_LIMIT)
        : Math.max(...forwardLines, -CITY_LIMIT);
    const intersectionDistance = Math.abs(nextIntersection - coordinate);
    if (intersectionDistance > remaining) {
      if (next.axis === "x") next.x += next.direction * remaining;
      else next.z += next.direction * remaining;
      remaining = 0;
      continue;
    }
    if (next.axis === "x") next.x = nextIntersection;
    else next.z = nextIntersection;
    remaining -= intersectionDistance;
    const turn = choosePursuerDirection(next, target);
    next = { ...next, ...turn };
  }
  return next;
}

function withEvent(state: MirageRunState, eventLabel: string): MirageRunState {
  return { ...state, eventId: state.eventId + 1, eventLabel };
}

function updateMission(state: MirageRunState, delta: number): MirageRunState {
  if (state.phase === "complete") return state;
  const target = getCurrentTarget(state);
  const inside = distance(state.car, target) <= target.radius;
  const requiredHold = target.type === "finish" ? 0.45 : 0.1;
  const targetHold = inside ? state.targetHold + delta : 0;
  if (targetHold < requiredHold) return { ...state, targetHold };

  const routeIndex = state.routeIndex + 1;
  const phase = missionPhase(routeIndex);
  if (phase === "complete") {
    const finalScore = calculateScore(state);
    return withEvent(
      {
        ...state,
        finalScore,
        phase,
        routeIndex,
        score: finalScore,
        targetHold: 0,
      },
      "Package delivered",
    );
  }
  const label =
    state.routeIndex === 0
      ? "Package secured. Two units inbound."
      : `Gate ${state.routeIndex} cleared`;
  return withEvent({ ...state, phase, routeIndex, targetHold: 0 }, label);
}

function updateBoostPads(state: MirageRunState): MirageRunState {
  let next = state;
  for (let index = 0; index < BOOST_PADS.length; index += 1) {
    if (next.collectedBoosts[index]) continue;
    if (distance(next.car, BOOST_PADS[index]) > 4.2) continue;
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
  }
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

  for (let index = 0; index < TRAFFIC_ROUTES.length; index += 1) {
    const traffic = getTrafficPose(index, next.elapsed);
    const separation = distance(next.car, traffic);
    if (
      separation < TRAFFIC_COLLISION_RADIUS &&
      next.trafficCooldowns[index] <= 0
    ) {
      const cooldowns = [...next.trafficCooldowns];
      const armed = [...next.nearMissArmed];
      cooldowns[index] = 1.2;
      armed[index] = false;
      next = withEvent(
        {
          ...next,
          car: { ...next.car, speed: next.car.speed * 0.5 },
          collisions: next.collisions + 1,
          nearMissArmed: armed,
          trafficCooldowns: cooldowns,
        },
        "Traffic hit",
      );
    } else if (
      separation < TRAFFIC_NEAR_MISS_RADIUS &&
      next.nearMissArmed[index]
    ) {
      const armed = [...next.nearMissArmed];
      armed[index] = false;
      next = withEvent(
        { ...next, nearMissArmed: armed, nearMisses: next.nearMisses + 1 },
        "Near miss +350",
      );
    } else if (separation > 8 && !next.nearMissArmed[index]) {
      const armed = [...next.nearMissArmed];
      armed[index] = true;
      next = { ...next, nearMissArmed: armed };
    }
  }
  return next;
}

function updatePursuit(state: MirageRunState, delta: number): MirageRunState {
  if (state.routeIndex === 0 || state.phase === "complete") {
    return { ...state, heat: 0 };
  }
  const pursuers = state.pursuers.map((pursuer) =>
    advancePursuer(pursuer, state.car, delta),
  );
  const nearest = Math.min(
    ...pursuers.map((pursuer) => distance(pursuer, state.car)),
  );
  const heat = nearest < 14 ? 3 : nearest < 28 ? 2 : nearest < 46 ? 1 : 0;
  let next: MirageRunState = { ...state, heat, pursuers };
  if (
    nearest < 3.4 &&
    state.collisionCooldown <= 0 &&
    state.car.jumpRemaining <= 0
  ) {
    next = withEvent(
      {
        ...next,
        car: { ...next.car, speed: next.car.speed * 0.72 },
        collisionCooldown: 0.8,
        collisions: next.collisions + 1,
      },
      "Police contact",
    );
  }
  return next;
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
  const targetSpeed = input.brake ? 1.5 : boosting ? BOOST_SPEED : CRUISE_SPEED;
  const acceleration = input.brake ? 20 : boosting ? 13 : 8.5;
  const speed = moveToward(
    previous.car.speed,
    targetSpeed,
    acceleration * delta,
  );
  const turnScale = 0.42 + Math.min(1, speed / CRUISE_SPEED) * 0.58;
  const yaw = wrapAngle(
    previous.car.yaw +
      Math.max(-1, Math.min(1, input.steer)) * TURN_RATE * turnScale * delta,
  );
  const candidate = {
    x: previous.car.x + Math.sin(yaw) * speed * delta,
    z: previous.car.z - Math.cos(yaw) * speed * delta,
  };
  let x = candidate.x;
  let z = candidate.z;
  let collided = false;
  if (!isDriveable(candidate)) {
    const xSlide = { x: candidate.x, z: previous.car.z };
    const zSlide = { x: previous.car.x, z: candidate.z };
    if (isDriveable(xSlide)) {
      x = xSlide.x;
      z = xSlide.z;
    } else if (isDriveable(zSlide)) {
      x = zSlide.x;
      z = zSlide.z;
    } else {
      x = previous.car.x;
      z = previous.car.z;
      collided = true;
    }
  }

  const collisionCooldown = Math.max(0, previous.collisionCooldown - delta);
  let next: MirageRunState = {
    ...previous,
    car: {
      boost: boosting
        ? Math.max(0, previous.car.boost - delta * 0.26)
        : Math.min(1, previous.car.boost + delta * 0.045),
      jumpRemaining: Math.max(0, previous.car.jumpRemaining - delta),
      speed: collided ? Math.min(speed, 3.5) : speed,
      x,
      yaw,
      z,
    },
    collisionCooldown,
    elapsed: previous.elapsed + delta,
    stuckSeconds: collided ? previous.stuckSeconds + delta : 0,
    tick: previous.tick + 1,
  };

  if (collided && collisionCooldown <= 0) {
    next = withEvent(
      {
        ...next,
        collisionCooldown: 0.75,
        collisions: next.collisions + 1,
      },
      "Wall contact",
    );
  }
  if (next.stuckSeconds >= 1.2) {
    const recovery = recoverToRoad(next.car, next.car.yaw);
    next = withEvent(
      {
        ...next,
        car: { ...next.car, ...recovery, speed: 6 },
        recoveries: next.recoveries + 1,
        stuckSeconds: 0,
      },
      "Returned to road",
    );
  }

  if (
    !next.rampUsed &&
    distance(next.car, RAMP_POSITION) < 4.4 &&
    next.car.speed > 8
  ) {
    next = withEvent(
      {
        ...next,
        car: {
          ...next.car,
          jumpRemaining: 1.05,
          speed: Math.max(16, next.car.speed),
        },
        rampUsed: true,
      },
      "Airborne +500",
    );
  }

  next = updateBoostPads(next);
  next = updateTraffic(next, delta);
  next = updatePursuit(next, delta);
  next = updateMission(next, delta);
  const score = calculateScore(next);
  return { ...next, score: next.finalScore ?? score };
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
