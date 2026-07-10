import {
  applyActorDamage,
  stepGroundedLocomotion,
  type ActorLifecycleEvent,
  type LocomotionState,
} from "../actors";
import { updateHeat } from "../ai/police/heat";
import { stepSignal9, SIGNAL_9_SPEC } from "../combat";
import {
  AFTERLIGHT_ITEMS,
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
  AFTERLIGHT_TAGS,
  createAfterlightJob,
} from "../missions/afterlight-job";
import {
  createMissionReducerState,
  reduceMissionState,
  restoreMissionState,
  type MissionReducerState,
} from "../missions/reducer";
import { stepHeroCar, vehiclePlanarSpeed } from "../vehicles";
import {
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_LANDMARKS,
  afterlightCheckpoint,
  createInitialAfterlightActors,
} from "./afterlight-state";
import { createAfterlightPhysicsQuery } from "./afterlight-physics";
import { SIMULATION_DT } from "./contracts";
import type {
  ActorState,
  CrimeKind,
  EntityId,
  GameEvent,
  GameState,
  InputFrame,
  MissionDefinition,
  Vec3,
  VehicleState,
  WeaponState,
} from "./contracts";
import type {
  RuntimeStep,
  RuntimeStepContext,
  RuntimeStepResult,
} from "./runtime";

const PLAYER_LOOK_SENSITIVITY = 0.025;
const INTERACTION_DISTANCE = 7;
const HOSTILE_STOP_DISTANCE = 9;
const HOSTILE_FIRE_DISTANCE = 34;
const INTERNAL_BLACKOUT_MARKER = "afterlight:blackout:active";

const KEYHOLDER_GUARDS: readonly EntityId[] = Object.freeze([
  AFTERLIGHT_ENTITY_IDS.keyholderGuardA,
  AFTERLIGHT_ENTITY_IDS.keyholderGuardB,
]);
const VAULT_GUARDS: readonly EntityId[] = Object.freeze([
  AFTERLIGHT_ENTITY_IDS.vaultGuardA,
  AFTERLIGHT_ENTITY_IDS.vaultGuardB,
  AFTERLIGHT_ENTITY_IDS.vaultGuardC,
  AFTERLIGHT_ENTITY_IDS.vaultGuardD,
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

function heatFloorLevel(value: number | undefined): 0 | 1 | 2 | 3 {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3, Math.round(value))) as 0 | 1 | 2 | 3;
}

function clampWorld(position: Vec3): Vec3 {
  const z = Math.max(-198, Math.min(98, position[2]));
  const bridgeHalfWidth = z < -98 ? 7.25 : 96;
  return [
    Math.max(-bridgeHalfWidth, Math.min(bridgeHalfWidth, position[0])),
    position[1],
    z,
  ];
}

function playerForward(rotationY: number): Vec3 {
  return [Math.sin(rotationY), 0, Math.cos(rotationY)];
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
): { actor: ActorState; locomotion: LocomotionState } {
  const cameraYaw = normalizedAngle(
    player.pose.rotationY + input.look[0] * PLAYER_LOOK_SENSITIVITY,
  );
  const locomotion = stepGroundedLocomotion(previous, input, {
    grounded: true,
    cameraYaw,
  });
  const velocity = locomotion.intent.horizontalVelocity;
  const position = clampWorld([
    player.pose.position[0] + velocity[0] * SIMULATION_DT,
    1.15,
    player.pose.position[2] + velocity[2] * SIMULATION_DT,
  ]);
  const rotationY = input.aim
    ? cameraYaw
    : (locomotion.intent.facingRotationY ?? cameraYaw);

  return {
    actor: {
      ...player,
      pose: { position, rotationY },
      velocity: [velocity[0], 0, velocity[2]],
    },
    locomotion: locomotion.state,
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

function moveToward(
  actor: ActorState,
  target: Vec3,
  speed: number,
): ActorState {
  const dx = target[0] - actor.pose.position[0];
  const dz = target[2] - actor.pose.position[2];
  const distance = Math.hypot(dx, dz);
  if (distance <= Number.EPSILON) return actor;
  const vx = (dx / distance) * speed;
  const vz = (dz / distance) * speed;
  return {
    ...actor,
    pose: {
      position: clampWorld([
        actor.pose.position[0] + vx * SIMULATION_DT,
        1.15,
        actor.pose.position[2] + vz * SIMULATION_DT,
      ]),
      rotationY: Math.atan2(vx, vz),
    },
    velocity: [vx, 0, vz],
  };
}

export class AfterlightStepController {
  readonly definition: MissionDefinition;
  readonly step: RuntimeStep;

  private missionReducerState: MissionReducerState | undefined;
  private locomotion: LocomotionState = {
    grounded: true,
    sprinting: false,
    jumping: false,
  };

  constructor(seed: number) {
    this.definition = createAfterlightJob(seed);
    this.step = this.advance.bind(this);
  }

  advance(
    state: GameState,
    input: InputFrame,
    context: RuntimeStepContext,
  ): RuntimeStepResult {
    if (state.mission.completed || state.mission.failed) return { state };

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
      hero = stepHeroCar(hero, input);
      hero = {
        ...hero,
        pose: { ...hero.pose, position: clampWorld(hero.pose.position) },
      };
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
    } else {
      const stepped = stepFootPlayer(player, input, this.locomotion);
      this.locomotion = stepped.locomotion;
      player = stepped.actor;
      collections.actors.set(player.id, player);
    }

    if (input.interactPressed) {
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
    this.handleBlackoutStart(
      phaseId,
      completed,
      collections,
      events,
      context.tick,
    );
    this.handlePlayerWeapon(collections, events, context.tick, input, player);
    this.stepHostiles(
      phaseId,
      collections,
      events,
      context.tick,
      player,
      driving,
      state.heat.wantedLevel,
    );

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
    const activePolice = POLICE_ACTORS.slice(0, state.heat.wantedLevel)
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
      phaseId === AFTERLIGHT_PHASE_IDS.run &&
      driving &&
      isNear(hero.pose.position, AFTERLIGHT_LANDMARKS.bridgeLaunch, 9) &&
      !completed.has(AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun)
    ) {
      events.push(interactionEvent(tick, player.id, AFTERLIGHT_TAGS.startRun));
      return;
    }

    if (
      phaseId === AFTERLIGHT_PHASE_IDS.debrief &&
      isNear(player.pose.position, AFTERLIGHT_LANDMARKS.safehouse, 10) &&
      collections.inventory.has(AFTERLIGHT_ITEMS.afterlightCore)
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
    if (phaseId !== AFTERLIGHT_PHASE_IDS.keyholder || !driving) return;
    const courier = collections.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier);
    if (!courier || courier.life !== "active") return;
    const speed = vehiclePlanarSpeed(hero);
    if (speed < 8 || !isNear(hero.pose.position, courier.pose.position, 4.2))
      return;

    damageVehicle(
      collections.vehicles,
      events,
      tick,
      courier.id,
      Math.max(80, speed * 6),
      hero.id,
    );
    const updated = collections.vehicles.get(courier.id);
    if (updated?.life === "disabled") {
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
  ): void {
    const weapon = collections.weapons.get(SIGNAL_9_SPEC.id);
    if (!weapon) return;
    const direction = playerForward(player.pose.rotationY);
    const result = stepSignal9(weapon, {
      tick,
      ownerId: player.id,
      input,
      origin: [
        player.pose.position[0],
        player.pose.position[1] + 1.25,
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
  }

  private stepHostiles(
    phaseId: string,
    collections: StepCollections,
    events: GameEvent[],
    tick: number,
    player: ActorState,
    driving: boolean,
    wantedLevel: 0 | 1 | 2 | 3,
  ): void {
    const guards = activeGuardIds(phaseId);
    const heatPolice = POLICE_ACTORS.slice(0, wantedLevel);
    const ids = [...guards, ...heatPolice];

    for (const id of ids) {
      let hostile = collections.actors.get(id);
      const currentPlayer = collections.actors.get(player.id);
      if (!hostile || hostile.life !== "alive" || !currentPlayer) continue;
      const distance = distanceXZ(
        hostile.pose.position,
        currentPlayer.pose.position,
      );
      if (distance > HOSTILE_STOP_DISTANCE) {
        hostile = moveToward(
          hostile,
          currentPlayer.pose.position,
          hostile.kind === "police" ? 6.2 : 4.2,
        );
        collections.actors.set(id, hostile);
      } else {
        collections.actors.set(id, { ...hostile, velocity: [0, 0, 0] });
      }

      if (
        distance <= HOSTILE_FIRE_DISTANCE &&
        (tick + id * 7) % (hostile.kind === "police" ? 54 : 66) === 0
      ) {
        if (driving) {
          damageVehicle(
            collections.vehicles,
            events,
            tick,
            AFTERLIGHT_ENTITY_IDS.heroCoupe,
            hostile.kind === "police" ? 4 : 6,
            hostile.id,
          );
        } else {
          damageActor(
            collections.actors,
            events,
            tick,
            player.id,
            hostile.kind === "police" ? 7 : 9,
            hostile.id,
          );
        }
      }
    }
  }
}

export function createAfterlightStep(seed: number): RuntimeStep {
  return new AfterlightStepController(seed).step;
}

export function restoreAfterlightCheckpointState(state: GameState): GameState {
  const checkpoint = afterlightCheckpoint(state.checkpointId);
  const initialActors = createInitialAfterlightActors();
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
    health: 100,
    life: "alive",
  });

  const vehicles = new Map(state.vehicles);
  const hero = vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
  if (hero) {
    vehicles.set(hero.id, {
      ...hero,
      pose: checkpoint.vehiclePose ?? hero.pose,
      velocity: [0, 0, 0],
      health: 100,
      life: "active",
      occupiedBy: undefined,
    });
  }

  const definition = createAfterlightJob(state.seed);
  const restored = restoreMissionState(definition, {
    ...state,
    actors,
    vehicles,
    heat: { value: 0, wantedLevel: 0, mode: "patrol", unseenTicks: 0 },
  });
  return restored.state;
}

export function missionReducerForState(
  definition: MissionDefinition,
  state: GameState,
): MissionReducerState {
  return createMissionReducerState(definition, state);
}
