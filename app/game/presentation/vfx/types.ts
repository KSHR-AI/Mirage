import type { EntityId, Tick, Vec3 } from "../../core/contracts";
import type { GameQualityTier } from "../../performance";

export type AfterlightVfxEventKind =
  | "tire-smoke"
  | "skid-sparks"
  | "vehicle-impact"
  | "bullet-impact"
  | "explosion"
  | "blackout-pulse"
  | "objective-complete";

export interface AfterlightVfxEvent {
  /** Stable across replay. Newer events preempt older events when a pool is full. */
  readonly id: string | number;
  readonly kind: AfterlightVfxEventKind;
  readonly tick: Tick;
  readonly position: Vec3;
  readonly normal?: Vec3;
  readonly velocity?: Vec3;
  readonly intensity?: number;
  readonly durationTicks?: number;
  /** Optional 0xRRGGBB override for objective or authored set-piece accents. */
  readonly color?: number;
}

export interface DisabledVehicleVfxSource {
  readonly id: EntityId | string;
  readonly position: Vec3;
  readonly intensity?: number;
}

export interface RainVfxState {
  readonly enabled: boolean;
  /** Usually follows the player or camera target in world space. */
  readonly anchor: Vec3;
  readonly intensity?: number;
  readonly wind?: Vec3;
}

export interface AfterlightVfxProps {
  readonly currentTick: Tick;
  readonly alpha?: number;
  readonly events: readonly AfterlightVfxEvent[];
  readonly disabledVehicles?: readonly DisabledVehicleVfxSource[];
  readonly quality?: GameQualityTier;
  readonly reducedMotion?: boolean;
  readonly rain?: RainVfxState;
  readonly seed?: number;
}

export type VfxParticlePool = "smoke" | "spark" | "pulse";

export interface VfxBudget {
  readonly rain: number;
  readonly smoke: number;
  readonly sparks: number;
  readonly pulses: number;
  readonly lights: 0 | 1 | 2;
}
