import type { EntityId, Tick, Vec3 } from "../../core/contracts";
import { distanceVec3, withHeight } from "./math";
import { hasLineOfSight, type PhysicsQueryPort } from "./physics-query";

export type ThreatSense = "sight" | "sound" | "damage";

export interface ThreatStimulus {
  readonly id: string;
  readonly position: Vec3;
  readonly sense: ThreatSense;
  readonly severity: number;
  readonly radius: number;
  readonly createdAtTick: Tick;
  readonly expiresAtTick: Tick;
  readonly sourceEntityId?: EntityId;
}

export interface ThreatEvaluationOptions {
  readonly actorId: EntityId;
  readonly actorPosition: Vec3;
  readonly tick: Tick;
  readonly physics?: PhysicsQueryPort;
  readonly collisionMask?: number;
  readonly eyeHeight?: number;
}

export interface EvaluatedThreat {
  readonly stimulus: ThreatStimulus;
  readonly distance: number;
  readonly score: number;
}

function validateBudget(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Perception budget must be a non-negative safe integer",
    );
  }
  return value;
}

/**
 * Stable round-robin scheduling. Selection depends on IDs and the prior cursor,
 * never caller iteration order.
 */
export class PerceptionBudget {
  readonly checksPerTick: number;
  #lastServedId: EntityId | undefined;
  #cachedTick: Tick | undefined;
  #cachedSignature = "";
  #cachedSelection: readonly EntityId[] = Object.freeze([]);

  constructor(checksPerTick: number) {
    this.checksPerTick = validateBudget(checksPerTick);
  }

  select(tick: Tick, actorIds: Iterable<EntityId>): readonly EntityId[] {
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new RangeError(
        "Perception tick must be a non-negative safe integer",
      );
    }

    const ids = [...new Set(actorIds)].sort((first, second) => first - second);
    const signature = ids.join(",");
    if (this.#cachedTick === tick && this.#cachedSignature === signature) {
      return this.#cachedSelection;
    }
    if (ids.length === 0 || this.checksPerTick === 0) {
      return this.#cache(tick, signature, []);
    }

    let start = 0;
    if (this.#lastServedId !== undefined) {
      const nextIndex = ids.findIndex(
        (id) => id > (this.#lastServedId as number),
      );
      start = nextIndex < 0 ? 0 : nextIndex;
    }
    const count = Math.min(this.checksPerTick, ids.length);
    const selected = Array.from(
      { length: count },
      (_, offset) => ids[(start + offset) % ids.length] as EntityId,
    );
    this.#lastServedId = selected.at(-1);
    return this.#cache(tick, signature, selected);
  }

  reset(): void {
    this.#lastServedId = undefined;
    this.#cachedTick = undefined;
    this.#cachedSignature = "";
    this.#cachedSelection = Object.freeze([]);
  }

  #cache(
    tick: Tick,
    signature: string,
    selected: readonly EntityId[],
  ): readonly EntityId[] {
    this.#cachedTick = tick;
    this.#cachedSignature = signature;
    this.#cachedSelection = Object.freeze([...selected]);
    return this.#cachedSelection;
  }
}

export function evaluateThreats(
  stimuli: readonly ThreatStimulus[],
  options: ThreatEvaluationOptions,
): EvaluatedThreat | null {
  const eyeHeight = options.eyeHeight ?? 1.6;
  const candidates: EvaluatedThreat[] = [];

  for (const stimulus of stimuli) {
    if (
      options.tick < stimulus.createdAtTick ||
      options.tick > stimulus.expiresAtTick ||
      !Number.isFinite(stimulus.severity) ||
      stimulus.severity <= 0 ||
      !Number.isFinite(stimulus.radius) ||
      stimulus.radius < 0
    ) {
      continue;
    }
    const distance = distanceVec3(options.actorPosition, stimulus.position);
    if (distance > stimulus.radius) continue;
    if (
      stimulus.sense === "sight" &&
      options.physics &&
      !hasLineOfSight(
        options.physics,
        withHeight(options.actorPosition, eyeHeight),
        withHeight(stimulus.position, eyeHeight),
        {
          collisionMask: options.collisionMask,
          sourceEntityId: options.actorId,
          targetEntityId: stimulus.sourceEntityId,
        },
      )
    ) {
      continue;
    }

    candidates.push({
      stimulus,
      distance,
      score: stimulus.severity * 1_000 + (stimulus.radius - distance),
    });
  }

  candidates.sort(
    (first, second) =>
      second.score - first.score ||
      first.distance - second.distance ||
      first.stimulus.id.localeCompare(second.stimulus.id),
  );
  return candidates[0] ?? null;
}
