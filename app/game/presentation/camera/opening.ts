import type { InputFrame } from "../../core/contracts";

export const AFTERLIGHT_OPENING_CINEMATIC_TICKS = 150;

export function hasOpeningCinematicInput(input: InputFrame): boolean {
  return (
    Math.hypot(...input.move) > 0.08 ||
    Math.hypot(...input.look) > 0.08 ||
    Math.abs(input.throttle) > 0.08 ||
    Math.abs(input.steer) > 0.08 ||
    input.brake ||
    input.sprint ||
    input.aim ||
    input.jumpPressed ||
    input.interactPressed ||
    input.firePressed ||
    input.reloadPressed ||
    input.pausePressed
  );
}

export function shouldFinishOpeningCinematic({
  currentTick,
  input,
  reducedMotion,
  startedAtTick,
}: {
  readonly currentTick: number;
  readonly input: InputFrame;
  readonly reducedMotion: boolean;
  readonly startedAtTick: number;
}): boolean {
  if (reducedMotion || hasOpeningCinematicInput(input)) return true;
  const elapsed = Math.max(0, currentTick - startedAtTick);
  return elapsed >= AFTERLIGHT_OPENING_CINEMATIC_TICKS;
}
