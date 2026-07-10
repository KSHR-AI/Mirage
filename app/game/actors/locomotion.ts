import type { InputFrame, Vec3 } from "../core/contracts";

export const LOCOMOTION_TUNING = {
  walkSpeed: 4.2,
  sprintSpeed: 7.2,
  jumpVelocity: 7.2,
  inputDeadzone: 0.1,
} as const;

export interface LocomotionState {
  readonly grounded: boolean;
  readonly sprinting: boolean;
  readonly jumping: boolean;
}

export const INITIAL_LOCOMOTION_STATE: LocomotionState = {
  grounded: true,
  sprinting: false,
  jumping: false,
};

export interface LocomotionObservation {
  readonly grounded: boolean;
  readonly cameraYaw: number;
}

export interface LocomotionIntent {
  readonly moveDirection: Vec3;
  readonly moveMagnitude: number;
  readonly horizontalVelocity: Vec3;
  readonly facingRotationY?: number;
  readonly jumpVelocity: number;
}

export interface LocomotionStepResult {
  readonly state: LocomotionState;
  readonly intent: LocomotionIntent;
}

type LocomotionInput = Pick<
  InputFrame,
  "move" | "sprint" | "aim" | "jumpPressed"
>;

function normalizedAxis(value: number) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function stationaryIntent(jumpVelocity: number): LocomotionIntent {
  return {
    moveDirection: [0, 0, 0],
    moveMagnitude: 0,
    horizontalVelocity: [0, 0, 0],
    jumpVelocity,
  };
}

export function stepGroundedLocomotion(
  previous: LocomotionState,
  input: LocomotionInput,
  observation: LocomotionObservation,
): LocomotionStepResult {
  if (!Number.isFinite(observation.cameraYaw)) {
    throw new RangeError("cameraYaw must be finite");
  }

  const localX = normalizedAxis(input.move[0]);
  const localZ = normalizedAxis(input.move[1]);
  const rawMagnitude = Math.hypot(localX, localZ);
  const moveMagnitude =
    rawMagnitude <= LOCOMOTION_TUNING.inputDeadzone
      ? 0
      : Math.min(rawMagnitude, 1);
  const jumpStarted = observation.grounded && input.jumpPressed;
  const jumping = jumpStarted || (!observation.grounded && previous.jumping);
  const grounded = jumpStarted ? false : observation.grounded;
  const sprinting =
    observation.grounded &&
    moveMagnitude > 0 &&
    input.sprint &&
    !input.aim &&
    !jumpStarted;
  const state: LocomotionState = { grounded, sprinting, jumping };
  const jumpVelocity = jumpStarted ? LOCOMOTION_TUNING.jumpVelocity : 0;

  if (moveMagnitude === 0) {
    return { state, intent: stationaryIntent(jumpVelocity) };
  }

  const inverseMagnitude = 1 / rawMagnitude;
  const normalizedX = localX * inverseMagnitude;
  const normalizedZ = localZ * inverseMagnitude;
  const sine = Math.sin(observation.cameraYaw);
  const cosine = Math.cos(observation.cameraYaw);
  const worldX = normalizedX * cosine + normalizedZ * sine;
  const worldZ = normalizedZ * cosine - normalizedX * sine;
  const speed = sprinting
    ? LOCOMOTION_TUNING.sprintSpeed
    : LOCOMOTION_TUNING.walkSpeed;

  return {
    state,
    intent: {
      moveDirection: [worldX, 0, worldZ],
      moveMagnitude,
      horizontalVelocity: [
        worldX * speed * moveMagnitude,
        0,
        worldZ * speed * moveMagnitude,
      ],
      facingRotationY: Math.atan2(worldX, worldZ),
      jumpVelocity,
    },
  };
}

export const resolveLocomotionIntent = stepGroundedLocomotion;
