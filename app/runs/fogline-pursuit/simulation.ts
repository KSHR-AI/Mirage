export type RunPhase = "intercept" | "scrub" | "escape" | "won" | "busted";

export type DriveInput = {
  throttle: number;
  steer: number;
  handbrake: boolean;
};

export type Point = {
  x: number;
  z: number;
};

export type CopState = Point & {
  id: number;
  heading: number;
  speed: number;
  path: Point[];
  pathIndex: number;
  replanIn: number;
  impactCooldown: number;
};

export type FoglineState = {
  player: Point & {
    heading: number;
    speed: number;
    integrity: number;
    impactCooldown: number;
  };
  cops: CopState[];
  phase: RunPhase;
  objectiveIndex: number;
  timeLeft: number;
  heat: number;
  score: number;
  driftScore: number;
  driftChain: number;
  message: string;
  messageTime: number;
  elapsed: number;
};

export const WORLD_HALF = 94;
export const ROAD_HALF_WIDTH = 9;
export const ROAD_CENTERS = [-72, -24, 24, 72] as const;
export const PLAYER_RADIUS = 2.2;

export const OBJECTIVES = [
  {
    phase: "intercept" as const,
    label: "Intercept the encrypted drop",
    shortLabel: "DROP",
    point: { x: -72, z: 24 },
    heatAfter: 3,
    score: 2500,
  },
  {
    phase: "scrub" as const,
    label: "Burn the tracker at Pier 70",
    shortLabel: "SCRUB",
    point: { x: 72, z: -72 },
    heatAfter: 5,
    score: 5000,
  },
  {
    phase: "escape" as const,
    label: "Lose the tail at the fogline garage",
    shortLabel: "SAFE",
    point: { x: -24, z: -72 },
    heatAfter: 0,
    score: 10000,
  },
] as const;

export type CityBlock = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  tone: number;
};

export const CITY_BLOCKS: CityBlock[] = createCityBlocks();

export type NavigationCue = {
  bearing: number;
  instruction: string;
  waypointDistance: number;
};

const COP_SPAWNS: Point[] = [
  { x: -24, z: 72 },
  { x: 24, z: -72 },
  { x: 72, z: 24 },
  { x: -72, z: -24 },
  { x: 24, z: 24 },
];

const MAX_FORWARD_SPEED = 35;
const MAX_REVERSE_SPEED = 12;
const PLAYER_ACCELERATION = 25;
const PLAYER_BRAKE = 36;
const COP_MAX_SPEED = 30;

export function createFoglineState(): FoglineState {
  return {
    player: {
      x: -72,
      z: 82,
      heading: Math.PI,
      speed: 0,
      integrity: 100,
      impactCooldown: 0,
    },
    cops: [],
    phase: "intercept",
    objectiveIndex: 0,
    timeLeft: 160,
    heat: 1,
    score: 0,
    driftScore: 0,
    driftChain: 0,
    message: "The courier is moving. Take the drop.",
    messageTime: 4,
    elapsed: 0,
  };
}

export function stepFogline(
  state: FoglineState,
  input: DriveInput,
  deltaSeconds: number,
): FoglineState {
  if (state.phase === "won" || state.phase === "busted") return state;

  const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
  const next = cloneState(state);
  next.elapsed += dt;
  next.timeLeft = Math.max(0, next.timeLeft - dt);
  next.messageTime = Math.max(0, next.messageTime - dt);
  next.player.impactCooldown = Math.max(0, next.player.impactCooldown - dt);

  updatePlayer(next, input, dt);
  updateMission(next);
  maintainCopCount(next);
  updateCops(next, dt);
  updateDrift(next, input, dt);

  if (next.timeLeft <= 0 || next.player.integrity <= 0) {
    next.phase = "busted";
    next.message =
      next.timeLeft <= 0
        ? "The city locked down before you cleared the job."
        : "Your ride is finished.";
    next.messageTime = Number.POSITIVE_INFINITY;
  }

  return next;
}

export function currentObjective(state: FoglineState) {
  return OBJECTIVES[Math.min(state.objectiveIndex, OBJECTIVES.length - 1)];
}

export function objectiveDistance(state: FoglineState) {
  const target = currentObjective(state).point;
  return Math.hypot(target.x - state.player.x, target.z - state.player.z);
}

export function objectiveBearing(state: FoglineState) {
  const target = currentObjective(state).point;
  const worldBearing = Math.atan2(
    target.x - state.player.x,
    target.z - state.player.z,
  );
  return normalizeAngle(worldBearing - state.player.heading);
}

export function navigationCue(state: FoglineState): NavigationCue {
  const objective = currentObjective(state);
  const entry = navigationEntry(state.player, state.player.heading);
  const entryDistance = Math.hypot(
    entry.x - state.player.x,
    entry.z - state.player.z,
  );
  const forwardDistance =
    (entry.x - state.player.x) * Math.sin(state.player.heading) +
    (entry.z - state.player.z) * Math.cos(state.player.heading);
  const path = findRoadPath(entry, objective.point);
  const nextRoadPoint = path[0] ?? objective.point;
  const desiredRoadHeading = Math.atan2(
    nextRoadPoint.x - entry.x,
    nextRoadPoint.z - entry.z,
  );
  const maneuverBearing = normalizeAngle(
    desiredRoadHeading - state.player.heading,
  );
  const waypoint =
    entryDistance > 13 && distanceBetween(entry, nextRoadPoint) > 1
      ? entry
      : nextRoadPoint;
  const waypointDistance = Math.hypot(
    waypoint.x - state.player.x,
    waypoint.z - state.player.z,
  );
  const waypointBearing = normalizeAngle(
    Math.atan2(waypoint.x - state.player.x, waypoint.z - state.player.z) -
      state.player.heading,
  );

  if (forwardDistance < -3 && entryDistance > 13) {
    return {
      bearing: waypointBearing,
      instruction: "Turn around",
      waypointDistance,
    };
  }

  if (Math.abs(maneuverBearing) < 0.42) {
    return {
      bearing: waypointBearing,
      instruction: `Continue ${Math.max(1, Math.round(waypointDistance))}m`,
      waypointDistance,
    };
  }

  const direction = maneuverBearing < 0 ? "Right" : "Left";
  return {
    bearing: entryDistance > 13 ? waypointBearing : maneuverBearing,
    instruction:
      entryDistance > 13
        ? `${direction} in ${Math.round(entryDistance)}m`
        : `${direction} now`,
    waypointDistance,
  };
}

export function nearestCopDistance(state: FoglineState) {
  if (state.cops.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(
    ...state.cops.map((cop) =>
      Math.hypot(cop.x - state.player.x, cop.z - state.player.z),
    ),
  );
}

export function isInsideBuilding(x: number, z: number, radius = 0) {
  return CITY_BLOCKS.some(
    (block) =>
      x + radius > block.minX &&
      x - radius < block.maxX &&
      z + radius > block.minZ &&
      z - radius < block.maxZ,
  );
}

function updatePlayer(state: FoglineState, input: DriveInput, dt: number) {
  const player = state.player;
  const throttle = clamp(input.throttle, -1, 1);
  const steer = clamp(input.steer, -1, 1);

  if (throttle > 0) {
    player.speed += PLAYER_ACCELERATION * throttle * dt;
  } else if (throttle < 0) {
    if (player.speed > 1) {
      player.speed += PLAYER_BRAKE * throttle * dt;
    } else {
      player.speed += PLAYER_ACCELERATION * 0.7 * throttle * dt;
    }
  } else {
    player.speed *= Math.pow(0.965, dt * 60);
  }

  if (input.handbrake) {
    player.speed *= Math.pow(0.955, dt * 60);
  }

  player.speed = clamp(player.speed, -MAX_REVERSE_SPEED, MAX_FORWARD_SPEED);

  const speedRatio = Math.min(Math.abs(player.speed) / MAX_FORWARD_SPEED, 1);
  const reverseDirection = player.speed < -0.5 ? -1 : 1;
  const steeringGrip = input.handbrake ? 1.55 : 1;
  player.heading = normalizeAngle(
    player.heading -
      steer * reverseDirection * (0.75 + speedRatio * 3.55) * steeringGrip * dt,
  );

  const distance = player.speed * dt;
  const nextX = player.x + Math.sin(player.heading) * distance;
  const nextZ = player.z + Math.cos(player.heading) * distance;
  const collision = moveWithCityCollision(player, nextX, nextZ, PLAYER_RADIUS);

  if (collision.collided) {
    const impact = Math.abs(player.speed);
    player.speed *=
      collision.xBlocked && collision.zBlocked
        ? impact > 16
          ? -0.18
          : 0.35
        : 0.68;
    if (collision.xBlocked !== collision.zBlocked) {
      const roadHeading = collision.xBlocked
        ? Math.cos(player.heading) >= 0
          ? 0
          : Math.PI
        : Math.sin(player.heading) >= 0
          ? Math.PI / 2
          : -Math.PI / 2;
      player.heading = rotateToward(player.heading, roadHeading, 0.22);
    }
    if (player.impactCooldown <= 0) {
      player.integrity = Math.max(
        0,
        player.integrity - Math.max(2, impact * 0.2),
      );
      player.impactCooldown = 0.6;
      state.message = impact > 16 ? "Hard contact." : "Scraped the block.";
      state.messageTime = 1.2;
    }
  }
}

function updateMission(state: FoglineState) {
  const objective = currentObjective(state);
  const distance = Math.hypot(
    objective.point.x - state.player.x,
    objective.point.z - state.player.z,
  );
  if (distance > 9) return;

  state.score += objective.score;
  if (state.objectiveIndex === OBJECTIVES.length - 1) {
    state.phase = "won";
    state.heat = 0;
    state.message = "Package clean. City lost the signal.";
    state.messageTime = Number.POSITIVE_INFINITY;
    return;
  }

  state.objectiveIndex += 1;
  const nextObjective = currentObjective(state);
  state.phase = nextObjective.phase;
  state.heat = objective.heatAfter;
  state.timeLeft += 20;
  state.message =
    state.objectiveIndex === 1
      ? "Drop secured. Tracker live—burn it at the pier."
      : "Tracker ash. Get under the fog before SFPD boxes you in.";
  state.messageTime = 4;
}

function maintainCopCount(state: FoglineState) {
  const desired = state.heat >= 5 ? 3 : state.heat >= 3 ? 2 : 0;
  while (state.cops.length < desired) {
    const spawn = chooseCopSpawn(state, state.cops.length);
    state.cops.push({
      id: state.cops.length + 1,
      x: spawn.x,
      z: spawn.z,
      heading: 0,
      speed: 12,
      path: [],
      pathIndex: 0,
      replanIn: 0,
      impactCooldown: 0,
    });
  }
}

function chooseCopSpawn(state: FoglineState, offset: number) {
  const candidates = COP_SPAWNS.map((point, index) => ({
    point,
    distance:
      Math.hypot(point.x - state.player.x, point.z - state.player.z) +
      ((index + offset) % 3) * 4,
  }))
    .filter((candidate) => candidate.distance > 34)
    .sort((left, right) => left.distance - right.distance);
  return candidates[0]?.point ?? COP_SPAWNS[offset % COP_SPAWNS.length];
}

function updateCops(state: FoglineState, dt: number) {
  for (const cop of state.cops) {
    cop.replanIn -= dt;
    cop.impactCooldown = Math.max(0, cop.impactCooldown - dt);

    if (cop.replanIn <= 0 || cop.pathIndex >= cop.path.length) {
      const leadSeconds = Math.min(
        1.2,
        Math.hypot(cop.x - state.player.x, cop.z - state.player.z) / 60,
      );
      const predicted = {
        x:
          state.player.x +
          Math.sin(state.player.heading) * state.player.speed * leadSeconds,
        z:
          state.player.z +
          Math.cos(state.player.heading) * state.player.speed * leadSeconds,
      };
      cop.path = findRoadPath(cop, predicted);
      cop.pathIndex = 0;
      cop.replanIn = 0.45 + cop.id * 0.04;
    }

    let target = cop.path[cop.pathIndex] ?? state.player;
    if (Math.hypot(target.x - cop.x, target.z - cop.z) < 5) {
      cop.pathIndex += 1;
      target = cop.path[cop.pathIndex] ?? state.player;
    }

    const desiredHeading = Math.atan2(target.x - cop.x, target.z - cop.z);
    const headingDelta = normalizeAngle(desiredHeading - cop.heading);
    cop.heading = normalizeAngle(
      cop.heading + clamp(headingDelta, -2.5 * dt, 2.5 * dt),
    );

    const distanceToPlayer = Math.hypot(
      state.player.x - cop.x,
      state.player.z - cop.z,
    );
    const desiredSpeed =
      distanceToPlayer < 7
        ? Math.max(13, Math.abs(state.player.speed) * 0.8)
        : Math.min(COP_MAX_SPEED, 22 + state.heat * 1.4);
    cop.speed += clamp(desiredSpeed - cop.speed, -20 * dt, 16 * dt);

    const nextX = cop.x + Math.sin(cop.heading) * cop.speed * dt;
    const nextZ = cop.z + Math.cos(cop.heading) * cop.speed * dt;
    const collision = moveWithCityCollision(cop, nextX, nextZ, 2);
    if (collision.collided) {
      cop.speed *= 0.35;
      cop.replanIn = 0;
    }

    const contactDistance = Math.hypot(
      state.player.x - cop.x,
      state.player.z - cop.z,
    );
    if (contactDistance < 4.2) {
      const safeDistance = Math.max(contactDistance, 0.01);
      const normalX = (state.player.x - cop.x) / safeDistance;
      const normalZ = (state.player.z - cop.z) / safeDistance;
      const overlap = 4.2 - contactDistance;
      moveWithCityCollision(
        state.player,
        state.player.x + normalX * overlap * 0.58,
        state.player.z + normalZ * overlap * 0.58,
        PLAYER_RADIUS,
      );
      moveWithCityCollision(
        cop,
        cop.x - normalX * overlap * 0.42,
        cop.z - normalZ * overlap * 0.42,
        2,
      );

      if (cop.impactCooldown <= 0) {
        state.player.integrity = Math.max(0, state.player.integrity - 1);
        state.player.speed *= 0.82;
        cop.speed *= 0.55;
        state.message = "SFPD rammed you.";
        state.messageTime = 1.4;
        cop.impactCooldown = 2.2;
      }
    }
  }
}

function updateDrift(
  state: FoglineState,
  input: DriveInput,
  deltaSeconds: number,
) {
  const drifting =
    input.handbrake &&
    Math.abs(input.steer) > 0.25 &&
    Math.abs(state.player.speed) > 13;
  if (drifting) {
    state.driftChain += deltaSeconds;
    const points =
      Math.abs(state.player.speed) * Math.abs(input.steer) * deltaSeconds * 8;
    state.driftScore += points;
    state.score += Math.round(points);
  } else {
    state.driftChain = Math.max(0, state.driftChain - deltaSeconds * 2);
  }
}

function moveWithCityCollision(
  point: Point,
  nextX: number,
  nextZ: number,
  radius: number,
) {
  let xBlocked = false;
  let zBlocked = false;
  const clampedX = clamp(nextX, -WORLD_HALF, WORLD_HALF);
  const clampedZ = clamp(nextZ, -WORLD_HALF, WORLD_HALF);

  if (!isInsideBuilding(clampedX, point.z, radius)) {
    point.x = clampedX;
  } else {
    xBlocked = true;
  }

  if (!isInsideBuilding(point.x, clampedZ, radius)) {
    point.z = clampedZ;
  } else {
    zBlocked = true;
  }

  if (clampedX !== nextX) xBlocked = true;
  if (clampedZ !== nextZ) zBlocked = true;
  return {
    collided: xBlocked || zBlocked,
    xBlocked,
    zBlocked,
  };
}

function findRoadPath(from: Point, target: Point): Point[] {
  const start = nearestRoadNode(from);
  const goal = nearestRoadNode(target);
  const queue: Array<{ point: Point; path: Point[] }> = [
    { point: start, path: [start] },
  ];
  const visited = new Set([nodeKey(start)]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (nodeKey(current.point) === nodeKey(goal)) {
      return [...current.path.slice(1), { x: target.x, z: target.z }];
    }
    for (const neighbor of roadNeighbors(current.point)) {
      const key = nodeKey(neighbor);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({
        point: neighbor,
        path: [...current.path, neighbor],
      });
    }
  }
  return [goal, { x: target.x, z: target.z }];
}

function nearestRoadNode(point: Point): Point {
  let best: Point = { x: ROAD_CENTERS[0], z: ROAD_CENTERS[0] };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const x of ROAD_CENTERS) {
    for (const z of ROAD_CENTERS) {
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance < bestDistance) {
        best = { x, z };
        bestDistance = distance;
      }
    }
  }
  return best;
}

function navigationEntry(point: Point, heading: number): Point {
  const nearestX = nearestRoadCenter(point.x);
  const nearestZ = nearestRoadCenter(point.z);
  const onVerticalRoad =
    Math.abs(point.x - nearestX) <= Math.abs(point.z - nearestZ);
  const candidates = onVerticalRoad
    ? ROAD_CENTERS.map((z) => ({ x: nearestX, z }))
    : ROAD_CENTERS.map((x) => ({ x, z: nearestZ }));
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);

  return candidates
    .map((candidate) => {
      const deltaX = candidate.x - point.x;
      const deltaZ = candidate.z - point.z;
      const forwardDistance = deltaX * forwardX + deltaZ * forwardZ;
      return {
        point: candidate,
        score: Math.hypot(deltaX, deltaZ) + (forwardDistance < -2 ? 100 : 0),
      };
    })
    .sort((left, right) => left.score - right.score)[0].point;
}

function nearestRoadCenter(value: number) {
  return ROAD_CENTERS.reduce((nearest, center) =>
    Math.abs(center - value) < Math.abs(nearest - value) ? center : nearest,
  );
}

function roadNeighbors(point: Point): Point[] {
  const xIndex = ROAD_CENTERS.indexOf(point.x as (typeof ROAD_CENTERS)[number]);
  const zIndex = ROAD_CENTERS.indexOf(point.z as (typeof ROAD_CENTERS)[number]);
  const neighbors: Point[] = [];
  if (xIndex > 0) neighbors.push({ x: ROAD_CENTERS[xIndex - 1], z: point.z });
  if (xIndex < ROAD_CENTERS.length - 1)
    neighbors.push({ x: ROAD_CENTERS[xIndex + 1], z: point.z });
  if (zIndex > 0) neighbors.push({ x: point.x, z: ROAD_CENTERS[zIndex - 1] });
  if (zIndex < ROAD_CENTERS.length - 1)
    neighbors.push({ x: point.x, z: ROAD_CENTERS[zIndex + 1] });
  return neighbors;
}

function createCityBlocks(): CityBlock[] {
  const blocks: CityBlock[] = [];
  for (let xIndex = 0; xIndex < ROAD_CENTERS.length - 1; xIndex += 1) {
    for (let zIndex = 0; zIndex < ROAD_CENTERS.length - 1; zIndex += 1) {
      const minX = ROAD_CENTERS[xIndex] + ROAD_HALF_WIDTH + 2;
      const maxX = ROAD_CENTERS[xIndex + 1] - ROAD_HALF_WIDTH - 2;
      const minZ = ROAD_CENTERS[zIndex] + ROAD_HALF_WIDTH + 2;
      const maxZ = ROAD_CENTERS[zIndex + 1] - ROAD_HALF_WIDTH - 2;
      const seed = (xIndex + 1) * 17 + (zIndex + 1) * 31;
      blocks.push({
        minX,
        maxX,
        minZ,
        maxZ,
        height: 14 + (seed % 5) * 6,
        tone: seed % 4,
      });
    }
  }
  return blocks;
}

function cloneState(state: FoglineState): FoglineState {
  return {
    ...state,
    player: { ...state.player },
    cops: state.cops.map((cop) => ({
      ...cop,
      path: cop.path.map((point) => ({ ...point })),
    })),
  };
}

function nodeKey(point: Point) {
  return `${point.x},${point.z}`;
}

function distanceBetween(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function normalizeAngle(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function rotateToward(current: number, target: number, amount: number) {
  return normalizeAngle(current + normalizeAngle(target - current) * amount);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
