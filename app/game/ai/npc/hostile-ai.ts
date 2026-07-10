import type { EntityId, Tick, Vec3 } from "../../core/contracts";
import { deriveSeed, type RngSeed } from "../../core/rng";
import {
  AuthoredCoverAnchors,
  type CoverAnchor,
  type CoverSelectionMode,
} from "./cover";
import {
  distanceVec3,
  moveAwayXZ,
  normalizeVec3,
  subtractVec3,
  withHeight,
} from "./math";
import { PerceptionBudget } from "./perception";
import { hasLineOfSight, type PhysicsQueryPort } from "./physics-query";
import { ShooterCoordinator, type ShooterRequest } from "./shooter-coordinator";

export type HostileAiState =
  | "idle"
  | "patrol"
  | "investigate"
  | "engage"
  | "cover"
  | "flank"
  | "retreat"
  | "down";

export interface HostileAiConfig {
  readonly perceptionChecksPerTick: number;
  readonly targetChecksPerObserver: number;
  readonly visionRange: number;
  readonly hearingRange: number;
  readonly reactionMinTicks: number;
  readonly reactionMaxTicks: number;
  readonly targetMemoryTicks: number;
  readonly aimMemoryTicks: number;
  readonly idleTicks: number;
  readonly investigateTicks: number;
  readonly walkSpeed: number;
  readonly runSpeed: number;
  readonly retreatSpeed: number;
  readonly arrivalDistance: number;
  readonly engageStopDistance: number;
  readonly retreatHealthRatio: number;
  readonly retreatDistance: number;
  readonly coverSearchRadius: number;
  readonly seekCoverAfterTicks: number;
  readonly flankAfterDeniedTicks: number;
  readonly fireRange: number;
  readonly burstMinShots: number;
  readonly burstMaxShots: number;
  readonly shotIntervalTicks: number;
  readonly burstCooldownTicks: number;
  readonly maxSimultaneousShooters: number;
  readonly eyeHeight: number;
  readonly collisionMask?: number;
}

export const DEFAULT_HOSTILE_AI_CONFIG: HostileAiConfig = Object.freeze({
  perceptionChecksPerTick: 8,
  targetChecksPerObserver: 4,
  visionRange: 70,
  hearingRange: 45,
  reactionMinTicks: 12,
  reactionMaxTicks: 30,
  targetMemoryTicks: 90,
  aimMemoryTicks: 12,
  idleTicks: 45,
  investigateTicks: 240,
  walkSpeed: 2.2,
  runSpeed: 4.5,
  retreatSpeed: 5,
  arrivalDistance: 0.8,
  engageStopDistance: 16,
  retreatHealthRatio: 0.2,
  retreatDistance: 24,
  coverSearchRadius: 25,
  seekCoverAfterTicks: 90,
  flankAfterDeniedTicks: 60,
  fireRange: 55,
  burstMinShots: 2,
  burstMaxShots: 4,
  shotIntervalTicks: 5,
  burstCooldownTicks: 36,
  maxSimultaneousShooters: 2,
  eyeHeight: 1.55,
});

export interface HostileSpawn {
  readonly actorId: EntityId;
  readonly patrolPoints?: readonly Vec3[];
  readonly spawnTick?: Tick;
  readonly reactionTicks?: number;
  readonly initialState?: "idle" | "patrol";
}

export interface HostileActorFrame {
  readonly actorId: EntityId;
  readonly position: Vec3;
  readonly health: number;
  readonly maxHealth: number;
  readonly down?: boolean;
  readonly suppressed?: boolean;
}

export interface HostileTargetFrame {
  readonly actorId: EntityId;
  readonly position: Vec3;
  readonly velocity?: Vec3;
  readonly alive?: boolean;
}

export interface HostileNoiseStimulus {
  readonly id: string;
  readonly position: Vec3;
  readonly createdAtTick: Tick;
  readonly expiresAtTick: Tick;
  readonly radius?: number;
  readonly sourceEntityId?: EntityId;
}

export interface HostileUpdateContext {
  readonly tick: Tick;
  readonly actors: readonly HostileActorFrame[];
  readonly targets: readonly HostileTargetFrame[];
  readonly noises?: readonly HostileNoiseStimulus[];
}

export interface HostileMoveIntent {
  readonly target: Vec3;
  readonly speed: number;
  readonly stopDistance: number;
  readonly locomotion: "walk" | "run" | "crouch";
}

export interface BurstFireIntent {
  readonly type: "burst-fire";
  readonly burstId: string;
  readonly shooterId: EntityId;
  readonly targetId: EntityId;
  readonly firstShotTick: Tick;
  readonly shotCount: number;
  readonly shotIntervalTicks: number;
}

export interface FireShotIntent {
  readonly type: "fire-shot";
  readonly burstId: string;
  readonly shooterId: EntityId;
  readonly targetId: EntityId;
  readonly tick: Tick;
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly shotIndex: number;
  readonly burstSize: number;
}

export interface HostileIntent {
  readonly actorId: EntityId;
  readonly state: HostileAiState;
  readonly move?: HostileMoveIntent;
  readonly aimAt?: Vec3;
  readonly targetId?: EntityId;
  readonly coverAnchorId?: string;
  readonly burst?: BurstFireIntent;
  readonly fire?: FireShotIntent;
}

export interface HostileAiSnapshot {
  readonly actorId: EntityId;
  readonly state: HostileAiState;
  readonly stateEnteredTick: Tick;
  readonly reactionTicks: number;
  readonly targetId?: EntityId;
  readonly candidateTargetId?: EntityId;
  readonly lastKnownTargetPosition?: Vec3;
  readonly coverAnchorId?: string;
  readonly patrolIndex: number;
}

export interface HostileAiSystemOptions {
  readonly seed: RngSeed;
  readonly physics: PhysicsQueryPort;
  readonly coverAnchors?: readonly CoverAnchor[] | AuthoredCoverAnchors;
  readonly shooterCoordinator?: ShooterCoordinator;
  readonly config?: Partial<HostileAiConfig>;
}

interface ActiveBurst {
  readonly id: string;
  readonly targetId: EntityId;
  readonly size: number;
  readonly startedAtTick: Tick;
  shotsFired: number;
  nextShotTick: Tick;
}

interface HostileRecord {
  readonly actorId: EntityId;
  readonly patrolPoints: readonly Vec3[];
  readonly reactionTicks: number;
  state: HostileAiState;
  stateEnteredTick: Tick;
  patrolIndex: number;
  candidateTargetId?: EntityId;
  candidateFirstSeenTick?: Tick;
  targetId?: EntityId;
  lastKnownTargetPosition?: Vec3;
  lastSeenTick?: Tick;
  lastPerceptionTick?: Tick;
  investigatePosition?: Vec3;
  investigateUntilTick: Tick;
  coverAnchorId?: string;
  coverPeekPosition?: Vec3;
  deniedSinceTick?: Tick;
  burstSequence: number;
  burst?: ActiveBurst;
  nextBurstTick: Tick;
}

interface ShootingCandidate {
  readonly record: HostileRecord;
  readonly actor: HostileActorFrame;
  readonly target: HostileTargetFrame;
  readonly origin: Vec3;
  readonly distance: number;
}

function mergeConfig(
  overrides: Partial<HostileAiConfig> | undefined,
): HostileAiConfig {
  const config = { ...DEFAULT_HOSTILE_AI_CONFIG, ...overrides };
  const integerKeys = [
    "perceptionChecksPerTick",
    "targetChecksPerObserver",
    "reactionMinTicks",
    "reactionMaxTicks",
    "targetMemoryTicks",
    "aimMemoryTicks",
    "idleTicks",
    "investigateTicks",
    "seekCoverAfterTicks",
    "flankAfterDeniedTicks",
    "burstMinShots",
    "burstMaxShots",
    "shotIntervalTicks",
    "burstCooldownTicks",
    "maxSimultaneousShooters",
  ] as const;
  for (const key of integerKeys) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0) {
      throw new RangeError(`${key} must be a non-negative safe integer`);
    }
  }
  if (config.reactionMaxTicks < config.reactionMinTicks) {
    throw new RangeError("reactionMaxTicks must be >= reactionMinTicks");
  }
  if (config.burstMinShots <= 0) {
    throw new RangeError("burstMinShots must be positive");
  }
  if (config.burstMaxShots < config.burstMinShots) {
    throw new RangeError("burstMaxShots must be >= burstMinShots");
  }
  if (config.shotIntervalTicks <= 0) {
    throw new RangeError("shotIntervalTicks must be positive");
  }
  for (const key of [
    "visionRange",
    "hearingRange",
    "walkSpeed",
    "runSpeed",
    "retreatSpeed",
    "arrivalDistance",
    "engageStopDistance",
    "retreatDistance",
    "coverSearchRadius",
    "fireRange",
    "eyeHeight",
  ] as const) {
    if (!Number.isFinite(config[key]) || config[key] < 0) {
      throw new RangeError(`${key} must be non-negative and finite`);
    }
  }
  if (
    !Number.isFinite(config.retreatHealthRatio) ||
    config.retreatHealthRatio < 0 ||
    config.retreatHealthRatio > 1
  ) {
    throw new RangeError("retreatHealthRatio must be between zero and one");
  }
  return Object.freeze(config);
}

function reactionFor(
  seed: RngSeed,
  actorId: EntityId,
  config: HostileAiConfig,
): number {
  const width = config.reactionMaxTicks - config.reactionMinTicks + 1;
  return (
    config.reactionMinTicks +
    (deriveSeed(seed, `hostile:${actorId}:reaction`) % width)
  );
}

function validateReactionTicks(ticks: number): number {
  if (!Number.isSafeInteger(ticks) || ticks < 0) {
    throw new RangeError("Hostile reactionTicks must be non-negative");
  }
  return ticks;
}

export class HostileAiSystem {
  readonly config: HostileAiConfig;
  readonly coverAnchors: AuthoredCoverAnchors;
  readonly shooterCoordinator: ShooterCoordinator;
  readonly #seed: RngSeed;
  readonly #physics: PhysicsQueryPort;
  readonly #perception: PerceptionBudget;
  readonly #records = new Map<EntityId, HostileRecord>();
  #lastUpdateTick: Tick | undefined;
  #cacheValid = false;
  #lastIntents: readonly HostileIntent[] = Object.freeze([]);

  constructor(options: HostileAiSystemOptions) {
    this.config = mergeConfig(options.config);
    this.#seed = options.seed;
    this.#physics = options.physics;
    this.coverAnchors =
      options.coverAnchors instanceof AuthoredCoverAnchors
        ? options.coverAnchors
        : new AuthoredCoverAnchors(options.coverAnchors ?? []);
    this.shooterCoordinator =
      options.shooterCoordinator ??
      new ShooterCoordinator(this.config.maxSimultaneousShooters);
    this.#perception = new PerceptionBudget(
      this.config.perceptionChecksPerTick,
    );
  }

  get size(): number {
    return this.#records.size;
  }

  spawn(spawn: HostileSpawn): void {
    if (this.#records.has(spawn.actorId)) {
      throw new Error(`Hostile ${spawn.actorId} is already active`);
    }
    const spawnTick = spawn.spawnTick ?? 0;
    if (!Number.isSafeInteger(spawnTick) || spawnTick < 0) {
      throw new RangeError("Hostile spawnTick must be non-negative");
    }
    const patrolPoints = Object.freeze(
      (spawn.patrolPoints ?? []).map((point) => [...point] as Vec3),
    );
    const state =
      spawn.initialState === "patrol" && patrolPoints.length === 0
        ? "idle"
        : (spawn.initialState ?? "idle");
    this.#records.set(spawn.actorId, {
      actorId: spawn.actorId,
      patrolPoints,
      reactionTicks: validateReactionTicks(
        spawn.reactionTicks ??
          reactionFor(this.#seed, spawn.actorId, this.config),
      ),
      state,
      stateEnteredTick: spawnTick,
      patrolIndex: 0,
      investigateUntilTick: spawnTick,
      burstSequence: 0,
      nextBurstTick: spawnTick,
    });
    this.#invalidateTickCache();
  }

  despawn(actorId: EntityId): boolean {
    const removed = this.#records.delete(actorId);
    if (!removed) return false;
    this.coverAnchors.releaseByActor(actorId);
    this.shooterCoordinator.release(actorId);
    this.#invalidateTickCache();
    return true;
  }

  has(actorId: EntityId): boolean {
    return this.#records.has(actorId);
  }

  get(actorId: EntityId): HostileAiSnapshot | null {
    const record = this.#records.get(actorId);
    return record ? this.#snapshot(record) : null;
  }

  snapshots(): readonly HostileAiSnapshot[] {
    return Object.freeze(
      this.#activeRecords().map((record) => this.#snapshot(record)),
    );
  }

  update(context: HostileUpdateContext): readonly HostileIntent[] {
    if (!Number.isSafeInteger(context.tick) || context.tick < 0) {
      throw new RangeError("Hostile update tick must be non-negative");
    }
    if (
      this.#lastUpdateTick !== undefined &&
      context.tick < this.#lastUpdateTick
    ) {
      throw new Error("Hostile updates cannot move backwards in time");
    }
    if (context.tick === this.#lastUpdateTick && this.#cacheValid) {
      return this.#lastIntents;
    }

    const actors = this.#uniqueActors(context.actors);
    const targets = this.#uniqueTargets(context.targets);
    const active = this.#activeRecords().filter((record) =>
      actors.has(record.actorId),
    );
    const perceived = new Set(
      this.#perception.select(
        context.tick,
        active.map((record) => record.actorId),
      ),
    );

    for (const record of active) {
      const actor = actors.get(record.actorId) as HostileActorFrame;
      this.#updateLifeState(record, actor, context.tick);
      if (record.state === "down" || record.state === "retreat") continue;
      if (perceived.has(record.actorId)) {
        this.#perceive(
          record,
          actor,
          [...targets.values()],
          context.noises ?? [],
          context.tick,
        );
      }
      this.#advanceTactics(record, actor, targets, context.tick);
    }

    const shootingCandidates = this.#shootingCandidates(
      active,
      actors,
      targets,
      context.tick,
    );
    const requests = shootingCandidates.map((candidate) =>
      this.#shooterRequest(candidate, context.tick),
    );
    const grants = this.shooterCoordinator.coordinate(context.tick, requests);
    const combatIntents = new Map<
      EntityId,
      Pick<HostileIntent, "burst" | "fire">
    >();

    for (const candidate of shootingCandidates) {
      if (grants.has(candidate.record.actorId)) {
        candidate.record.deniedSinceTick = undefined;
        combatIntents.set(
          candidate.record.actorId,
          this.#advanceBurst(candidate, context.tick),
        );
      } else {
        this.#handleDeniedShooter(candidate, context.tick);
      }
    }

    const candidateIds = new Set(
      shootingCandidates.map((candidate) => candidate.record.actorId),
    );
    for (const record of active) {
      if (candidateIds.has(record.actorId)) continue;
      record.deniedSinceTick = undefined;
      this.#cancelBurst(record);
    }

    const intents = active.map((record) =>
      this.#intent(
        record,
        actors.get(record.actorId) as HostileActorFrame,
        targets,
        combatIntents.get(record.actorId),
      ),
    );
    this.#lastUpdateTick = context.tick;
    this.#cacheValid = true;
    this.#lastIntents = Object.freeze(intents);
    return this.#lastIntents;
  }

  #updateLifeState(
    record: HostileRecord,
    actor: HostileActorFrame,
    tick: Tick,
  ): void {
    if (record.state === "down") return;
    if (actor.down || actor.health <= 0 || actor.maxHealth <= 0) {
      this.#transition(record, "down", tick);
      return;
    }
    if (actor.health / actor.maxHealth <= this.config.retreatHealthRatio) {
      this.#transition(record, "retreat", tick);
    }
  }

  #perceive(
    record: HostileRecord,
    actor: HostileActorFrame,
    targets: readonly HostileTargetFrame[],
    noises: readonly HostileNoiseStimulus[],
    tick: Tick,
  ): void {
    record.lastPerceptionTick = tick;
    const visible = targets
      .filter(
        (target) =>
          target.actorId !== actor.actorId &&
          target.alive !== false &&
          distanceVec3(actor.position, target.position) <=
            this.config.visionRange,
      )
      .sort(
        (first, second) =>
          distanceVec3(actor.position, first.position) -
            distanceVec3(actor.position, second.position) ||
          first.actorId - second.actorId,
      )
      .slice(0, this.config.targetChecksPerObserver)
      .find((target) =>
        hasLineOfSight(
          this.#physics,
          withHeight(actor.position, this.config.eyeHeight),
          withHeight(target.position, this.config.eyeHeight),
          {
            collisionMask: this.config.collisionMask,
            sourceEntityId: actor.actorId,
            targetEntityId: target.actorId,
          },
        ),
      );

    if (visible) {
      if (record.candidateTargetId !== visible.actorId) {
        record.candidateTargetId = visible.actorId;
        record.candidateFirstSeenTick = tick;
      }
      record.lastKnownTargetPosition = visible.position;
      record.lastSeenTick = tick;
      return;
    }

    record.candidateTargetId = undefined;
    record.candidateFirstSeenTick = undefined;
    const heard = noises
      .filter((noise) => {
        const radius = Math.min(
          noise.radius ?? this.config.hearingRange,
          this.config.hearingRange,
        );
        return (
          tick >= noise.createdAtTick &&
          tick <= noise.expiresAtTick &&
          distanceVec3(actor.position, noise.position) <= radius
        );
      })
      .sort(
        (first, second) =>
          second.createdAtTick - first.createdAtTick ||
          distanceVec3(actor.position, first.position) -
            distanceVec3(actor.position, second.position) ||
          first.id.localeCompare(second.id),
      )[0];
    if (heard && (record.state === "idle" || record.state === "patrol")) {
      record.investigatePosition = heard.position;
      record.investigateUntilTick = tick + this.config.investigateTicks;
      this.#transition(record, "investigate", tick);
    }
  }

  #advanceTactics(
    record: HostileRecord,
    actor: HostileActorFrame,
    targets: ReadonlyMap<EntityId, HostileTargetFrame>,
    tick: Tick,
  ): void {
    const reacted =
      record.candidateTargetId !== undefined &&
      record.candidateFirstSeenTick !== undefined &&
      tick - record.candidateFirstSeenTick >= record.reactionTicks;
    if (reacted) {
      record.targetId = record.candidateTargetId;
      if (
        record.state === "idle" ||
        record.state === "patrol" ||
        record.state === "investigate"
      ) {
        this.#transition(record, "engage", tick);
      }
    }

    if (
      (record.state === "engage" ||
        record.state === "cover" ||
        record.state === "flank") &&
      record.lastSeenTick !== undefined &&
      tick - record.lastSeenTick > this.config.targetMemoryTicks
    ) {
      record.investigatePosition = record.lastKnownTargetPosition;
      record.investigateUntilTick = tick + this.config.investigateTicks;
      record.targetId = undefined;
      this.#transition(record, "investigate", tick);
    }

    if (record.state === "idle") {
      if (
        record.patrolPoints.length > 0 &&
        tick - record.stateEnteredTick >= this.config.idleTicks
      ) {
        this.#transition(record, "patrol", tick);
      }
      return;
    }

    if (record.state === "patrol") {
      const patrolTarget = record.patrolPoints[record.patrolIndex];
      if (
        patrolTarget &&
        distanceVec3(actor.position, patrolTarget) <=
          this.config.arrivalDistance
      ) {
        record.patrolIndex =
          (record.patrolIndex + 1) % record.patrolPoints.length;
      }
      return;
    }

    if (record.state === "investigate") {
      if (
        tick >= record.investigateUntilTick ||
        (record.investigatePosition !== undefined &&
          distanceVec3(actor.position, record.investigatePosition) <=
            this.config.arrivalDistance)
      ) {
        record.investigatePosition = undefined;
        this.#transition(
          record,
          record.patrolPoints.length > 0 ? "patrol" : "idle",
          tick,
        );
      }
      return;
    }

    if (record.state === "engage") {
      const target =
        record.targetId === undefined
          ? undefined
          : targets.get(record.targetId);
      if (
        target &&
        (actor.suppressed ||
          tick - record.stateEnteredTick >= this.config.seekCoverAfterTicks)
      ) {
        this.#takeCover(record, actor, target.position, "cover", tick);
      }
      return;
    }

    if (record.state === "cover" || record.state === "flank") {
      const anchor = record.coverAnchorId
        ? this.coverAnchors.get(record.coverAnchorId)
        : undefined;
      if (!anchor) {
        this.#transition(record, "engage", tick);
        return;
      }
      if (
        record.state === "flank" &&
        distanceVec3(actor.position, anchor.position) <=
          this.config.arrivalDistance
      ) {
        this.#transition(record, "cover", tick);
      }
    }
  }

  #takeCover(
    record: HostileRecord,
    actor: HostileActorFrame,
    threatPosition: Vec3,
    mode: CoverSelectionMode,
    tick: Tick,
  ): boolean {
    const selection = this.coverAnchors.select({
      actorId: record.actorId,
      actorPosition: actor.position,
      threatPosition,
      physics: this.#physics,
      mode,
      maxDistance: this.config.coverSearchRadius,
      collisionMask: this.config.collisionMask,
      eyeHeight: this.config.eyeHeight,
    });
    if (!selection) return false;
    this.#transition(record, mode, tick);
    if (!this.coverAnchors.reserve(selection.anchor.id, record.actorId)) {
      return false;
    }
    record.coverAnchorId = selection.anchor.id;
    record.coverPeekPosition = selection.peekPosition;
    return true;
  }

  #shootingCandidates(
    active: readonly HostileRecord[],
    actors: ReadonlyMap<EntityId, HostileActorFrame>,
    targets: ReadonlyMap<EntityId, HostileTargetFrame>,
    tick: Tick,
  ): ShootingCandidate[] {
    const candidates: ShootingCandidate[] = [];
    for (const record of active) {
      if (record.state !== "engage" && record.state !== "cover") continue;
      if (!record.burst && tick < record.nextBurstTick) continue;
      if (
        record.targetId === undefined ||
        record.lastSeenTick === undefined ||
        (record.lastPerceptionTick !== undefined &&
          record.lastPerceptionTick > record.lastSeenTick) ||
        tick - record.lastSeenTick > this.config.aimMemoryTicks
      ) {
        continue;
      }
      if (record.burst && record.burst.targetId !== record.targetId) {
        this.#cancelBurst(record);
      }
      const actor = actors.get(record.actorId);
      const target = targets.get(record.targetId);
      if (!actor || !target || target.alive === false) continue;
      const distance = distanceVec3(actor.position, target.position);
      if (distance > this.config.fireRange) continue;
      let origin = withHeight(actor.position, this.config.eyeHeight);
      if (record.state === "cover") {
        const anchor = record.coverAnchorId
          ? this.coverAnchors.get(record.coverAnchorId)
          : undefined;
        if (
          !anchor ||
          distanceVec3(actor.position, anchor.position) >
            this.config.arrivalDistance
        ) {
          continue;
        }
        origin = record.coverPeekPosition ?? origin;
      }
      candidates.push({ record, actor, target, origin, distance });
    }
    return candidates;
  }

  #shooterRequest(candidate: ShootingCandidate, tick: Tick): ShooterRequest {
    const remainingShots = candidate.record.burst
      ? candidate.record.burst.size - candidate.record.burst.shotsFired
      : this.config.burstMaxShots;
    const holdTicks = Math.max(
      1,
      remainingShots * this.config.shotIntervalTicks,
    );
    return {
      shooterId: candidate.record.actorId,
      priority:
        (candidate.record.state === "cover" ? 2 : 1) +
        (this.config.fireRange - candidate.distance) /
          Math.max(1, this.config.fireRange) +
        (candidate.record.burst
          ? 10
          : tick >= candidate.record.nextBurstTick
            ? 1
            : -10),
      holdTicks,
    };
  }

  #advanceBurst(
    candidate: ShootingCandidate,
    tick: Tick,
  ): Pick<HostileIntent, "burst" | "fire"> {
    const record = candidate.record;
    let burstIntent: BurstFireIntent | undefined;
    if (!record.burst) {
      if (tick < record.nextBurstTick) return {};
      const size =
        this.config.burstMinShots +
        (deriveSeed(
          this.#seed,
          `hostile:${record.actorId}:burst:${record.burstSequence}`,
        ) %
          (this.config.burstMaxShots - this.config.burstMinShots + 1));
      const id = `${record.actorId}:${record.burstSequence}`;
      record.burstSequence += 1;
      record.burst = {
        id,
        targetId: candidate.target.actorId,
        size,
        startedAtTick: tick,
        shotsFired: 0,
        nextShotTick: tick,
      };
      burstIntent = Object.freeze({
        type: "burst-fire",
        burstId: id,
        shooterId: record.actorId,
        targetId: candidate.target.actorId,
        firstShotTick: tick,
        shotCount: size,
        shotIntervalTicks: this.config.shotIntervalTicks,
      });
    }

    const activeBurst = record.burst;
    if (!activeBurst || tick < activeBurst.nextShotTick) {
      return { burst: burstIntent };
    }
    const shotIndex = activeBurst.shotsFired;
    const fire = Object.freeze({
      type: "fire-shot" as const,
      burstId: activeBurst.id,
      shooterId: record.actorId,
      targetId: candidate.target.actorId,
      tick,
      origin: candidate.origin,
      direction: normalizeVec3(
        subtractVec3(
          withHeight(candidate.target.position, this.config.eyeHeight),
          candidate.origin,
        ),
      ),
      shotIndex,
      burstSize: activeBurst.size,
    });
    activeBurst.shotsFired += 1;
    activeBurst.nextShotTick = tick + this.config.shotIntervalTicks;
    if (activeBurst.shotsFired >= activeBurst.size) {
      record.burst = undefined;
      record.nextBurstTick = tick + this.config.burstCooldownTicks;
      this.shooterCoordinator.release(record.actorId);
    }
    return { burst: burstIntent, fire };
  }

  #handleDeniedShooter(candidate: ShootingCandidate, tick: Tick): void {
    const record = candidate.record;
    this.#cancelBurst(record);
    record.deniedSinceTick ??= tick;
    if (
      tick - record.deniedSinceTick >= this.config.flankAfterDeniedTicks &&
      this.#takeCover(
        record,
        candidate.actor,
        candidate.target.position,
        "flank",
        tick,
      )
    ) {
      record.deniedSinceTick = undefined;
    }
  }

  #cancelBurst(record: HostileRecord): void {
    if (!record.burst) return;
    record.burst = undefined;
    this.shooterCoordinator.release(record.actorId);
  }

  #intent(
    record: HostileRecord,
    actor: HostileActorFrame,
    targets: ReadonlyMap<EntityId, HostileTargetFrame>,
    combat: Pick<HostileIntent, "burst" | "fire"> | undefined,
  ): HostileIntent {
    const target =
      record.targetId === undefined ? undefined : targets.get(record.targetId);
    const move = this.#moveIntent(record, actor, target);
    return Object.freeze({
      actorId: record.actorId,
      state: record.state,
      move,
      aimAt:
        record.state === "engage" || record.state === "cover"
          ? target?.position
          : undefined,
      targetId: record.targetId,
      coverAnchorId: record.coverAnchorId,
      burst: combat?.burst,
      fire: combat?.fire,
    });
  }

  #moveIntent(
    record: HostileRecord,
    actor: HostileActorFrame,
    target: HostileTargetFrame | undefined,
  ): HostileMoveIntent | undefined {
    if (record.state === "patrol") {
      const point = record.patrolPoints[record.patrolIndex];
      return point
        ? {
            target: point,
            speed: this.config.walkSpeed,
            stopDistance: this.config.arrivalDistance,
            locomotion: "walk",
          }
        : undefined;
    }
    if (record.state === "investigate" && record.investigatePosition) {
      return {
        target: record.investigatePosition,
        speed: this.config.walkSpeed,
        stopDistance: this.config.arrivalDistance,
        locomotion: "walk",
      };
    }
    if (record.state === "engage" && target) {
      if (
        distanceVec3(actor.position, target.position) <=
        this.config.engageStopDistance
      ) {
        return undefined;
      }
      return {
        target: target.position,
        speed: this.config.runSpeed,
        stopDistance: this.config.engageStopDistance,
        locomotion: "run",
      };
    }
    if (record.state === "cover" || record.state === "flank") {
      const anchor = record.coverAnchorId
        ? this.coverAnchors.get(record.coverAnchorId)
        : undefined;
      if (!anchor) return undefined;
      const atAnchor =
        distanceVec3(actor.position, anchor.position) <=
        this.config.arrivalDistance;
      if (atAnchor && record.state === "cover") return undefined;
      return {
        target: anchor.position,
        speed:
          record.state === "flank"
            ? this.config.runSpeed
            : this.config.walkSpeed,
        stopDistance: this.config.arrivalDistance,
        locomotion: record.state === "cover" ? "crouch" : "run",
      };
    }
    if (record.state === "retreat") {
      return {
        target: moveAwayXZ(
          actor.position,
          record.lastKnownTargetPosition ?? actor.position,
          this.config.retreatDistance,
        ),
        speed: this.config.retreatSpeed,
        stopDistance: this.config.arrivalDistance,
        locomotion: "run",
      };
    }
    return undefined;
  }

  #transition(record: HostileRecord, state: HostileAiState, tick: Tick): void {
    if (record.state === state) return;
    const keepsCover =
      (record.state === "cover" || record.state === "flank") &&
      (state === "cover" || state === "flank");
    if (!keepsCover) {
      this.coverAnchors.releaseByActor(record.actorId);
      record.coverAnchorId = undefined;
      record.coverPeekPosition = undefined;
    }
    if (state !== "engage" && state !== "cover") {
      this.#cancelBurst(record);
      record.deniedSinceTick = undefined;
    }
    record.state = state;
    record.stateEnteredTick = tick;
  }

  #uniqueActors(
    frames: readonly HostileActorFrame[],
  ): ReadonlyMap<EntityId, HostileActorFrame> {
    const byId = new Map<EntityId, HostileActorFrame>();
    for (const frame of frames) {
      if (byId.has(frame.actorId)) {
        throw new Error(`Duplicate hostile frame for ${frame.actorId}`);
      }
      byId.set(frame.actorId, frame);
    }
    return byId;
  }

  #uniqueTargets(
    frames: readonly HostileTargetFrame[],
  ): ReadonlyMap<EntityId, HostileTargetFrame> {
    const byId = new Map<EntityId, HostileTargetFrame>();
    for (const frame of frames) {
      if (byId.has(frame.actorId)) {
        throw new Error(`Duplicate hostile target for ${frame.actorId}`);
      }
      byId.set(frame.actorId, frame);
    }
    return byId;
  }

  #snapshot(record: HostileRecord): HostileAiSnapshot {
    return Object.freeze({
      actorId: record.actorId,
      state: record.state,
      stateEnteredTick: record.stateEnteredTick,
      reactionTicks: record.reactionTicks,
      targetId: record.targetId,
      candidateTargetId: record.candidateTargetId,
      lastKnownTargetPosition: record.lastKnownTargetPosition,
      coverAnchorId: record.coverAnchorId,
      patrolIndex: record.patrolIndex,
    });
  }

  #activeRecords(): HostileRecord[] {
    return [...this.#records.values()].sort(
      (first, second) => first.actorId - second.actorId,
    );
  }

  #invalidateTickCache(): void {
    this.#cacheValid = false;
    this.#lastIntents = Object.freeze([]);
  }
}

export { HostileAiSystem as HostileSquadAi };
