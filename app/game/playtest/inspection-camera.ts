import type { Pose } from "../core/contracts";

export const PLAYTEST_INSPECTION_POSES: Readonly<Record<string, Pose>> =
  Object.freeze({
    "route-block": Object.freeze({
      position: Object.freeze([6, 1.15, 0] as const),
      rotationY: 0,
    }),
    "route-block-side": Object.freeze({
      position: Object.freeze([2, 1.4, 9.52] as const),
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
