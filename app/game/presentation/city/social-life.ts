import type { CityQuality, CityVec3 } from "./types";

export type SocialCivilianBehavior = "conversation" | "crossing" | "waiting";

export interface SocialCivilianDefinition {
  readonly id: number;
  readonly behavior: SocialCivilianBehavior;
  readonly start: CityVec3;
  readonly end: CityVec3;
  readonly facing: number;
  readonly speed: number;
  readonly waitSeconds: number;
  readonly phaseSeconds: number;
  readonly idleLookAmplitude: number;
}

export interface SocialCivilianMotionSample {
  readonly behavior: SocialCivilianBehavior;
  readonly heading: number;
  readonly position: CityVec3;
  readonly walking: boolean;
}

const CONVERSATION_YAW = Math.atan2(0.8, 1.4);

const SOCIAL_CIVILIANS = Object.freeze([
  {
    id: 1200,
    behavior: "conversation",
    start: [-5.2, 0.32, 4.35],
    end: [-5.2, 0.32, 4.35],
    facing: -CONVERSATION_YAW,
    speed: 0,
    waitSeconds: 0,
    phaseSeconds: 0.4,
    idleLookAmplitude: 0.08,
  },
  {
    id: 1201,
    behavior: "conversation",
    start: [-6, 0.32, 5.75],
    end: [-6, 0.32, 5.75],
    facing: Math.PI - CONVERSATION_YAW,
    speed: 0,
    waitSeconds: 0,
    phaseSeconds: 2.1,
    idleLookAmplitude: 0.07,
  },
  {
    id: 1210,
    behavior: "crossing",
    start: [-6.8, 0.32, 6.65],
    end: [6.8, 0.32, 6.65],
    facing: Math.PI / 2,
    speed: 1.08,
    waitSeconds: 4,
    phaseSeconds: 1.5,
    idleLookAmplitude: 0.05,
  },
  {
    id: 1211,
    behavior: "crossing",
    start: [6.65, 0.32, -6.8],
    end: [6.65, 0.32, 6.8],
    facing: 0,
    speed: 1,
    waitSeconds: 5,
    phaseSeconds: 9,
    idleLookAmplitude: 0.05,
  },
  {
    id: 1202,
    behavior: "conversation",
    start: [5.2, 0.32, 10.4],
    end: [5.2, 0.32, 10.4],
    facing: CONVERSATION_YAW,
    speed: 0,
    waitSeconds: 0,
    phaseSeconds: 1.2,
    idleLookAmplitude: 0.09,
  },
  {
    id: 1203,
    behavior: "conversation",
    start: [6, 0.32, 11.8],
    end: [6, 0.32, 11.8],
    facing: Math.PI + CONVERSATION_YAW,
    speed: 0,
    waitSeconds: 0,
    phaseSeconds: 2.8,
    idleLookAmplitude: 0.06,
  },
  {
    id: 1220,
    behavior: "waiting",
    start: [6.05, 0.32, 15],
    end: [6.05, 0.32, 15],
    facing: Math.PI / 2,
    speed: 0,
    waitSeconds: 0,
    phaseSeconds: 3.4,
    idleLookAmplitude: 0.12,
  },
  {
    id: 1221,
    behavior: "waiting",
    start: [-6.05, 0.32, 5.55],
    end: [-6.05, 0.32, 5.55],
    facing: 0,
    speed: 0,
    waitSeconds: 0,
    phaseSeconds: 5.1,
    idleLookAmplitude: 0.11,
  },
] as const satisfies readonly SocialCivilianDefinition[]);

const SOCIAL_COUNTS: Readonly<Record<CityQuality, number>> = Object.freeze({
  mobile: 3,
  desktop: SOCIAL_CIVILIANS.length,
});

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function createSocialCivilianDefinitions(
  quality: CityQuality,
): readonly SocialCivilianDefinition[] {
  return Object.freeze(SOCIAL_CIVILIANS.slice(0, SOCIAL_COUNTS[quality]));
}

export function sampleSocialCivilianMotion(
  definition: SocialCivilianDefinition,
  elapsedSeconds: number,
): SocialCivilianMotionSample {
  const elapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  const dx = definition.end[0] - definition.start[0];
  const dz = definition.end[2] - definition.start[2];
  const distance = Math.hypot(dx, dz);
  const hasPath = distance > 0.01 && definition.speed > 0.01;
  const look =
    Math.sin((elapsed + definition.phaseSeconds) * 0.72) *
    definition.idleLookAmplitude;

  if (!hasPath) {
    return {
      behavior: definition.behavior,
      heading: definition.facing + look,
      position: definition.start,
      walking: false,
    };
  }

  const travelSeconds = distance / definition.speed;
  const waitSeconds = Math.max(0, definition.waitSeconds);
  const halfCycle = waitSeconds + travelSeconds;
  const cycleSeconds = halfCycle * 2;
  const cycleTime = positiveModulo(
    elapsed + definition.phaseSeconds,
    cycleSeconds,
  );
  const forward = cycleTime < halfCycle;
  const legTime = positiveModulo(cycleTime, halfCycle);
  const walking = legTime >= waitSeconds;
  const progress = walking
    ? Math.min(1, (legTime - waitSeconds) / travelSeconds)
    : 0;
  const from = forward ? definition.start : definition.end;
  const to = forward ? definition.end : definition.start;

  return {
    behavior: definition.behavior,
    heading: definition.facing + (forward ? 0 : Math.PI) + (walking ? 0 : look),
    position: [
      from[0] + (to[0] - from[0]) * progress,
      from[1] + (to[1] - from[1]) * progress,
      from[2] + (to[2] - from[2]) * progress,
    ],
    walking,
  };
}
