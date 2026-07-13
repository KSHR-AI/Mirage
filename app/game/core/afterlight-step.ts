import {
  applyActorDamage,
  stepGroundedLocomotion,
  type ActorLifecycleEvent,
  type LocomotionState,
} from "../actors";
import { updateHeat } from "../ai/police/heat";
import {
  AFTERLIGHT_ITEMS,
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
  AFTERLIGHT_TAGS,
  selectAfterlightEncounter,
} from "../missions/afterlight-job";
import {
  DEFAULT_AFTERLIGHT_CONTRACT_ID,
  createAfterlightMission,
  type AfterlightMissionDefinition,
} from "../missions/afterlight-contracts";
import { activeAfterlightPoliceCount } from "../missions/afterlight-operations";
import {
  createMissionReducerState,
  reduceMissionState,
  restoreMissionState,
  type MissionReducerState,
} from "../missions/reducer";
import { hasAfterlightUpgradeMarker } from "../progression";
import {
  applyVehicleCollisionImpulse,
  createTrafficAgent,
  DEFAULT_ARCADE_CAR_CONFIG,
  resolveIntersectionReservations,
  resolveVehicleBuildingCollision,
  stepHeroCar,
  STREET_TUNED_ARCADE_CAR_CONFIG,
  stepTrafficAgent,
  vehiclePlanarSpeed,
  type IntersectionReservation,
  type TrafficAgentState,
} from "../vehicles";
import {
  INITIAL_CHARACTER_MOTOR_STATE,
  stepKinematicCharacter,
  type CharacterObstacle,
  type CharacterMotorState,
  type CharacterWorld,
} from "../world/character-controller";
import {
  AFTERLIGHT_CHARACTER_HIT_CENTER_OFFSET,
  AFTERLIGHT_CHARACTER_WEAPON_OFFSET,
  createAfterlightCharacterWorld,
  createAfterlightVehicleObstacles,
} from "../world/afterlight-character-world";
import { DEFAULT_ROAD_GRAPH, findRouteBetween } from "../world/road-graph";
import {
  HostileAiSystem,
  type HostileActorFrame,
  type HostileIntent,
  type HostileNoiseStimulus,
  type HostileTargetFrame,
} from "../ai/npc";
import { stepSignal9, SIGNAL_9_SPEC, traceHitscan } from "../combat";
import {
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_LANDMARKS,
  afterlightCheckpoint,
  createInitialAfterlightActors,
} from "./afterlight-state";
import {
  AFTERLIGHT_MISSION_COVER,
  createAfterlightPhysicsQuery,
  type WorldCollisionBox,
} from "./afterlight-physics";
import { SIMULATION_DT } from "./contracts";
import { deriveSeed } from "./rng";
import type {
  ActorState,
  CrimeKind,
  EntityId,
  GameEvent,
  GameState,
  InputFrame,
  MissionDefinition,
  PoliceMode,
  Vec3,
  VehicleState,
  WeaponState,
} from "./contracts";
import type {
  RuntimeStep,
  RuntimeStepContext,
  RuntimeStepResult,
} from "./runtime";

const POINTER_LOOK_SENSITIVITY = 0.025;
const AXIS_LOOK_SPEED = 2.65;
const MAX_CAMERA_PITCH = Math.PI * 0.35;
const INTERACTION_DISTANCE = 7;
const INTERNAL_BLACKOUT_MARKER = "afterlight:blackout:active";
const WORLD_SOUTH_BOUNDARY = -238;
const COURIER_COLLISION_IMPULSE_SCALE = 1.25;
const FOOT_ACCELERATION = 28;
const FOOT_DECELERATION = 36;
const AIR_CONTROL_SCALE = 0.42;
const FOOT_TURN_RATE = 14;
const AIM_TURN_RATE = 20;
const HOSTILE_COVER_STANDOFF = 0.84;
const HOSTILE_PEEK_OFFSET = 0.38;
const HOSTILE_HITSCAN_RANGE = 72;
const HOSTILE_VEHICLE_DAMAGE = Object.freeze({
  police: 4,
  guard: 6,
} as const);
const HOSTILE_ACTOR_DAMAGE = Object.freeze({
  police: 7,
  guard: 9,
} as const);
const COURIER_ROUTE_SNAP_DISTANCE = 24;

const COURIER_ROUTE_DESTINATIONS: Readonly<Record<string, Vec3>> =
  Object.freeze({
    "courier-embarcadero": [70, 0.72, -70],
    "courier-mission-decoy": [-70, 0.72, 42],
    "courier-north-beach": [-42, 0.72, -70],
  });
const DEFAULT_COURIER_ROUTE_DESTINATION: Vec3 = [-70, 0.72, -70];

const KEYHOLDER_GUARDS: readonly EntityId[] = Object.freeze([
  AFTERLIGHT_ENTITY_IDS.keyholderGuardA,
  AFTERLIGHT_ENTITY_IDS.keyholderGuardB,
]);
const VAULT_GUARDS: readonly EntityId[] = Object.freeze([
  AFTERLIGHT_ENTITY_IDS.vaultGuardA,
  AFTERLIGHT_ENTITY_IDS.vaultGuardB,
  AFTERLIGHT_ENTITY_IDS.vaultGuardC,
  AFTERLIGHT_ENTITY_IDS.vaultGuardD,
  AFTERLIGHT_ENTITY_IDS.vaultGuardE,
]);
const POLICE_ACTORS: readonly EntityId[] = Object.freeze([
  AFTERLIGHT_ENTITY_IDS.policeA,
  AFTERLIGHT_ENTITY_IDS.policeB,
  AFTERLIGHT_ENTITY_IDS.policeC,
  AFTERLIGHT_ENTITY_IDS.policeD,
]);

interface StepCollections {
  readonly actors: Map<EntityId, ActorState>;
  readonly vehicles: Map<EntityId, VehicleState>;
  readonly inventory: Set<string>;
  readonly weapons: Map<string, WeaponState>;
}

function distanceSquaredXZ(left: Vec3, right: Vec3): number {
  const x = left[0] - right[0];
  const z = left[2] - right[2];
  return x * x + z * z;
}

function distanceXZ(left: Vec3, right: Vec3): number {
  return Math.sqrt(distanceSquaredXZ(left, right));
}

function isNear(
  left: Vec3,
  right: Vec3,
  radius = INTERACTION_DISTANCE,
): boolean {
  return distanceSquaredXZ(left, right) <= radius * radius;
}

function normalizedAngle(angle: number): number {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

function approachPlanarVelocity(
  current: Vec3,
  target: Vec3,
  maximumDelta: number,
): Vec3 {
  const dx = target[0] - current[0];
  const dz = target[2] - current[2];
  const distance = Math.hypot(dx, dz);
  if (distance <= maximumDelta || distance <= Number.EPSILON) {
    return [target[0], 0, target[2]];
  }
  const scale = maximumDelta / distance;
  return [current[0] + dx * scale, 0, current[2] + dz * scale];
}

function rotateToward(current: number, target: number, maximumDelta: number) {
  const delta = normalizedAngle(target - current);
  if (Math.abs(delta) <= maximumDelta) return normalizedAngle(target);
  return normalizedAngle(current + Math.sign(delta) * maximumDelta);
}

function clampedPitch(pitch: number): number {
  return Math.max(-MAX_CAMERA_PITCH, Math.min(MAX_CAMERA_PITCH, pitch));
}

function heatFloorLevel(value: number | undefined): 0 | 1 | 2 | 3 {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3, Math.round(value))) as 0 | 1 | 2 | 3;
}

function clampWorld(position: Vec3): Vec3 {
  const z = Math.max(WORLD_SOUTH_BOUNDARY, Math.min(98, position[2]));
  const bridgeHalfWidth = z < -98 ? 7.25 : 96;
  return [
    Math.max(-bridgeHalfWidth, Math.min(bridgeHalfWidth, position[0])),
    position[1],
    z,
  ];
}

function directionFromYawPitch(rotationY: number, pitch: number): Vec3 {
  const horizontal = Math.cos(pitch);
  return [
    Math.sin(rotationY) * horizontal,
    Math.sin(pitch),
    Math.cos(rotationY) * horizontal,
  ];
}

function sourceFields(sourceId: EntityId | undefined) {
  return sourceId === undefined ? {} : { sourceId };
}

function coreLifecycleEvents(
  events: readonly ActorLifecycleEvent[],
): readonly GameEvent[] {
  return events.filter(
    (
      event,
    ): event is Extract<
      GameEvent,
      { type: "actor-damaged" | "actor-downed" }
    > => event.type === "actor-damaged" || event.type === "actor-downed",
  );
}

function activeGuardIds(phaseId: string): readonly EntityId[] {
  if (phaseId === AFTERLIGHT_PHASE_IDS.keyholder) return KEYHOLDER_GUARDS;
  if (phaseId === AFTERLIGHT_PHASE_IDS.vault) return VAULT_GUARDS;
  return [];
}

function alive(
  actors: ReadonlyMap<EntityId, ActorState>,
  ids: readonly EntityId[],
) {
  return ids.filter((id) => actors.get(id)?.life === "alive");
}

function copyCollections(state: GameState): StepCollections {
  return {
    actors: new Map(state.actors),
    vehicles: new Map(state.vehicles),
    inventory: new Set(state.inventory),
    weapons: new Map(state.weapons),
  };
}

function stateWithCollections(
  state: GameState,
  collections: StepCollections,
): GameState {
  return {
    ...state,
    actors: collections.actors,
    vehicles: collections.vehicles,
    inventory: collections.inventory,
    weapons: collections.weapons,
  };
}

function interactionEvent(
  tick: number,
  actorId: EntityId,
  tag: string,
  targetId?: EntityId,
): GameEvent {
  return {
    type: "interaction",
    tick,
    actorId,
    tag,
    ...(targetId === undefined ? {} : { targetId }),
  };
}

function itemEvent(tick: number, actorId: EntityId, itemId: string): GameEvent {
  return { type: "item-collected", tick, actorId, itemId };
}

function witnessedCrime(
  tick: number,
  crime: CrimeKind,
  position: Vec3,
  actors: ReadonlyMap<EntityId, ActorState>,
): GameEvent | undefined {
  const witnessIds = [...actors.values()]
    .filter(
      (actor) =>
        actor.kind !== "player" &&
        actor.life === "alive" &&
        distanceSquaredXZ(actor.pose.position, position) <= 52 * 52,
    )
    .map((actor) => actor.id)
    .sort((left, right) => left - right);

  return witnessIds.length > 0
    ? { type: "crime-witnessed", tick, crime, position, witnessIds }
    : undefined;
}

function damageActor(
  actors: Map<EntityId, ActorState>,
  events: GameEvent[],
  tick: number,
  actorId: EntityId,
  amount: number,
  sourceId?: EntityId,
): void {
  const actor = actors.get(actorId);
  if (!actor) return;
  const result = applyActorDamage(
    { actor },
    { tick, actorId, amount, ...sourceFields(sourceId) },
  );
  actors.set(actorId, result.state.actor);
  events.push(...coreLifecycleEvents(result.events));
}

function damageVehicle(
  vehicles: Map<EntityId, VehicleState>,
  events: GameEvent[],
  tick: number,
  vehicleId: EntityId,
  amount: number,
  sourceId?: EntityId,
): void {
  const vehicle = vehicles.get(vehicleId);
  if (!vehicle || vehicle.life === "destroyed" || amount <= 0) return;
  const health = Math.max(0, vehicle.health - amount);
  const disabled = health <= (vehicle.kind === "courier" ? 40 : 0);
  const life: VehicleState["life"] =
    health === 0 ? "destroyed" : disabled ? "disabled" : vehicle.life;
  vehicles.set(vehicleId, {
    ...vehicle,
    health,
    life,
    velocity: disabled ? [0, 0, 0] : vehicle.velocity,
  });
  events.push({
    type: "vehicle-damaged",
    tick,
    vehicleId,
    amount: Math.min(vehicle.health, amount),
    ...sourceFields(sourceId),
  });
  if (disabled && vehicle.life === "active") {
    events.push({ type: "vehicle-disabled", tick, vehicleId });
  }
}

function stepFootPlayer(
  player: ActorState,
  input: InputFrame,
  previous: LocomotionState,
  previousMotor: CharacterMotorState,
  world: CharacterWorld,
  vehicles: ReadonlyMap<EntityId, VehicleState>,
  cameraYaw: number,
): {
  actor: ActorState;
  locomotion: LocomotionState;
  motor: CharacterMotorState;
} {
  const locomotion = stepGroundedLocomotion(previous, input, {
    grounded: previousMotor.grounded,
    cameraYaw,
  });
  const desiredVelocity = locomotion.intent.horizontalVelocity;
  const stopping = Math.hypot(desiredVelocity[0], desiredVelocity[2]) < 0.01;
  const controlScale = previousMotor.grounded ? 1 : AIR_CONTROL_SCALE;
  const horizontalVelocity = approachPlanarVelocity(
    player.velocity,
    desiredVelocity,
    (stopping ? FOOT_DECELERATION : FOOT_ACCELERATION) *
      SIMULATION_DT *
      controlScale,
  );
  const motor = stepKinematicCharacter({
    position: player.pose.position,
    horizontalVelocity,
    jumpPressed: input.jumpPressed,
    dt: SIMULATION_DT,
    previous: previousMotor,
    world,
    additionalObstacles: createAfterlightVehicleObstacles(vehicles),
  });
  const position = clampWorld(motor.position);
  const velocity: Vec3 = [
    (position[0] - player.pose.position[0]) / SIMULATION_DT,
    (position[1] - player.pose.position[1]) / SIMULATION_DT,
    (position[2] - player.pose.position[2]) / SIMULATION_DT,
  ];
  const targetRotation = input.aim
    ? cameraYaw
    : locomotion.intent.facingRotationY;
  const rotationY =
    targetRotation === undefined
      ? player.pose.rotationY
      : rotateToward(
          player.pose.rotationY,
          targetRotation,
          (input.aim ? AIM_TURN_RATE : FOOT_TURN_RATE) * SIMULATION_DT,
        );

  return {
    actor: {
      ...player,
      pose: { position, rotationY },
      velocity,
    },
    locomotion: {
      grounded: motor.state.grounded,
      sprinting: locomotion.state.sprinting && motor.state.grounded,
      jumping: motor.state.jumping,
    },
    motor: motor.state,
  };
}

function exitPosition(vehicle: VehicleState): Vec3 {
  const right: Vec3 = [
    Math.cos(vehicle.pose.rotationY),
    0,
    -Math.sin(vehicle.pose.rotationY),
  ];
  return clampWorld([
    vehicle.pose.position[0] + right[0] * 2.45,
    1.15,
    vehicle.pose.position[2] + right[2] * 2.45,
  ]);
}

function coverObstacle(box: WorldCollisionBox): CharacterObstacle {
  return {
    id: `afterlight-cover:${box.id}`,
    minX: box.center[0] - box.halfExtents[0],
    maxX: box.center[0] + box.halfExtents[0],
    minY: box.center[1] - box.halfExtents[1],
    maxY: box.center[1] + box.halfExtents[1],
    minZ: box.center[2] - box.halfExtents[2],
    maxZ: box.center[2] + box.halfExtents[2],
  };
}

function coverGroundHeight(
  world: CharacterWorld,
  x: number,
  z: number,
): number {
  return world.sampleGround(x, z)?.height ?? 1.15;
}

function createMissionCoverAnchors(world: CharacterWorld) {
  return Object.freeze(
    AFTERLIGHT_MISSION_COVER.flatMap((box) => {
      const faces = [
        {
          suffix: "east",
          normal: [1, 0, 0] as Vec3,
          position: [
            box.center[0] + box.halfExtents[0] + HOSTILE_COVER_STANDOFF,
            box.center[1],
            box.center[2],
          ] as Vec3,
          peek: [
            box.center[0] + box.halfExtents[0] + HOSTILE_PEEK_OFFSET,
            box.center[1],
            box.center[2],
          ] as Vec3,
        },
        {
          suffix: "west",
          normal: [-1, 0, 0] as Vec3,
          position: [
            box.center[0] - box.halfExtents[0] - HOSTILE_COVER_STANDOFF,
            box.center[1],
            box.center[2],
          ] as Vec3,
          peek: [
            box.center[0] - box.halfExtents[0] - HOSTILE_PEEK_OFFSET,
            box.center[1],
            box.center[2],
          ] as Vec3,
        },
        {
          suffix: "north",
          normal: [0, 0, 1] as Vec3,
          position: [
            box.center[0],
            box.center[1],
            box.center[2] + box.halfExtents[2] + HOSTILE_COVER_STANDOFF,
          ] as Vec3,
          peek: [
            box.center[0],
            box.center[1],
            box.center[2] + box.halfExtents[2] + HOSTILE_PEEK_OFFSET,
          ] as Vec3,
        },
        {
          suffix: "south",
          normal: [0, 0, -1] as Vec3,
          position: [
            box.center[0],
            box.center[1],
            box.center[2] - box.halfExtents[2] - HOSTILE_COVER_STANDOFF,
          ] as Vec3,
          peek: [
            box.center[0],
            box.center[1],
            box.center[2] - box.halfExtents[2] - HOSTILE_PEEK_OFFSET,
          ] as Vec3,
        },
      ];

      return faces.map((face) => {
        const height = coverGroundHeight(
          world,
          face.position[0],
          face.position[2],
        );
        return Object.freeze({
          id: `${box.id}:${face.suffix}`,
          position: [face.position[0], height, face.position[2]] as Vec3,
          normal: face.normal,
          peekPositions: [[face.peek[0], height + 1.55, face.peek[2]] as Vec3],
          quality: box.id.startsWith("vault-") ? 2 : 1,
        });
      });
    }),
  );
}

function hostileVehicleDamage(actor: ActorState): number {
  return actor.kind === "police"
    ? HOSTILE_VEHICLE_DAMAGE.police
    : HOSTILE_VEHICLE_DAMAGE.guard;
}

function hostileActorDamage(actor: ActorState): number {
  return actor.kind === "police"
    ? HOSTILE_ACTOR_DAMAGE.police
    : HOSTILE_ACTOR_DAMAGE.guard;
}

function directionToward(origin: Vec3, target: Vec3): Vec3 {
  const dx = target[0] - origin[0];
  const dy = target[1] - origin[1];
  const dz = target[2] - origin[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= Number.EPSILON) return [0, 0, 1];
  return [dx / distance, dy / distance, dz / distance];
}

export class AfterlightStepController {
  readonly definition: AfterlightMissionDefinition;
  readonly step: RuntimeStep;

  private missionReducerState: MissionReducerState | undefined;
  private locomotion: LocomotionState = {
    grounded: true,
    sprinting: false,
    jumping: false,
  };
  private characterMotor: CharacterMotorState = INITIAL_CHARACTER_MOTOR_STATE;
  private readonly characterWorld: CharacterWorld;
  private readonly hostileCoverObstacles: readonly CharacterObstacle[];
  private readonly hostileAi: HostileAiSystem;
  private readonly hostileMotorStates = new Map<
    EntityId,
    CharacterMotorState
  >();
  private hostilePhysics = createAfterlightPhysicsQuery({
    actors: new Map(),
    vehicles: new Map(),
  });
  private cameraYaw: number | undefined;
  private cameraPitch = 0;
  private courierAgent: TrafficAgentState | undefined;
  private courierReservations: ReadonlyMap<string, IntersectionReservation> =
    new Map();
  private courierContactActive = false;

  constructor(
    seed: number,
    missionId: string = DEFAULT_AFTERLIGHT_CONTRACT_ID,
  ) {
    this.definition = createAfterlightMission(missionId, seed);
    this.characterWorld = createAfterlightCharacterWorld(seed);
    this.hostileCoverObstacles = AFTERLIGHT_MISSION_COVER.map(coverObstacle);
    this.hostileAi = new HostileAiSystem({
      seed: deriveSeed(seed, "afterlight-hostiles"),
      physics: {
        raycast: (query) => this.hostilePhysics.raycast(query),
      },
      coverAnchors: createMissionCoverAnchors(this.characterWorld),
      config: {
        perceptionChecksPerTick: 8,
        targetChecksPerObserver: 4,
        visionRange: 68,
        hearingRange: 140,
        reactionMinTicks: 18,
        reactionMaxTicks: 18,
        engageStopDistance: 15,
        seekCoverAfterTicks: 24,
        flankAfterDeniedTicks: 18,
        fireRange: 48,
        burstMinShots: 1,
        burstMaxShots: 1,
        shotIntervalTicks: 1,
        burstCooldownTicks: 42,
        maxSimultaneousShooters: 2,
      },
    });
    this.step = this.advance.bind(this);
  }

  getCameraYaw(fallback = 0): number {
    return this.cameraYaw ?? fallback;
  }

  getCameraPitch(): number {
    return this.cameraPitch;
  }

  advance(
    state: GameState,
    input: InputFrame,
    context: RuntimeStepContext,
  ): RuntimeStepResult {
    if (state.mission.failed) return { state };

    const events: GameEvent[] = [];
    const collections = copyCollections(state);
    const phase = this.definition.phases[state.mission.phaseIndex];
    const phaseId = phase?.id ?? AFTERLIGHT_PHASE_IDS.boost;
    const completed = new Set(state.mission.completedObjectiveIds);
    let player = collections.actors.get(state.playerId);
    let hero = collections.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (!player || !hero)
      throw new Error("Afterlight player or hero coupe is missing");

    let driving = hero.occupiedBy === player.id;
    if (driving) {
      this.characterMotor = INITIAL_CHARACTER_MOTOR_STATE;
      const previousHero = hero;
      const proposedHero = stepHeroCar(
        hero,
        input,
        SIMULATION_DT,
        hasAfterlightUpgradeMarker(state, "street-tune")
          ? STREET_TUNED_ARCADE_CAR_CONFIG
          : DEFAULT_ARCADE_CAR_CONFIG,
      );
      const clampedHero = {
        ...proposedHero,
        pose: {
          ...proposedHero.pose,
          position: clampWorld(proposedHero.pose.position),
        },
      };
      const buildingCollision = resolveVehicleBuildingCollision(
        previousHero,
        clampedHero,
        this.characterWorld.obstacles,
      );
      hero = buildingCollision.vehicle;
      if (buildingCollision.collision) {
        const impact = applyVehicleCollisionImpulse(hero, {
          impulse: buildingCollision.collision.impactSpeed,
          tick: context.tick,
        });
        hero = impact.vehicle;
        events.push(...impact.events);
      }
      collections.vehicles.set(hero.id, hero);
      player = {
        ...player,
        pose: {
          position: [hero.pose.position[0], 1.15, hero.pose.position[2]],
          rotationY: hero.pose.rotationY,
        },
        velocity: hero.velocity,
      };
      this.cameraYaw = hero.pose.rotationY;
      this.cameraPitch = 0;
      collections.actors.set(player.id, player);
    } else {
      const [lookYaw, lookPitch] =
        input.source === "gamepad" || input.source === "touch"
          ? [
              input.look[0] * AXIS_LOOK_SPEED * SIMULATION_DT,
              input.look[1] * AXIS_LOOK_SPEED * SIMULATION_DT,
            ]
          : [
              input.look[0] * POINTER_LOOK_SENSITIVITY,
              input.look[1] * POINTER_LOOK_SENSITIVITY,
            ];
      this.cameraYaw = normalizedAngle(
        (this.cameraYaw ?? player.pose.rotationY) - lookYaw,
      );
      this.cameraPitch = clampedPitch(this.cameraPitch - lookPitch);
      const stepped = stepFootPlayer(
        player,
        input,
        this.locomotion,
        this.characterMotor,
        this.characterWorld,
        collections.vehicles,
        this.cameraYaw,
      );
      this.locomotion = stepped.locomotion;
      this.characterMotor = stepped.motor;
      player = stepped.actor;
      collections.actors.set(player.id, player);
    }

    const startingAfterlightRun =
      input.interactPressed &&
      phaseId === AFTERLIGHT_PHASE_IDS.run &&
      driving &&
      isNear(hero.pose.position, AFTERLIGHT_LANDMARKS.bridgeLaunch, 9) &&
      !completed.has(AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun);

    if (startingAfterlightRun) {
      events.push(
        interactionEvent(
          context.tick,
          player.id,
          AFTERLIGHT_TAGS.startRun,
          hero.id,
        ),
      );
    } else if (input.interactPressed) {
      const distanceToHero = distanceXZ(
        player.pose.position,
        hero.pose.position,
      );
      if (
        !driving &&
        distanceToHero <= INTERACTION_DISTANCE &&
        hero.life === "active"
      ) {
        hero = { ...hero, occupiedBy: player.id };
        collections.vehicles.set(hero.id, hero);
        player = {
          ...player,
          pose: {
            position: [hero.pose.position[0], 1.15, hero.pose.position[2]],
            rotationY: hero.pose.rotationY,
          },
          velocity: hero.velocity,
        };
        collections.actors.set(player.id, player);
        driving = true;
        if (!completed.has(AFTERLIGHT_OBJECTIVE_IDS.stealCoupe)) {
          events.push(
            interactionEvent(
              context.tick,
              player.id,
              AFTERLIGHT_TAGS.stealCoupe,
              hero.id,
            ),
          );
          const crime = witnessedCrime(
            context.tick,
            "vehicle-theft",
            hero.pose.position,
            collections.actors,
          );
          if (crime) events.push(crime);
        }
      } else if (driving && vehiclePlanarSpeed(hero) <= 1.5) {
        hero = { ...hero, occupiedBy: undefined };
        collections.vehicles.set(hero.id, hero);
        player = {
          ...player,
          pose: {
            position: exitPosition(hero),
            rotationY: hero.pose.rotationY,
          },
          velocity: [0, 0, 0],
        };
        collections.actors.set(player.id, player);
        driving = false;
      }

      this.handleMissionInteraction(
        phaseId,
        completed,
        collections,
        events,
        context.tick,
        player,
        hero,
        driving,
      );
    }

    if (
      driving &&
      !completed.has(AFTERLIGHT_OBJECTIVE_IDS.learnDriving) &&
      vehiclePlanarSpeed(hero) >= 16
    ) {
      events.push(
        interactionEvent(
          context.tick,
          player.id,
          AFTERLIGHT_TAGS.drivingTutorial,
          hero.id,
        ),
      );
    }

    this.handleCourierCollision(
      phaseId,
      collections,
      events,
      context.tick,
      hero,
      driving,
    );
    this.stepCourierRoute(
      phaseId,
      collections,
      context.tick,
      context.dt,
      state.seed,
    );
    this.handleBlackoutStart(
      phaseId,
      completed,
      collections,
      events,
      context.tick,
    );
    const playerWeaponFired = this.handlePlayerWeapon(
      collections,
      events,
      context.tick,
      input,
      player,
    );
    const hostileGraceActive =
      context.tick - state.mission.startedAtTick <=
      this.definition.contract.hostileGraceTicks;
    if (!hostileGraceActive) {
      this.stepHostiles(
        phaseId,
        collections,
        events,
        context.tick,
        player,
        driving,
        state.heat.wantedLevel,
        state.heat.mode,
        playerWeaponFired,
      );
    }

    player = collections.actors.get(player.id) ?? player;
    hero = collections.vehicles.get(hero.id) ?? hero;
    if (hero.life === "destroyed" && hero.occupiedBy === player.id) {
      collections.vehicles.set(hero.id, { ...hero, occupiedBy: undefined });
      collections.actors.set(player.id, {
        ...player,
        pose: { position: exitPosition(hero), rotationY: hero.pose.rotationY },
        velocity: [0, 0, 0],
      });
    }

    const crimeEvent = [...events]
      .reverse()
      .find(
        (event): event is Extract<GameEvent, { type: "crime-witnessed" }> =>
          event.type === "crime-witnessed",
      );
    const currentPlayer = collections.actors.get(state.playerId) ?? player;
    const activePolice = POLICE_ACTORS.slice(
      0,
      activeAfterlightPoliceCount(
        this.definition.encounter,
        phaseId,
        state.heat.wantedLevel,
        state.heat.mode,
      ),
    )
      .map((id) => collections.actors.get(id))
      .filter((actor): actor is ActorState => actor?.life === "alive");
    const playerVisible = activePolice.some(
      (actor) =>
        distanceXZ(actor.pose.position, currentPlayer.pose.position) <= 52,
    );
    const heat = updateHeat(state.heat, {
      ...(crimeEvent ? { crime: crimeEvent.crime, witnessed: true } : {}),
      playerVisible,
      playerPosition: currentPlayer.pose.position,
      missionFloorLevel: heatFloorLevel(phase?.heatFloor),
    }).state;

    let working = stateWithCollections(
      { ...state, tick: context.tick, heat },
      collections,
    );
    const playerDown = working.actors.get(working.playerId)?.life === "down";
    const missionReduction = reduceMissionState(
      this.definition,
      working,
      events,
      this.missionReducerState,
      { fail: playerDown },
    );
    this.missionReducerState = missionReduction.reducerState;
    working = missionReduction.state;

    return {
      state: working,
      events: Object.freeze([...events, ...missionReduction.events]),
    };
  }

  private handleMissionInteraction(
    phaseId: string,
    completed: ReadonlySet<string>,
    collections: StepCollections,
    events: GameEvent[],
    tick: number,
    player: ActorState,
    hero: VehicleState,
    driving: boolean,
  ): void {
    if (phaseId === AFTERLIGHT_PHASE_IDS.keyholder && !driving) {
      const courier = collections.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier);
      if (
        courier?.life === "disabled" &&
        isNear(player.pose.position, courier.pose.position) &&
        alive(collections.actors, KEYHOLDER_GUARDS).length === 0 &&
        !collections.inventory.has(AFTERLIGHT_ITEMS.vaultCredential)
      ) {
        collections.inventory.add(AFTERLIGHT_ITEMS.vaultCredential);
        events.push(
          itemEvent(tick, player.id, AFTERLIGHT_ITEMS.vaultCredential),
        );
      }
      return;
    }

    if (
      phaseId === AFTERLIGHT_PHASE_IDS.vault &&
      !driving &&
      isNear(player.pose.position, AFTERLIGHT_LANDMARKS.vaultReader, 5.5)
    ) {
      if (
        !completed.has(AFTERLIGHT_OBJECTIVE_IDS.openVault) &&
        collections.inventory.has(AFTERLIGHT_ITEMS.vaultCredential)
      ) {
        events.push(
          interactionEvent(tick, player.id, AFTERLIGHT_TAGS.openVault),
        );
        return;
      }

      if (completed.has(AFTERLIGHT_OBJECTIVE_IDS.openVault)) {
        if (!collections.inventory.has(AFTERLIGHT_ITEMS.bearerBonds)) {
          collections.inventory.add(AFTERLIGHT_ITEMS.bearerBonds);
          events.push(itemEvent(tick, player.id, AFTERLIGHT_ITEMS.bearerBonds));
        }
        if (!collections.inventory.has(AFTERLIGHT_ITEMS.afterlightCore)) {
          collections.inventory.add(AFTERLIGHT_ITEMS.afterlightCore);
          events.push(
            itemEvent(tick, player.id, AFTERLIGHT_ITEMS.afterlightCore),
          );
          const crime = witnessedCrime(
            tick,
            "core-theft",
            player.pose.position,
            collections.actors,
          );
          if (crime) events.push(crime);
        }
      }
      return;
    }

    if (
      phaseId === AFTERLIGHT_PHASE_IDS.blackout &&
      !driving &&
      isNear(
        player.pose.position,
        AFTERLIGHT_LANDMARKS.substationControl,
        5.5,
      ) &&
      !completed.has(AFTERLIGHT_OBJECTIVE_IDS.primeBlackout)
    ) {
      events.push(
        interactionEvent(tick, player.id, AFTERLIGHT_TAGS.primeBlackout),
      );
      return;
    }

    if (
      phaseId === AFTERLIGHT_PHASE_IDS.debrief &&
      isNear(player.pose.position, AFTERLIGHT_LANDMARKS.safehouse, 10) &&
      collections.inventory.has(AFTERLIGHT_ITEMS.afterlightCore) &&
      !completed.has(AFTERLIGHT_OBJECTIVE_IDS.deliverAfterlightCore)
    ) {
      events.push(
        interactionEvent(tick, player.id, AFTERLIGHT_TAGS.deliverCore),
      );
    }
  }

  private handleCourierCollision(
    phaseId: string,
    collections: StepCollections,
    events: GameEvent[],
    tick: number,
    hero: VehicleState,
    driving: boolean,
  ): void {
    if (phaseId !== AFTERLIGHT_PHASE_IDS.keyholder || !driving) {
      this.courierContactActive = false;
      return;
    }
    const courier = collections.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier);
    if (!courier || courier.life !== "active") {
      this.courierContactActive = false;
      return;
    }
    const touching = isNear(hero.pose.position, courier.pose.position, 4.2);
    if (!touching) {
      this.courierContactActive = false;
      return;
    }
    if (this.courierContactActive) return;
    this.courierContactActive = true;

    const relativeSpeed = Math.hypot(
      hero.velocity[0] - courier.velocity[0],
      hero.velocity[2] - courier.velocity[2],
    );
    const result = applyVehicleCollisionImpulse(courier, {
      impulse: relativeSpeed * COURIER_COLLISION_IMPULSE_SCALE,
      tick,
      sourceId: hero.id,
    });
    const updated = result.disabled
      ? { ...result.vehicle, velocity: [0, 0, 0] as Vec3 }
      : result.vehicle;
    collections.vehicles.set(courier.id, updated);
    events.push(...result.events);

    if (result.disabled) {
      events.push(
        interactionEvent(
          tick,
          AFTERLIGHT_ENTITY_IDS.player,
          AFTERLIGHT_TAGS.courierDisabled,
          courier.id,
        ),
      );
    }
  }

  private stepCourierRoute(
    phaseId: string,
    collections: StepCollections,
    tick: number,
    dt: number,
    seed: number,
  ): void {
    if (phaseId !== AFTERLIGHT_PHASE_IDS.keyholder) {
      this.courierAgent = undefined;
      this.courierReservations = new Map();
      return;
    }

    const courier = collections.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier);
    if (!courier || courier.life !== "active") return;
    const routeId = courier.routeId ?? "courier-embarcadero";
    if (!this.courierAgent || this.courierAgent.route.routeId !== routeId) {
      const destination =
        COURIER_ROUTE_DESTINATIONS[routeId] ??
        DEFAULT_COURIER_ROUTE_DESTINATION;
      const route = findRouteBetween(
        DEFAULT_ROAD_GRAPH,
        courier.pose.position,
        destination,
        {
          mode: "vehicle",
          maxSnapDistance: COURIER_ROUTE_SNAP_DISTANCE,
          seed: deriveSeed(seed, `afterlight-courier-route:${routeId}`),
        },
      );
      if (!route) return;
      const created = createTrafficAgent(DEFAULT_ROAD_GRAPH, {
        id: courier.id,
        routeId,
        route,
        spawnedAtTick: tick,
        kind: "courier",
        health: courier.health,
        cruiseSpeedFactor: 0.92,
        rideHeight: 0,
      });
      this.courierAgent = {
        ...created,
        vehicle: courier,
        speed: vehiclePlanarSpeed(courier),
      };
    }

    const agent = { ...this.courierAgent, vehicle: courier };
    const agents = new Map([[courier.id, agent]]);
    this.courierReservations = resolveIntersectionReservations(
      DEFAULT_ROAD_GRAPH,
      agents,
      this.courierReservations,
      tick,
    );
    const stepped = stepTrafficAgent(
      DEFAULT_ROAD_GRAPH,
      agent,
      agents,
      this.courierReservations,
      dt,
      deriveSeed(seed, `afterlight-courier-traffic:${routeId}`),
    );
    this.courierAgent = stepped.agent;
    collections.vehicles.set(courier.id, stepped.agent.vehicle);
    const hero = collections.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (
      hero &&
      !isNear(hero.pose.position, stepped.agent.vehicle.pose.position, 4.2)
    ) {
      this.courierContactActive = false;
    }
  }

  private handleBlackoutStart(
    phaseId: string,
    completed: ReadonlySet<string>,
    collections: StepCollections,
    events: GameEvent[],
    tick: number,
  ): void {
    if (
      phaseId !== AFTERLIGHT_PHASE_IDS.blackout ||
      !completed.has(AFTERLIGHT_OBJECTIVE_IDS.primeBlackout) ||
      collections.inventory.has(INTERNAL_BLACKOUT_MARKER)
    ) {
      return;
    }

    collections.inventory.add(INTERNAL_BLACKOUT_MARKER);
    events.push({
      type: "setpiece-triggered",
      tick,
      setpieceId: AFTERLIGHT_TAGS.blackoutTriggered,
    });
  }

  private handlePlayerWeapon(
    collections: StepCollections,
    events: GameEvent[],
    tick: number,
    input: InputFrame,
    player: ActorState,
  ): boolean {
    const weapon = collections.weapons.get(SIGNAL_9_SPEC.id);
    if (!weapon) return false;
    const direction = directionFromYawPitch(
      this.cameraYaw ?? player.pose.rotationY,
      this.cameraPitch,
    );
    const result = stepSignal9(weapon, {
      tick,
      ownerId: player.id,
      input,
      origin: [
        player.pose.position[0],
        player.pose.position[1] + AFTERLIGHT_CHARACTER_WEAPON_OFFSET,
        player.pose.position[2],
      ],
      direction,
      actors: collections.actors,
      physics: createAfterlightPhysicsQuery(collections),
    });
    collections.weapons.set(SIGNAL_9_SPEC.id, result.state);

    if (result.damage) {
      damageActor(
        collections.actors,
        events,
        tick,
        result.damage.actorId,
        result.damage.amount,
        result.damage.sourceId,
      );
    } else if (
      result.shot?.trace.hit?.kind === "vehicle" &&
      result.shot.trace.hit.entityId !== undefined
    ) {
      damageVehicle(
        collections.vehicles,
        events,
        tick,
        result.shot.trace.hit.entityId,
        12,
        player.id,
      );
    }

    if (result.events.some((event) => event.type === "weapon-fired")) {
      const crime = witnessedCrime(
        tick,
        "gunfire",
        player.pose.position,
        collections.actors,
      );
      if (crime) events.push(crime);
    }

    return result.events.some((event) => event.type === "weapon-fired");
  }

  private stepHostiles(
    phaseId: string,
    collections: StepCollections,
    events: GameEvent[],
    tick: number,
    player: ActorState,
    driving: boolean,
    wantedLevel: 0 | 1 | 2 | 3,
    policeMode: PoliceMode,
    playerWeaponFired: boolean,
  ): void {
    const activeIds = this.syncHostiles(
      phaseId,
      wantedLevel,
      policeMode,
      collections,
      tick,
    );
    if (activeIds.length === 0) return;

    const currentPlayer = collections.actors.get(player.id);
    if (!currentPlayer) return;

    this.hostilePhysics = createAfterlightPhysicsQuery(collections);
    const intents = this.hostileAi.update({
      tick,
      actors: this.hostileActorFrames(activeIds, collections),
      targets: this.hostileTargets(
        currentPlayer,
        driving
          ? collections.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe)
          : undefined,
      ),
      noises: this.hostileNoises(
        tick,
        currentPlayer,
        wantedLevel,
        playerWeaponFired,
      ),
    });
    const dynamicObstacles = [
      ...this.hostileCoverObstacles,
      ...createAfterlightVehicleObstacles(collections.vehicles),
    ];

    for (const intent of intents) {
      const hostile = collections.actors.get(intent.actorId);
      if (!hostile || hostile.life !== "alive") continue;
      collections.actors.set(
        hostile.id,
        this.applyHostileMotion(hostile, intent, dynamicObstacles),
      );
    }

    this.hostilePhysics = createAfterlightPhysicsQuery(collections);
    for (const intent of intents) {
      if (!intent.fire) continue;
      this.applyHostileFire(
        collections,
        events,
        tick,
        intent,
        currentPlayer.id,
        driving,
      );
    }
  }

  private syncHostiles(
    phaseId: string,
    wantedLevel: 0 | 1 | 2 | 3,
    policeMode: PoliceMode,
    collections: StepCollections,
    tick: number,
  ): readonly EntityId[] {
    const activeIds = [
      ...activeGuardIds(phaseId),
      ...POLICE_ACTORS.slice(
        0,
        activeAfterlightPoliceCount(
          this.definition.encounter,
          phaseId,
          wantedLevel,
          policeMode,
        ),
      ),
    ].sort((left, right) => left - right);
    const activeSet = new Set(activeIds);

    for (const snapshot of this.hostileAi.snapshots()) {
      const actor = collections.actors.get(snapshot.actorId);
      if (
        !activeSet.has(snapshot.actorId) ||
        !actor ||
        actor.life !== "alive"
      ) {
        this.hostileAi.despawn(snapshot.actorId);
        this.hostileMotorStates.delete(snapshot.actorId);
      }
    }

    for (const actorId of activeIds) {
      const actor = collections.actors.get(actorId);
      const snapshot = this.hostileAi.get(actorId);
      if (!actor || actor.life !== "alive") continue;
      if (snapshot && snapshot.state !== "down") continue;
      if (snapshot) this.hostileAi.despawn(actorId);
      this.hostileAi.spawn({ actorId, spawnTick: tick });
      this.hostileMotorStates.set(actorId, INITIAL_CHARACTER_MOTOR_STATE);
    }

    return activeIds;
  }

  private hostileActorFrames(
    activeIds: readonly EntityId[],
    collections: StepCollections,
  ): readonly HostileActorFrame[] {
    return activeIds.flatMap((actorId) => {
      const actor = collections.actors.get(actorId);
      return actor
        ? [
            {
              actorId,
              position: actor.pose.position,
              health: actor.health,
              maxHealth: actor.kind === "police" ? 100 : 90,
              down: actor.life !== "alive",
            },
          ]
        : [];
    });
  }

  private hostileTargets(
    player: ActorState,
    occupiedVehicle: VehicleState | undefined,
  ): readonly HostileTargetFrame[] {
    if (occupiedVehicle?.occupiedBy === player.id) {
      return [
        {
          actorId: occupiedVehicle.id,
          position: occupiedVehicle.pose.position,
          velocity: occupiedVehicle.velocity,
          alive: occupiedVehicle.life !== "destroyed",
        },
      ];
    }

    return [
      {
        actorId: player.id,
        position: player.pose.position,
        velocity: player.velocity,
        alive: player.life === "alive",
      },
    ];
  }

  private hostileNoises(
    tick: number,
    player: ActorState,
    wantedLevel: 0 | 1 | 2 | 3,
    playerWeaponFired: boolean,
  ): readonly HostileNoiseStimulus[] {
    const noises: HostileNoiseStimulus[] = [];
    if (playerWeaponFired) {
      noises.push({
        id: `player-gunfire:${tick}`,
        position: player.pose.position,
        createdAtTick: tick,
        expiresAtTick: tick + 12,
        radius: this.hostileAi.config.hearingRange,
        sourceEntityId: player.id,
      });
    }
    if (wantedLevel > 0) {
      noises.push({
        id: `player-wanted:${tick}`,
        position: player.pose.position,
        createdAtTick: tick,
        expiresAtTick: tick,
        radius: this.hostileAi.config.hearingRange,
        sourceEntityId: player.id,
      });
    }
    return noises;
  }

  private applyHostileMotion(
    actor: ActorState,
    intent: HostileIntent,
    additionalObstacles: readonly CharacterObstacle[],
  ): ActorState {
    const faceTarget = intent.aimAt ?? intent.move?.target;
    const desiredRotation =
      faceTarget === undefined
        ? actor.pose.rotationY
        : Math.atan2(
            faceTarget[0] - actor.pose.position[0],
            faceTarget[2] - actor.pose.position[2],
          );
    const move = intent.move;
    if (!move) {
      return {
        ...actor,
        pose: { ...actor.pose, rotationY: desiredRotation },
        velocity: [0, 0, 0],
      };
    }

    const dx = move.target[0] - actor.pose.position[0];
    const dz = move.target[2] - actor.pose.position[2];
    const distance = Math.hypot(dx, dz);
    const horizontalVelocity: Vec3 =
      distance > move.stopDistance
        ? [(dx / distance) * move.speed, 0, (dz / distance) * move.speed]
        : [0, 0, 0];
    const motor = stepKinematicCharacter({
      position: actor.pose.position,
      horizontalVelocity,
      jumpPressed: false,
      dt: SIMULATION_DT,
      previous:
        this.hostileMotorStates.get(actor.id) ?? INITIAL_CHARACTER_MOTOR_STATE,
      world: this.characterWorld,
      additionalObstacles,
    });
    this.hostileMotorStates.set(actor.id, motor.state);
    const position = clampWorld(motor.position);

    return {
      ...actor,
      pose: { position, rotationY: desiredRotation },
      velocity: [
        (position[0] - actor.pose.position[0]) / SIMULATION_DT,
        (position[1] - actor.pose.position[1]) / SIMULATION_DT,
        (position[2] - actor.pose.position[2]) / SIMULATION_DT,
      ],
    };
  }

  private applyHostileFire(
    collections: StepCollections,
    events: GameEvent[],
    tick: number,
    intent: HostileIntent,
    playerId: EntityId,
    driving: boolean,
  ): void {
    const fire = intent.fire;
    const shooter = collections.actors.get(intent.actorId);
    if (!fire || !shooter || shooter.life !== "alive") return;

    const hero = collections.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    const player = collections.actors.get(playerId);
    const targetPoint: Vec3 | undefined =
      driving && hero?.occupiedBy === playerId
        ? [
            hero.pose.position[0],
            hero.pose.position[1] + 0.72,
            hero.pose.position[2],
          ]
        : player
          ? [
              player.pose.position[0],
              player.pose.position[1] + AFTERLIGHT_CHARACTER_HIT_CENTER_OFFSET,
              player.pose.position[2],
            ]
          : undefined;
    if (!targetPoint) return;

    const trace = traceHitscan(this.hostilePhysics, {
      origin: fire.origin,
      direction: directionToward(fire.origin, targetPoint),
      maxDistance: HOSTILE_HITSCAN_RANGE,
      sourceEntityId: shooter.id,
    });
    if (!trace.hit) return;

    if (driving) {
      if (
        hero?.occupiedBy === playerId &&
        ((trace.hit.kind === "vehicle" &&
          trace.hit.entityId === AFTERLIGHT_ENTITY_IDS.heroCoupe) ||
          (trace.hit.kind === "actor" && trace.hit.entityId === playerId))
      ) {
        damageVehicle(
          collections.vehicles,
          events,
          tick,
          hero.id,
          hostileVehicleDamage(shooter),
          shooter.id,
        );
      }
      return;
    }

    if (trace.hit.kind === "actor" && trace.hit.entityId === playerId) {
      damageActor(
        collections.actors,
        events,
        tick,
        playerId,
        hostileActorDamage(shooter),
        shooter.id,
      );
    }
  }
}

export function createAfterlightStep(
  seed: number,
  missionId: string = DEFAULT_AFTERLIGHT_CONTRACT_ID,
): RuntimeStep {
  return new AfterlightStepController(seed, missionId).step;
}

export function restoreAfterlightCheckpointState(state: GameState): GameState {
  const checkpoint = afterlightCheckpoint(state.checkpointId);
  const initialActors = createInitialAfterlightActors(
    selectAfterlightEncounter(state.seed),
  );
  const actors = new Map(state.actors);

  for (const [id, initial] of initialActors) {
    if (id === state.playerId) continue;
    const existing = actors.get(id);
    actors.set(id, {
      ...initial,
      ...(existing?.kind === "police" ? { pose: existing.pose } : {}),
    });
  }

  const player = actors.get(state.playerId);
  if (!player)
    throw new Error(`Cannot restore missing player ${state.playerId}`);
  actors.set(state.playerId, {
    ...player,
    pose: checkpoint.pose,
    velocity: [0, 0, 0],
    health: hasAfterlightUpgradeMarker(state, "trauma-plates") ? 125 : 100,
    life: "alive",
  });

  const vehicles = new Map(state.vehicles);
  const hero = vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
  if (hero) {
    vehicles.set(hero.id, {
      ...hero,
      pose: checkpoint.vehiclePose ?? hero.pose,
      velocity: [0, 0, 0],
      health: hasAfterlightUpgradeMarker(state, "reinforced-chassis")
        ? 125
        : 100,
      life: "active",
      occupiedBy: undefined,
    });
  }

  const definition = createAfterlightMission(
    state.mission.missionId,
    state.seed,
  );
  const restored = restoreMissionState(definition, {
    ...state,
    tick: 0,
    actors,
    vehicles,
    heat: { value: 0, wantedLevel: 0, mode: "patrol", unseenTicks: 0 },
    mission: { ...state.mission, startedAtTick: 0 },
  });
  return restored.state;
}

export function missionReducerForState(
  definition: MissionDefinition,
  state: GameState,
): MissionReducerState {
  return createMissionReducerState(definition, state);
}
