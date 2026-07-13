import type { EntityId, Tick } from "../../core/contracts";

export interface ShooterRequest {
  readonly shooterId: EntityId;
  readonly priority: number;
  readonly holdTicks: number;
}

interface ShooterLease {
  readonly shooterId: EntityId;
  readonly untilTick: Tick;
}

function validateTick(tick: Tick): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError("Shooter coordinator tick must be non-negative");
  }
}

/** Deterministic, fair leases cap overlapping bursts across a hostile squad. */
export class ShooterCoordinator {
  readonly maxSimultaneousShooters: number;
  readonly #leases = new Map<EntityId, ShooterLease>();
  readonly #lastGrantedTick = new Map<EntityId, Tick>();

  constructor(maxSimultaneousShooters: number) {
    if (
      !Number.isSafeInteger(maxSimultaneousShooters) ||
      maxSimultaneousShooters < 0
    ) {
      throw new RangeError("Shooter limit must be a non-negative safe integer");
    }
    this.maxSimultaneousShooters = maxSimultaneousShooters;
  }

  coordinate(
    tick: Tick,
    requests: readonly ShooterRequest[],
  ): ReadonlySet<EntityId> {
    validateTick(tick);
    const byId = new Map<EntityId, ShooterRequest>();
    for (const request of requests) {
      if (!Number.isFinite(request.priority)) {
        throw new RangeError("Shooter priority must be finite");
      }
      if (!Number.isSafeInteger(request.holdTicks) || request.holdTicks <= 0) {
        throw new RangeError(
          "Shooter holdTicks must be a positive safe integer",
        );
      }
      const existing = byId.get(request.shooterId);
      if (
        !existing ||
        request.priority > existing.priority ||
        (request.priority === existing.priority &&
          request.holdTicks > existing.holdTicks)
      ) {
        byId.set(request.shooterId, request);
      }
    }

    for (const [shooterId, lease] of this.#leases) {
      if (lease.untilTick < tick || !byId.has(shooterId)) {
        this.#leases.delete(shooterId);
      }
    }

    const retained = [...this.#leases.keys()]
      .sort((first, second) => first - second)
      .slice(0, this.maxSimultaneousShooters);
    this.#leases.clear();
    for (const shooterId of retained) {
      const request = byId.get(shooterId) as ShooterRequest;
      this.#leases.set(shooterId, {
        shooterId,
        untilTick: tick + request.holdTicks - 1,
      });
    }

    const available = this.maxSimultaneousShooters - this.#leases.size;
    const waiting = [...byId.values()]
      .filter((request) => !this.#leases.has(request.shooterId))
      .sort(
        (first, second) =>
          second.priority - first.priority ||
          (this.#lastGrantedTick.get(first.shooterId) ?? -1) -
            (this.#lastGrantedTick.get(second.shooterId) ?? -1) ||
          first.shooterId - second.shooterId,
      );
    for (const request of waiting.slice(0, available)) {
      this.#leases.set(request.shooterId, {
        shooterId: request.shooterId,
        untilTick: tick + request.holdTicks - 1,
      });
      this.#lastGrantedTick.set(request.shooterId, tick);
    }

    return new Set(
      [...this.#leases.keys()].sort((first, second) => first - second),
    );
  }

  release(shooterId: EntityId): void {
    this.#leases.delete(shooterId);
  }

  clear(): void {
    this.#leases.clear();
    this.#lastGrantedTick.clear();
  }

  activeShooters(): readonly EntityId[] {
    return Object.freeze(
      [...this.#leases.keys()].sort((first, second) => first - second),
    );
  }
}
