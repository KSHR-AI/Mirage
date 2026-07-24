export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1800;
export const ROAD_WIDTH = 236;
export const ROAD_X = [300, 900, 1500, 2100] as const;
export const ROAD_Y = [300, 900, 1500] as const;

export type Phase = "findCar" | "pickup" | "deliver" | "won" | "busted";
export type PlayerMode = "foot" | "car";

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface Building extends Rect {
  id: number;
}

export interface GameInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  action: boolean;
}

export interface Car extends Point {
  angle: number;
  speed: number;
  health: number;
  radius: number;
}

export interface PoliceCar extends Point {
  id: number;
  angle: number;
  speed: number;
  radius: number;
  contactCooldown: number;
}

export interface TrafficCar extends Point {
  id: number;
  angle: number;
  speed: number;
  radius: number;
  route: number;
  target: number;
  nearMissReady: boolean;
  contactCooldown: number;
  color: string;
}

export interface Breakable extends Point {
  id: number;
  kind: "cone" | "crate" | "hydrant";
  alive: boolean;
  value: number;
}

export interface Ramp extends Point {
  id: number;
  angle: number;
  armed: boolean;
}

export interface RunStats {
  nearMisses: number;
  jumps: number;
  destroyed: number;
  escapes: number;
}

export interface GameState {
  phase: Phase;
  mode: PlayerMode;
  foot: Point;
  car: Car;
  packagePosition: Point;
  deliveryPosition: Point;
  cops: PoliceCar[];
  traffic: TrafficCar[];
  breakables: Breakable[];
  ramps: Ramp[];
  score: number;
  heat: number;
  maxHeatReached: number;
  timeLeft: number;
  elapsed: number;
  deliveryElapsed: number;
  arrestProgress: number;
  escapeProgress: number;
  jumpTimer: number;
  impactFlash: number;
  actionHeld: boolean;
  callout: string;
  calloutDetail: string;
  calloutTimer: number;
  resultReason: string;
  stats: RunStats;
}

const BLOCK_X: Array<[number, number]> = [
  [0, 182],
  [418, 782],
  [1018, 1382],
  [1618, 1982],
  [2218, WORLD_WIDTH],
];

const BLOCK_Y: Array<[number, number]> = [
  [0, 182],
  [418, 782],
  [1018, 1382],
  [1618, WORLD_HEIGHT],
];

function buildCity(): Building[] {
  const buildings: Building[] = [];
  let id = 0;

  for (const [x1, x2] of BLOCK_X) {
    for (const [y1, y2] of BLOCK_Y) {
      const width = x2 - x1;
      const height = y2 - y1;
      const alley = width > 220 && height > 220 ? 58 : 34;
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      const inset = 12;
      const leftWidth = centerX - alley / 2 - x1 - inset * 2;
      const rightWidth = x2 - (centerX + alley / 2) - inset * 2;
      const topHeight = centerY - alley / 2 - y1 - inset * 2;
      const bottomHeight = y2 - (centerY + alley / 2) - inset * 2;
      const pieces = [
        {
          x: x1 + inset,
          y: y1 + inset,
          width: leftWidth,
          height: topHeight,
        },
        {
          x: centerX + alley / 2 + inset,
          y: y1 + inset,
          width: rightWidth,
          height: topHeight,
        },
        {
          x: x1 + inset,
          y: centerY + alley / 2 + inset,
          width: leftWidth,
          height: bottomHeight,
        },
        {
          x: centerX + alley / 2 + inset,
          y: centerY + alley / 2 + inset,
          width: rightWidth,
          height: bottomHeight,
        },
      ];

      for (const piece of pieces) {
        if (piece.width > 28 && piece.height > 28) {
          buildings.push({ ...piece, id });
          id += 1;
        }
      }
    }
  }

  return buildings;
}

export const BUILDINGS = buildCity();

export const CITY_BLOCKS = {
  x: BLOCK_X,
  y: BLOCK_Y,
};

const TRAFFIC_ROUTES: Point[][] = [
  [
    { x: 300, y: 300 },
    { x: 2100, y: 300 },
    { x: 2100, y: 1500 },
    { x: 300, y: 1500 },
  ],
  [
    { x: 1500, y: 300 },
    { x: 1500, y: 1500 },
    { x: 900, y: 1500 },
    { x: 900, y: 300 },
  ],
  [
    { x: 300, y: 900 },
    { x: 2100, y: 900 },
    { x: 2100, y: 300 },
    { x: 300, y: 300 },
  ],
];

const TRAFFIC_COLORS = [
  "#58c9d6",
  "#f4bd50",
  "#b54f5f",
  "#e8e2cf",
  "#7dbf83",
  "#a985d6",
];

const INITIAL_BREAKABLES: Breakable[] = [
  { id: 0, x: 520, y: 842, kind: "cone", alive: true, value: 50 },
  { id: 1, x: 565, y: 842, kind: "cone", alive: true, value: 50 },
  { id: 2, x: 610, y: 842, kind: "cone", alive: true, value: 50 },
  { id: 3, x: 1025, y: 944, kind: "crate", alive: true, value: 90 },
  { id: 4, x: 1060, y: 944, kind: "crate", alive: true, value: 90 },
  { id: 5, x: 1370, y: 470, kind: "hydrant", alive: true, value: 120 },
  { id: 6, x: 1965, y: 970, kind: "hydrant", alive: true, value: 120 },
  { id: 7, x: 725, y: 1345, kind: "crate", alive: true, value: 90 },
  { id: 8, x: 760, y: 1345, kind: "crate", alive: true, value: 90 },
  { id: 9, x: 1735, y: 1425, kind: "cone", alive: true, value: 50 },
  { id: 10, x: 1780, y: 1425, kind: "cone", alive: true, value: 50 },
  { id: 11, x: 1825, y: 1425, kind: "cone", alive: true, value: 50 },
  { id: 12, x: 1160, y: 725, kind: "hydrant", alive: true, value: 120 },
  { id: 13, x: 2250, y: 1110, kind: "crate", alive: true, value: 90 },
  { id: 14, x: 2285, y: 1110, kind: "crate", alive: true, value: 90 },
  { id: 15, x: 445, y: 1670, kind: "cone", alive: true, value: 50 },
  { id: 16, x: 490, y: 1670, kind: "cone", alive: true, value: 50 },
];

const INITIAL_RAMPS: Ramp[] = [
  { id: 0, x: 900, y: 655, angle: Math.PI / 2, armed: true },
  { id: 1, x: 1290, y: 900, angle: 0, armed: true },
  { id: 2, x: 1500, y: 1190, angle: Math.PI / 2, armed: true },
];

function createTraffic(): TrafficCar[] {
  const placements = [
    { route: 0, target: 1, x: 650, y: 300 },
    { route: 0, target: 2, x: 2100, y: 620 },
    { route: 0, target: 3, x: 1720, y: 1500 },
    { route: 0, target: 0, x: 300, y: 1190 },
    { route: 1, target: 1, x: 1500, y: 610 },
    { route: 1, target: 2, x: 1270, y: 1500 },
    { route: 1, target: 3, x: 900, y: 1110 },
    { route: 2, target: 1, x: 1160, y: 900 },
    { route: 2, target: 2, x: 2100, y: 650 },
    { route: 2, target: 3, x: 1280, y: 300 },
  ];

  return placements.map((placement, index) => {
    const target = TRAFFIC_ROUTES[placement.route][placement.target];
    return {
      id: index,
      x: placement.x,
      y: placement.y,
      route: placement.route,
      target: placement.target,
      angle: Math.atan2(target.y - placement.y, target.x - placement.x),
      speed: 118 + (index % 4) * 11,
      radius: 21,
      nearMissReady: true,
      contactCooldown: 0,
      color: TRAFFIC_COLORS[index % TRAFFIC_COLORS.length],
    };
  });
}

export function createGameState(): GameState {
  return {
    phase: "findCar",
    mode: "foot",
    foot: { x: 248, y: 650 },
    car: {
      x: 300,
      y: 560,
      angle: -Math.PI / 2,
      speed: 0,
      health: 100,
      radius: 24,
    },
    packagePosition: { x: 2100, y: 300 },
    deliveryPosition: { x: 300, y: 1500 },
    cops: [],
    traffic: createTraffic(),
    breakables: INITIAL_BREAKABLES.map((item) => ({ ...item })),
    ramps: INITIAL_RAMPS.map((item) => ({ ...item })),
    score: 0,
    heat: 0,
    maxHeatReached: 0,
    timeLeft: 150,
    elapsed: 0,
    deliveryElapsed: 0,
    arrestProgress: 0,
    escapeProgress: 0,
    jumpTimer: 0,
    impactFlash: 0,
    actionHeld: false,
    callout: "FIND A RIDE",
    calloutDetail: "Get close and press E",
    calloutTimer: 3.4,
    resultReason: "",
    stats: {
      nearMisses: 0,
      jumps: 0,
      destroyed: 0,
      escapes: 0,
    },
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function objectiveForPhase(phase: Phase): string {
  switch (phase) {
    case "findCar":
      return "Steal the marked ride";
    case "pickup":
      return "Grab the package";
    case "deliver":
      return "Deliver to the safehouse";
    case "won":
      return "Package delivered";
    case "busted":
      return "Run over";
  }
}

export function stepGame(
  state: GameState,
  input: GameInput,
  deltaSeconds: number,
): void {
  const dt = Math.min(Math.max(deltaSeconds, 0), 0.04);

  state.calloutTimer = Math.max(0, state.calloutTimer - dt);
  state.impactFlash = Math.max(0, state.impactFlash - dt);
  state.jumpTimer = Math.max(0, state.jumpTimer - dt);

  if (state.phase === "won" || state.phase === "busted") {
    state.actionHeld = input.action;
    return;
  }

  state.elapsed += dt;
  state.timeLeft = Math.max(0, state.timeLeft - dt);

  const actionPressed = input.action && !state.actionHeld;
  state.actionHeld = input.action;

  updateTraffic(state, dt);

  if (state.mode === "foot") {
    updateFoot(state, input, dt);
    if (actionPressed && distance(state.foot, state.car) < 82) {
      state.mode = "car";
      state.phase = "pickup";
      state.score += 100;
      setCallout(state, "RIDE ACQUIRED", "Package marked across town");
    }
  } else {
    updatePlayerCar(state, input, dt);
    updateBreakables(state);
    updateRamps(state, dt);
    updateTrafficContacts(state, dt);

    if (
      state.phase === "pickup" &&
      distance(state.car, state.packagePosition) < 64
    ) {
      state.phase = "deliver";
      state.heat = 1;
      state.maxHeatReached = 1;
      state.score += 500;
      state.deliveryElapsed = 0;
      syncPolice(state);
      setCallout(
        state,
        "PACKAGE SECURED",
        "Lose the heat. Reach the safehouse.",
      );
    }

    if (state.phase === "deliver") {
      state.deliveryElapsed += dt;
      updateHeat(state);
      updatePolice(state, dt);

      if (distance(state.car, state.deliveryPosition) < 76) {
        state.phase = "won";
        state.score += 2000 + Math.floor(state.timeLeft * 20);
        state.car.speed *= 0.35;
        state.callout = "DROP COMPLETE";
        state.calloutDetail = "Clean work";
        state.calloutTimer = 99;
      }
    }
  }

  if (state.mode === "car" && Math.abs(state.car.speed) > 260) {
    state.score += Math.floor(dt * 24);
  }

  if (state.timeLeft <= 0) {
    endRun(state, "TIME UP");
  } else if (state.car.health <= 0) {
    endRun(state, "RIDE WRECKED");
  }
}

function updateFoot(state: GameState, input: GameInput, dt: number): void {
  const xAxis = Number(input.right) - Number(input.left);
  const yAxis = Number(input.down) - Number(input.up);
  const length = Math.hypot(xAxis, yAxis) || 1;
  const speed = 205;
  const previous = { ...state.foot };

  state.foot.x += (xAxis / length) * speed * dt;
  state.foot.y += (yAxis / length) * speed * dt;
  clampToWorld(state.foot, 13);

  if (hitsAnyBuilding(state.foot.x, state.foot.y, 13)) {
    state.foot = previous;
  }
}

function updatePlayerCar(state: GameState, input: GameInput, dt: number): void {
  const car = state.car;
  const throttle = Number(input.up) - Number(input.down);
  const steering = Number(input.right) - Number(input.left);
  const previous = { x: car.x, y: car.y };
  const speedBeforeImpact = Math.abs(car.speed);

  if (throttle > 0) {
    car.speed += 310 * dt;
  } else if (throttle < 0) {
    car.speed -= car.speed > 20 ? 420 * dt : 190 * dt;
  } else {
    car.speed *= Math.pow(0.985, dt * 60);
  }

  if (input.handbrake) {
    car.speed *= Math.pow(0.966, dt * 60);
  }

  const topSpeed = input.handbrake ? 325 : 370;
  car.speed = clamp(car.speed, -145, topSpeed);
  if (Math.abs(car.speed) < 2) car.speed = 0;

  const steerAuthority = clamp(Math.abs(car.speed) / 125, 0.14, 1);
  const direction = car.speed >= 0 ? 1 : -1;
  const turnRate = input.handbrake ? 3.25 : 2.35;
  car.angle += steering * turnRate * steerAuthority * direction * dt;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  clampToWorld(car, car.radius);

  if (!isDriveableSurface(car.x, car.y)) {
    car.speed *= Math.pow(0.973, dt * 60);
  }

  if (state.jumpTimer <= 0 && hitsAnyBuilding(car.x, car.y, car.radius)) {
    car.x = previous.x;
    car.y = previous.y;
    car.speed *= -0.24;
    const damage = clamp((speedBeforeImpact - 70) * 0.055, 2, 16);
    car.health = Math.max(0, car.health - damage);
    state.impactFlash = 0.2;
    setCallout(
      state,
      "HARD HIT",
      `Ride integrity ${Math.ceil(car.health)}%`,
      1.2,
    );
  }
}

function updateBreakables(state: GameState): void {
  if (state.jumpTimer > 0 || Math.abs(state.car.speed) < 85) return;

  for (const item of state.breakables) {
    if (!item.alive || distance(item, state.car) > 36) continue;
    item.alive = false;
    state.score += item.value;
    state.stats.destroyed += 1;
    setCallout(
      state,
      item.kind === "hydrant" ? "CITY PRESSURE" : "SMASH BONUS",
      `+${item.value}`,
      0.8,
    );
  }
}

function updateRamps(state: GameState, dt: number): void {
  for (const ramp of state.ramps) {
    const proximity = distance(ramp, state.car);
    if (proximity > 95) ramp.armed = true;

    if (
      ramp.armed &&
      proximity < 44 &&
      Math.abs(state.car.speed) > 175 &&
      state.jumpTimer <= 0
    ) {
      ramp.armed = false;
      state.jumpTimer = 0.84;
      state.score += 300;
      state.stats.jumps += 1;
      setCallout(state, "AIRBORNE", "+300 jump", 1.1);
    }
  }

  if (state.jumpTimer > 0) {
    state.car.speed *= Math.pow(0.998, dt * 60);
  }
}

function updateTraffic(state: GameState, dt: number): void {
  for (const car of state.traffic) {
    const route = TRAFFIC_ROUTES[car.route];
    const target = route[car.target];
    const targetAngle = Math.atan2(target.y - car.y, target.x - car.x);
    const difference = normalizeAngle(targetAngle - car.angle);

    car.angle += clamp(difference, -2.2 * dt, 2.2 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.contactCooldown = Math.max(0, car.contactCooldown - dt);

    if (distance(car, target) < 54) {
      car.target = (car.target + 1) % route.length;
    }
  }
}

function updateTrafficContacts(state: GameState, dt: number): void {
  for (const traffic of state.traffic) {
    const gap = distance(state.car, traffic);

    if (gap > 145) traffic.nearMissReady = true;

    if (
      traffic.nearMissReady &&
      gap > state.car.radius + traffic.radius &&
      gap < 62 &&
      Math.abs(state.car.speed) > 205
    ) {
      traffic.nearMissReady = false;
      state.stats.nearMisses += 1;
      state.score += 180;
      setCallout(state, "NEAR MISS", "+180 nerve bonus", 0.9);
    }

    if (
      state.jumpTimer <= 0 &&
      gap < state.car.radius + traffic.radius &&
      traffic.contactCooldown <= 0
    ) {
      traffic.contactCooldown = 0.75;
      state.car.health = Math.max(
        0,
        state.car.health - clamp(Math.abs(state.car.speed) * 0.035, 3, 13),
      );
      state.car.speed *= 0.58;
      state.impactFlash = 0.18;
    }
  }

  if (state.car.health > 0) {
    state.car.health = Math.min(100, state.car.health + dt * 0.14);
  }
}

function updateHeat(state: GameState): void {
  let targetHeat = 1;
  if (state.deliveryElapsed > 24) targetHeat = 2;
  if (state.deliveryElapsed > 52) targetHeat = 3;

  if (targetHeat > state.maxHeatReached) {
    state.maxHeatReached = targetHeat;
    state.heat = targetHeat;
    syncPolice(state);
    setCallout(
      state,
      `HEAT LEVEL ${targetHeat}`,
      targetHeat === 3 ? "Heavy units inbound" : "More units joining",
      1.6,
    );
  }
}

function updatePolice(state: GameState, dt: number): void {
  let nearest = Number.POSITIVE_INFINITY;

  for (const cop of state.cops) {
    cop.contactCooldown = Math.max(0, cop.contactCooldown - dt);
    const targetAngle = Math.atan2(state.car.y - cop.y, state.car.x - cop.x);
    const difference = normalizeAngle(targetAngle - cop.angle);
    const gap = distance(cop, state.car);
    nearest = Math.min(nearest, gap);

    const turnSpeed = 2.1 + state.heat * 0.28;
    cop.angle += clamp(difference, -turnSpeed * dt, turnSpeed * dt);
    const desiredSpeed = 205 + state.heat * 43 + Math.min(gap * 0.05, 35);
    cop.speed += clamp(desiredSpeed - cop.speed, -260 * dt, 210 * dt);

    const previous = { x: cop.x, y: cop.y };
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;

    if (hitsAnyBuilding(cop.x, cop.y, cop.radius)) {
      cop.x = previous.x;
      cop.y = previous.y;
      cop.angle += (cop.id % 2 === 0 ? 1 : -1) * 0.62;
      cop.speed *= 0.55;
    }

    clampToWorld(cop, cop.radius);

    if (
      state.jumpTimer <= 0 &&
      gap < state.car.radius + cop.radius + 4 &&
      cop.contactCooldown <= 0
    ) {
      cop.contactCooldown = 0.65;
      state.car.health = Math.max(0, state.car.health - 7 - state.heat * 1.5);
      state.car.speed *= 0.72;
      state.impactFlash = 0.22;
    }
  }

  if (nearest < 58 && Math.abs(state.car.speed) < 48) {
    state.arrestProgress += dt;
    if (state.arrestProgress > 2.35) {
      endRun(state, "BUSTED");
    }
  } else {
    state.arrestProgress = Math.max(0, state.arrestProgress - dt * 1.8);
  }

  if (nearest > 525 && state.heat > 1) {
    state.escapeProgress += dt;
    if (state.escapeProgress > 5.5) {
      state.heat -= 1;
      state.cops.length = state.heat * 2;
      state.escapeProgress = 0;
      state.score += 450;
      state.stats.escapes += 1;
      setCallout(state, "HEAT LOST", "+450 getaway bonus", 1.4);
    }
  } else {
    state.escapeProgress = Math.max(0, state.escapeProgress - dt * 0.6);
  }
}

function syncPolice(state: GameState): void {
  const spawnOffsets: Point[] = [
    { x: -360, y: 0 },
    { x: 0, y: 360 },
    { x: 360, y: 0 },
    { x: 0, y: -360 },
    { x: -460, y: 180 },
    { x: 450, y: -190 },
  ];
  const desired = state.heat * 2;

  while (state.cops.length < desired) {
    const id = state.cops.length;
    const offset = spawnOffsets[id % spawnOffsets.length];
    const x = clamp(state.car.x + offset.x, 40, WORLD_WIDTH - 40);
    const y = clamp(state.car.y + offset.y, 40, WORLD_HEIGHT - 40);
    state.cops.push({
      id,
      x,
      y,
      angle: Math.atan2(state.car.y - y, state.car.x - x),
      speed: 150 + id * 7,
      radius: 25,
      contactCooldown: 0,
    });
  }
}

function endRun(state: GameState, reason: string): void {
  if (state.phase === "won" || state.phase === "busted") return;
  state.phase = "busted";
  state.resultReason = reason;
  state.car.speed *= 0.2;
  state.callout = reason;
  state.calloutDetail = "Run it back";
  state.calloutTimer = 99;
}

function setCallout(
  state: GameState,
  title: string,
  detail: string,
  duration = 1.8,
): void {
  state.callout = title;
  state.calloutDetail = detail;
  state.calloutTimer = duration;
}

function isDriveableSurface(x: number, y: number): boolean {
  if (
    ROAD_X.some((roadX) => Math.abs(x - roadX) < ROAD_WIDTH / 2) ||
    ROAD_Y.some((roadY) => Math.abs(y - roadY) < ROAD_WIDTH / 2)
  ) {
    return true;
  }

  for (const [x1, x2] of BLOCK_X) {
    if (x < x1 || x > x2) continue;
    for (const [y1, y2] of BLOCK_Y) {
      if (y < y1 || y > y2) continue;
      const alley = x2 - x1 > 220 && y2 - y1 > 220 ? 58 : 34;
      return (
        Math.abs(x - (x1 + x2) / 2) < alley / 2 ||
        Math.abs(y - (y1 + y2) / 2) < alley / 2
      );
    }
  }

  return false;
}

function hitsAnyBuilding(x: number, y: number, radius: number): boolean {
  return BUILDINGS.some((building) =>
    circleIntersectsRect(x, y, radius, building),
  );
}

function circleIntersectsRect(
  x: number,
  y: number,
  radius: number,
  rect: Rect,
): boolean {
  const closestX = clamp(x, rect.x, rect.x + rect.width);
  const closestY = clamp(y, rect.y, rect.y + rect.height);
  return Math.hypot(x - closestX, y - closestY) < radius;
}

function clampToWorld(point: Point, radius: number): void {
  point.x = clamp(point.x, radius, WORLD_WIDTH - radius);
  point.y = clamp(point.y, radius, WORLD_HEIGHT - radius);
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
