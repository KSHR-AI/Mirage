import type { Pose } from "../core/contracts";

export const PLAYTEST_INSPECTION_EVENT = "mirage:inspection-pose";

export const PLAYTEST_INSPECTION_POSES: Readonly<Record<string, Pose>> =
  Object.freeze({
    "hero-close": Object.freeze({
      position: Object.freeze([64, 1.4, 58.5] as const),
      rotationY: 0,
    }),
    "hero-aim": Object.freeze({
      position: Object.freeze([64, 1.15, 56] as const),
      rotationY: -0.55,
    }),
    "yard-opening": Object.freeze({
      position: Object.freeze([64, 1.15, 56] as const),
      rotationY: Math.PI,
    }),
    "route-block": Object.freeze({
      position: Object.freeze([0, 1.15, 0] as const),
      rotationY: 0,
    }),
    "route-block-side": Object.freeze({
      position: Object.freeze([2, 1.4, 9.52] as const),
      rotationY: Math.PI / 2,
    }),
    "route-facade": Object.freeze({
      position: Object.freeze([0, 1.4, 7] as const),
      rotationY: 1.1,
    }),
    "signature-corner": Object.freeze({
      position: Object.freeze([0, 1.4, 0] as const),
      rotationY: -0.7,
    }),
    "vehicle-fleet": Object.freeze({
      position: Object.freeze([0, 1.3, 8] as const),
      rotationY: Math.PI,
    }),
    "vehicle-fleet-side": Object.freeze({
      position: Object.freeze([-8, 1.3, 0] as const),
      rotationY: Math.PI / 2,
    }),
  });

export function resolvePlaytestInspectionPose(
  search: string,
  enabled: boolean,
): Pose | null {
  if (!enabled) return null;
  const key = new URLSearchParams(search).get("inspect");
  if (!key) return null;
  return PLAYTEST_INSPECTION_POSES[key] ?? null;
}

export function resolvePlaytestInspectionKey(
  key: string,
  enabled: boolean,
): Pose | null {
  if (!enabled) return null;
  return PLAYTEST_INSPECTION_POSES[key] ?? null;
}

export function isPlaytestAimInspection(
  search: string,
  enabled: boolean,
): boolean {
  return enabled && new URLSearchParams(search).get("inspect") === "hero-aim";
}
