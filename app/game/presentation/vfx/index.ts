export { AfterlightVfx } from "./AfterlightVfx";
export {
  clampUnit,
  effectAgeTicks,
  fadeEnvelope,
  isEffectActive,
  normalizedLifetime,
  pulseEnvelope,
  renderTick,
  wrapPositive,
} from "./lifetime";
export {
  VFX_EVENT_SCAN_LIMIT,
  resolveVfxBudget,
  vfxEventDuration,
  vfxEventQuota,
  visitVfxPool,
  type VfxPoolVisitor,
} from "./pool";
export { hashVfxId, mixVfxSeed, vfxRandom01, vfxSigned } from "./seed";
export type {
  AfterlightVfxEvent,
  AfterlightVfxEventKind,
  AfterlightVfxProps,
  DisabledVehicleVfxSource,
  RainVfxState,
  VfxBudget,
  VfxParticlePool,
} from "./types";
