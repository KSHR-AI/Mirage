export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function renderTick(currentTick: number, alpha = 0): number {
  const tick = Number.isFinite(currentTick) ? Math.max(0, currentTick) : 0;
  return tick + clampUnit(alpha);
}

export function effectAgeTicks(
  currentTick: number,
  alpha: number,
  startedAtTick: number,
): number {
  const start = Number.isFinite(startedAtTick) ? startedAtTick : 0;
  return renderTick(currentTick, alpha) - start;
}

export function normalizedLifetime(
  currentTick: number,
  alpha: number,
  startedAtTick: number,
  durationTicks: number,
): number {
  if (!Number.isFinite(durationTicks) || durationTicks <= 0) return 1;
  return clampUnit(
    effectAgeTicks(currentTick, alpha, startedAtTick) / durationTicks,
  );
}

export function isEffectActive(
  currentTick: number,
  alpha: number,
  startedAtTick: number,
  durationTicks: number,
): boolean {
  const age = effectAgeTicks(currentTick, alpha, startedAtTick);
  return age >= 0 && age < durationTicks;
}

export function fadeEnvelope(progress: number): number {
  const value = clampUnit(progress);
  const attack = Math.min(1, value * 8);
  const release = 1 - value * value;
  return attack * release;
}

export function pulseEnvelope(progress: number): number {
  const value = clampUnit(progress);
  return Math.sin(value * Math.PI) ** 0.72;
}

export function wrapPositive(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) {
    return 0;
  }
  return ((value % modulus) + modulus) % modulus;
}
