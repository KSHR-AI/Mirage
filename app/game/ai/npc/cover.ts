import type { EntityId, Vec3 } from "../../core/contracts";
import {
  distanceVec3,
  dotVec3,
  normalizeVec3,
  subtractVec3,
  withHeight,
} from "./math";
import { hasLineOfSight, type PhysicsQueryPort } from "./physics-query";

export interface CoverAnchor {
  readonly id: string;
  readonly position: Vec3;
  /** Authored outward direction expected to face incoming threats. */
  readonly normal: Vec3;
  readonly peekPositions?: readonly Vec3[];
  readonly quality?: number;
  readonly tags?: readonly string[];
}

export type CoverSelectionMode = "cover" | "flank";

export interface CoverSelectionRequest {
  readonly actorId: EntityId;
  readonly actorPosition: Vec3;
  readonly threatPosition: Vec3;
  readonly physics: PhysicsQueryPort;
  readonly mode?: CoverSelectionMode;
  readonly maxDistance: number;
  readonly collisionMask?: number;
  readonly eyeHeight?: number;
  readonly requireOcclusion?: boolean;
}

export interface CoverSelection {
  readonly anchor: CoverAnchor;
  readonly peekPosition?: Vec3;
  readonly distance: number;
  readonly score: number;
}

function validateAnchors(
  anchors: readonly CoverAnchor[],
): readonly CoverAnchor[] {
  const ids = new Set<string>();
  const sorted = [...anchors].sort((first, second) =>
    first.id.localeCompare(second.id),
  );
  for (const anchor of sorted) {
    if (!anchor.id || ids.has(anchor.id)) {
      throw new Error(`Cover anchor IDs must be unique: ${anchor.id}`);
    }
    ids.add(anchor.id);
    if (anchor.quality !== undefined && !Number.isFinite(anchor.quality)) {
      throw new RangeError(`Cover anchor ${anchor.id} has invalid quality`);
    }
  }
  return Object.freeze(sorted);
}

/** Reservation-aware index over level-authored anchors. */
export class AuthoredCoverAnchors {
  readonly anchors: readonly CoverAnchor[];
  readonly #byId: ReadonlyMap<string, CoverAnchor>;
  readonly #reservations = new Map<string, EntityId>();

  constructor(anchors: readonly CoverAnchor[]) {
    this.anchors = validateAnchors(anchors);
    this.#byId = new Map(this.anchors.map((anchor) => [anchor.id, anchor]));
  }

  get(anchorId: string): CoverAnchor | undefined {
    return this.#byId.get(anchorId);
  }

  reservedBy(anchorId: string): EntityId | undefined {
    return this.#reservations.get(anchorId);
  }

  reserve(anchorId: string, actorId: EntityId): boolean {
    if (!this.#byId.has(anchorId)) return false;
    const owner = this.#reservations.get(anchorId);
    if (owner !== undefined && owner !== actorId) return false;
    this.releaseByActor(actorId);
    this.#reservations.set(anchorId, actorId);
    return true;
  }

  release(anchorId: string, actorId?: EntityId): void {
    if (actorId === undefined || this.#reservations.get(anchorId) === actorId) {
      this.#reservations.delete(anchorId);
    }
  }

  releaseByActor(actorId: EntityId): void {
    for (const [anchorId, owner] of this.#reservations) {
      if (owner === actorId) this.#reservations.delete(anchorId);
    }
  }

  select(request: CoverSelectionRequest): CoverSelection | null {
    if (!Number.isFinite(request.maxDistance) || request.maxDistance < 0) {
      throw new RangeError("Cover maxDistance must be non-negative and finite");
    }
    const eyeHeight = request.eyeHeight ?? 1.5;
    const threatEye = withHeight(request.threatPosition, eyeHeight);
    const actorToThreat = normalizeVec3(
      subtractVec3(request.threatPosition, request.actorPosition),
    );
    const candidates: CoverSelection[] = [];

    for (const anchor of this.anchors) {
      const owner = this.#reservations.get(anchor.id);
      if (owner !== undefined && owner !== request.actorId) continue;
      const distance = distanceVec3(request.actorPosition, anchor.position);
      if (distance > request.maxDistance) continue;

      const anchorEye = withHeight(anchor.position, eyeHeight);
      const occluded = !hasLineOfSight(request.physics, threatEye, anchorEye, {
        collisionMask: request.collisionMask,
        targetEntityId: request.actorId,
      });
      if ((request.requireOcclusion ?? true) && !occluded) continue;

      const peekPosition = anchor.peekPositions?.find((position) =>
        hasLineOfSight(request.physics, position, threatEye, {
          collisionMask: request.collisionMask,
          sourceEntityId: request.actorId,
        }),
      );
      if (request.mode === "flank" && !peekPosition) continue;

      const facing = dotVec3(
        normalizeVec3(anchor.normal),
        normalizeVec3(subtractVec3(request.threatPosition, anchor.position)),
      );
      const flankOffset = normalizeVec3(
        subtractVec3(anchor.position, request.actorPosition),
      );
      const lateral = 1 - Math.abs(dotVec3(actorToThreat, flankOffset));
      const quality = anchor.quality ?? 1;
      const score =
        quality * 100 +
        facing * 20 +
        (request.mode === "flank" ? lateral * 40 : 0) -
        distance;
      candidates.push({ anchor, peekPosition, distance, score });
    }

    candidates.sort(
      (first, second) =>
        second.score - first.score ||
        first.distance - second.distance ||
        first.anchor.id.localeCompare(second.anchor.id),
    );
    return candidates[0] ?? null;
  }
}
