import { effectAgeTicks, isEffectActive, normalizedLifetime } from "./lifetime";
import type {
  AfterlightVfxEvent,
  AfterlightVfxEventKind,
  VfxBudget,
  VfxParticlePool,
} from "./types";

export const VFX_EVENT_SCAN_LIMIT = 64 as const;

const STANDARD_BUDGETS = Object.freeze({
  low: Object.freeze({ rain: 16, smoke: 8, sparks: 10, pulses: 2, lights: 0 }),
  medium: Object.freeze({
    rain: 30,
    smoke: 14,
    sparks: 26,
    pulses: 4,
    lights: 1,
  }),
  high: Object.freeze({
    rain: 52,
    smoke: 24,
    sparks: 46,
    pulses: 6,
    lights: 2,
  }),
} as const satisfies Readonly<Record<string, VfxBudget>>);

const REDUCED_MOTION_BUDGETS = Object.freeze({
  low: Object.freeze({ rain: 5, smoke: 4, sparks: 4, pulses: 1, lights: 0 }),
  medium: Object.freeze({
    rain: 8,
    smoke: 6,
    sparks: 8,
    pulses: 2,
    lights: 0,
  }),
  high: Object.freeze({
    rain: 12,
    smoke: 8,
    sparks: 12,
    pulses: 2,
    lights: 0,
  }),
} as const satisfies Readonly<Record<string, VfxBudget>>);

const DEFAULT_DURATIONS: Readonly<Record<AfterlightVfxEventKind, number>> =
  Object.freeze({
    "tire-smoke": 48,
    "skid-sparks": 20,
    "vehicle-impact": 30,
    "bullet-impact": 18,
    explosion: 78,
    "blackout-pulse": 60,
    "objective-complete": 66,
  });

const EVENT_QUOTAS: Readonly<
  Record<AfterlightVfxEventKind, Readonly<Record<VfxParticlePool, number>>>
> = Object.freeze({
  "tire-smoke": Object.freeze({ smoke: 4, spark: 0, pulse: 0 }),
  "skid-sparks": Object.freeze({ smoke: 0, spark: 5, pulse: 0 }),
  "vehicle-impact": Object.freeze({ smoke: 0, spark: 8, pulse: 1 }),
  "bullet-impact": Object.freeze({ smoke: 0, spark: 4, pulse: 0 }),
  explosion: Object.freeze({ smoke: 8, spark: 14, pulse: 2 }),
  "blackout-pulse": Object.freeze({ smoke: 0, spark: 10, pulse: 2 }),
  "objective-complete": Object.freeze({ smoke: 0, spark: 12, pulse: 2 }),
});

export type VfxPoolVisitor = (
  event: AfterlightVfxEvent,
  ordinal: number,
  slot: number,
  ageTicks: number,
  progress: number,
) => void;

export function resolveVfxBudget(
  quality: "low" | "medium" | "high",
  reducedMotion: boolean,
): VfxBudget {
  return reducedMotion
    ? REDUCED_MOTION_BUDGETS[quality]
    : STANDARD_BUDGETS[quality];
}

export function vfxEventDuration(event: AfterlightVfxEvent): number {
  return event.durationTicks !== undefined &&
    Number.isFinite(event.durationTicks) &&
    event.durationTicks > 0
    ? Math.max(1, Math.floor(event.durationTicks))
    : DEFAULT_DURATIONS[event.kind];
}

export function vfxEventQuota(
  kind: AfterlightVfxEventKind,
  pool: VfxParticlePool,
  intensity = 1,
  reducedMotion = false,
): number {
  const safeIntensity = Number.isFinite(intensity)
    ? Math.min(2, Math.max(0, intensity))
    : 1;
  const motionScale = reducedMotion ? 0.5 : 1;
  return Math.max(
    0,
    Math.ceil(EVENT_QUOTAS[kind][pool] * safeIntensity * motionScale),
  );
}

/**
 * Visits newest active events first without allocating a transient slot array.
 * The caller can write directly into a fixed-capacity GPU instance pool.
 */
export function visitVfxPool(
  events: readonly AfterlightVfxEvent[],
  pool: VfxParticlePool,
  capacity: number,
  currentTick: number,
  alpha: number,
  reducedMotion: boolean,
  visitor: VfxPoolVisitor,
): number {
  const boundedCapacity = Math.max(0, Math.floor(capacity));
  const firstEventIndex = Math.max(0, events.length - VFX_EVENT_SCAN_LIMIT);
  let slot = 0;

  for (let index = events.length - 1; index >= firstEventIndex; index -= 1) {
    if (slot >= boundedCapacity) break;
    const event = events[index];
    const duration = vfxEventDuration(event);
    if (!isEffectActive(currentTick, alpha, event.tick, duration)) continue;

    const quota = vfxEventQuota(
      event.kind,
      pool,
      event.intensity,
      reducedMotion,
    );
    const count = Math.min(quota, boundedCapacity - slot);
    const ageTicks = effectAgeTicks(currentTick, alpha, event.tick);
    const progress = normalizedLifetime(
      currentTick,
      alpha,
      event.tick,
      duration,
    );

    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      visitor(event, ordinal, slot, ageTicks, progress);
      slot += 1;
    }
  }

  return slot;
}
