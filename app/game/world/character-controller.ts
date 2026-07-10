import type { Vec3 } from "../core/contracts";

export interface CharacterGroundSample {
  readonly height: number;
  readonly normal: Vec3;
}

export interface CharacterObstacle {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY?: number;
  readonly maxY?: number;
}

export interface CharacterWorld {
  readonly obstacles: readonly CharacterObstacle[];
  sampleGround(x: number, z: number): CharacterGroundSample | null;
}

export interface CharacterMotorState {
  readonly grounded: boolean;
  readonly jumping: boolean;
  readonly verticalVelocity: number;
  readonly coyoteTicks: number;
  readonly jumpBufferTicks: number;
}

export interface CharacterMotorTuning {
  readonly radius: number;
  readonly halfHeight: number;
  readonly gravity: number;
  readonly terminalVelocity: number;
  readonly jumpVelocity: number;
  readonly coyoteTicks: number;
  readonly jumpBufferTicks: number;
  readonly maxStepHeight: number;
  readonly groundSnapDistance: number;
  readonly minGroundNormalY: number;
}

export interface CharacterMotorRequest {
  readonly position: Vec3;
  readonly horizontalVelocity: Vec3;
  readonly jumpPressed: boolean;
  readonly dt: number;
  readonly previous: CharacterMotorState;
  readonly world: CharacterWorld;
  readonly additionalObstacles?: readonly CharacterObstacle[];
  readonly tuning?: CharacterMotorTuning;
}

export interface CharacterMotorResult {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly groundNormal: Vec3;
  readonly state: CharacterMotorState;
}

export const AFTERLIGHT_CHARACTER_TUNING: CharacterMotorTuning = Object.freeze({
  radius: 0.46,
  halfHeight: 1,
  gravity: -22,
  terminalVelocity: -32,
  jumpVelocity: 7.2,
  coyoteTicks: 6,
  jumpBufferTicks: 6,
  maxStepHeight: 0.38,
  groundSnapDistance: 0.34,
  minGroundNormalY: Math.cos((48 * Math.PI) / 180),
});

export const INITIAL_CHARACTER_MOTOR_STATE: CharacterMotorState = Object.freeze(
  {
    grounded: true,
    jumping: false,
    verticalVelocity: 0,
    coyoteTicks: AFTERLIGHT_CHARACTER_TUNING.coyoteTicks,
    jumpBufferTicks: 0,
  },
);

const UP: Vec3 = Object.freeze([0, 1, 0]);
const EPSILON = 1e-6;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizedGround(
  sample: CharacterGroundSample | null,
): CharacterGroundSample | null {
  if (!sample || !Number.isFinite(sample.height)) return null;
  const [x, y, z] = sample.normal;
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= EPSILON) return null;
  return {
    height: sample.height,
    normal: [x / length, y / length, z / length],
  };
}

function obstacleBlocksHeight(
  obstacle: CharacterObstacle,
  centerY: number,
  tuning: CharacterMotorTuning,
): boolean {
  const bottom = centerY - tuning.halfHeight;
  const top = centerY + tuning.halfHeight;
  return (
    top > (obstacle.minY ?? Number.NEGATIVE_INFINITY) + EPSILON &&
    bottom < (obstacle.maxY ?? Number.POSITIVE_INFINITY) - EPSILON
  );
}

function clampAxisToObstacles(
  axis: "x" | "z",
  start: number,
  other: number,
  requested: number,
  centerY: number,
  obstacles: readonly CharacterObstacle[],
  tuning: CharacterMotorTuning,
): number {
  const delta = requested - start;
  if (Math.abs(delta) <= EPSILON) return start;

  let resolved = requested;
  for (const obstacle of obstacles) {
    if (!obstacleBlocksHeight(obstacle, centerY, tuning)) continue;
    const axisMin =
      (axis === "x" ? obstacle.minX : obstacle.minZ) - tuning.radius;
    const axisMax =
      (axis === "x" ? obstacle.maxX : obstacle.maxZ) + tuning.radius;
    const otherMin =
      (axis === "x" ? obstacle.minZ : obstacle.minX) - tuning.radius;
    const otherMax =
      (axis === "x" ? obstacle.maxZ : obstacle.maxX) + tuning.radius;
    if (other <= otherMin + EPSILON || other >= otherMax - EPSILON) continue;

    const startInside = start > axisMin && start < axisMax;
    const resolvedInside = resolved > axisMin && resolved < axisMax;
    if (!startInside) {
      if (delta > 0 && start <= axisMin && resolved > axisMin) {
        resolved = Math.min(resolved, axisMin);
      } else if (delta < 0 && start >= axisMax && resolved < axisMax) {
        resolved = Math.max(resolved, axisMax);
      }
      continue;
    }
    if (!resolvedInside) continue;

    const center = (axisMin + axisMax) * 0.5;
    const movingDeeper =
      (start <= center && resolved > start) ||
      (start > center && resolved < start);
    if (movingDeeper) resolved = start;
  }
  return resolved;
}

function groundAllowsStep(
  fromHeight: number,
  sample: CharacterGroundSample | null,
  tuning: CharacterMotorTuning,
): boolean {
  return (
    sample == null ||
    (sample.normal[1] >= tuning.minGroundNormalY &&
      sample.height - fromHeight <= tuning.maxStepHeight + EPSILON)
  );
}

function resolveHorizontal(
  position: Vec3,
  velocity: Vec3,
  dt: number,
  supported: boolean,
  startingGround: CharacterGroundSample | null,
  world: CharacterWorld,
  additionalObstacles: readonly CharacterObstacle[],
  tuning: CharacterMotorTuning,
): readonly [number, number] {
  let x = position[0];
  let z = position[2];
  let supportHeight = startingGround?.height ?? position[1];

  const requestedX = x + finiteOr(velocity[0], 0) * dt;
  let resolvedX = clampAxisToObstacles(
    "x",
    x,
    z,
    requestedX,
    position[1],
    world.obstacles,
    tuning,
  );
  resolvedX = clampAxisToObstacles(
    "x",
    x,
    z,
    resolvedX,
    position[1],
    additionalObstacles,
    tuning,
  );
  const xGround = normalizedGround(world.sampleGround(resolvedX, z));
  if (!supported || groundAllowsStep(supportHeight, xGround, tuning)) {
    x = resolvedX;
    if (xGround) supportHeight = xGround.height;
  }

  const requestedZ = z + finiteOr(velocity[2], 0) * dt;
  let resolvedZ = clampAxisToObstacles(
    "z",
    z,
    x,
    requestedZ,
    position[1],
    world.obstacles,
    tuning,
  );
  resolvedZ = clampAxisToObstacles(
    "z",
    z,
    x,
    resolvedZ,
    position[1],
    additionalObstacles,
    tuning,
  );
  const zGround = normalizedGround(world.sampleGround(x, resolvedZ));
  if (!supported || groundAllowsStep(supportHeight, zGround, tuning)) {
    z = resolvedZ;
  }

  return [x, z];
}

function canSnapToGround(
  y: number,
  ground: CharacterGroundSample | null,
  tuning: CharacterMotorTuning,
): boolean {
  if (!ground || ground.normal[1] < tuning.minGroundNormalY) return false;
  const separation = y - ground.height;
  return (
    separation >= -tuning.maxStepHeight - EPSILON &&
    separation <= tuning.groundSnapDistance + EPSILON
  );
}

export function stepKinematicCharacter(
  request: CharacterMotorRequest,
): CharacterMotorResult {
  const tuning = request.tuning ?? AFTERLIGHT_CHARACTER_TUNING;
  const dt = Math.max(0, finiteOr(request.dt, 0));
  const start: Vec3 = [
    finiteOr(request.position[0], 0),
    finiteOr(request.position[1], tuning.halfHeight),
    finiteOr(request.position[2], 0),
  ];
  const startingGround = normalizedGround(
    request.world.sampleGround(start[0], start[2]),
  );
  let grounded =
    request.previous.grounded &&
    canSnapToGround(start[1], startingGround, tuning);
  let coyoteTicks = grounded
    ? tuning.coyoteTicks
    : Math.max(0, request.previous.coyoteTicks - 1);
  let jumpBufferTicks = request.jumpPressed
    ? tuning.jumpBufferTicks
    : Math.max(0, request.previous.jumpBufferTicks - 1);
  let verticalVelocity = grounded
    ? 0
    : finiteOr(request.previous.verticalVelocity, 0);
  let jumping = !grounded && request.previous.jumping;
  let jumpedThisStep = false;

  if (jumpBufferTicks > 0 && (grounded || coyoteTicks > 0)) {
    grounded = false;
    jumping = true;
    jumpedThisStep = true;
    verticalVelocity = tuning.jumpVelocity;
    jumpBufferTicks = 0;
    coyoteTicks = 0;
  }

  const [x, z] = resolveHorizontal(
    start,
    request.horizontalVelocity,
    dt,
    grounded,
    startingGround,
    request.world,
    request.additionalObstacles ?? [],
    tuning,
  );
  const destinationGround = normalizedGround(request.world.sampleGround(x, z));
  let y = start[1];

  if (grounded && canSnapToGround(y, destinationGround, tuning)) {
    y = destinationGround?.height ?? y;
    verticalVelocity = 0;
  } else {
    grounded = false;
    verticalVelocity = Math.max(
      tuning.terminalVelocity,
      verticalVelocity + tuning.gravity * dt,
    );
    y += verticalVelocity * dt;

    if (
      verticalVelocity <= 0 &&
      destinationGround &&
      destinationGround.normal[1] >= tuning.minGroundNormalY &&
      y <= destinationGround.height + tuning.groundSnapDistance &&
      start[1] >= destinationGround.height - tuning.maxStepHeight
    ) {
      y = destinationGround.height;
      grounded = true;
      jumping = false;
      verticalVelocity = 0;
      coyoteTicks = tuning.coyoteTicks;

      if (jumpBufferTicks > 0) {
        grounded = false;
        jumping = true;
        jumpedThisStep = true;
        verticalVelocity = tuning.jumpVelocity;
        jumpBufferTicks = 0;
        coyoteTicks = 0;
        y += verticalVelocity * dt;
      }
    }
  }

  if (grounded) {
    jumping = false;
    coyoteTicks = tuning.coyoteTicks;
  } else if (!jumpedThisStep && !request.previous.jumping) {
    jumping = false;
  }

  const position: Vec3 = [x, y, z];
  const velocity: Vec3 =
    dt > EPSILON
      ? [
          (position[0] - start[0]) / dt,
          (position[1] - start[1]) / dt,
          (position[2] - start[2]) / dt,
        ]
      : [0, 0, 0];

  return {
    position,
    velocity,
    groundNormal: destinationGround?.normal ?? UP,
    state: {
      grounded,
      jumping,
      verticalVelocity,
      coyoteTicks,
      jumpBufferTicks,
    },
  };
}
