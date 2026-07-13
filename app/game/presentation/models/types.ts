import type { ThreeElements } from "@react-three/fiber";

export type ModelQuality = "desktop" | "mobile";
export type VisualId = string | number;

export type ModelGroupProps = Omit<ThreeElements["group"], "children" | "ref">;

export type AgentAnimationState =
  | "idle"
  | "walk"
  | "run"
  | "jump"
  | "aim"
  | "fire"
  | "cower"
  | "down";

export interface AgentMotionProps {
  /** Facing yaw in radians. Agent models face +Z at yaw 0. */
  readonly direction?: number;
  /** World-space movement speed in meters per second. */
  readonly speed?: number;
  readonly animation?: AgentAnimationState;
  readonly aim?: boolean;
  readonly aimYaw?: number;
  readonly aimPitch?: number;
  readonly muzzleFlash?: boolean;
}

export interface AgentModelProps extends ModelGroupProps, AgentMotionProps {
  readonly entityId: VisualId;
  readonly quality?: ModelQuality;
}

export interface VehicleModelProps extends ModelGroupProps {
  readonly entityId?: VisualId;
  readonly quality?: ModelQuality;
  /** Normalized steering input in the range -1 to 1. */
  readonly steering?: number;
  /** Wheel rotation in radians, supplied by the presentation adapter. */
  readonly wheelSpin?: number;
  /** Normalized signed cornering load used for chassis presentation. */
  readonly lateralLoad?: number;
  /** Normalized signed acceleration or braking load. */
  readonly longitudinalLoad?: number;
  /** Normalized visual damage in the range 0 to 1. */
  readonly damage?: number;
  readonly disabled?: boolean;
  readonly headlights?: boolean;
  readonly brakeLights?: boolean;
}

export interface PoliceInterceptorModelProps extends VehicleModelProps {
  readonly emergencyLights?: boolean;
  /** Alternating light phase in the range 0 to 1. */
  readonly sirenPhase?: number;
}
