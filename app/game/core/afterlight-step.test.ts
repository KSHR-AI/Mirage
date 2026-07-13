import { describe, expect, it } from "vitest";
import { LOCOMOTION_TUNING } from "../actors/locomotion";
import {
  AFTERLIGHT_ITEMS,
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
} from "../missions/afterlight-job";
import {
  EMPTY_INPUT_FRAME,
  SIMULATION_DT,
  SIMULATION_HZ,
  type ActorState,
  type GameEvent,
  type GameState,
  type InputFrame,
  type Vec3,
  type VehicleState,
} from "./contracts";
import {
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_CHECKPOINTS,
  AFTERLIGHT_LANDMARKS,
  createInitialAfterlightState,
} from "./afterlight-state";
import {
  AfterlightStepController,
  createAfterlightStep,
  restoreAfterlightCheckpointState,
} from "./afterlight-step";
import { RngStreams } from "./rng";
import { createGameRuntime } from "./runtime";
import { vehiclePlanarExtents, vehiclePlanarSpeed } from "../vehicles";
import { applyAfterlightUpgrade } from "../progression";
import { createAfterlightCharacterWorld } from "../world/afterlight-character-world";
import { AFTERLIGHT_CHARACTER_TUNING } from "../world/character-controller";

function input(
  values: Partial<typeof EMPTY_INPUT_FRAME>,
): typeof EMPTY_INPUT_FRAME {
  return { ...EMPTY_INPUT_FRAME, ...values };
}

class AfterlightScenario {
  state: GameState;
  readonly controller: AfterlightStepController;
  readonly rng: RngStreams;

  constructor(missionId = "afterlight-job") {
    this.state = createInitialAfterlightState(2407, missionId);
    this.controller = new AfterlightStepController(
      this.state.seed,
      this.state.mission.missionId,
    );
    this.rng = new RngStreams(this.state.seed);
  }

  step(values: Partial<InputFrame> = {}): readonly GameEvent[] {
    const frame = input(values);
    const emitted: GameEvent[] = [];
    const result = this.controller.advance(this.state, frame, {
      dt: SIMULATION_DT,
      hz: SIMULATION_HZ,
      tick: this.state.tick + 1,
      input: frame,
      rng: this.rng,
      random: (streamName) => this.rng.stream(streamName),
      emit: (event) => emitted.push(event),
    });
    this.state = result.state;
    return [...emitted, ...(result.events ?? [])];
  }

  stepMany(count: number, values: Partial<InputFrame> = {}): void {
    for (let index = 0; index < count; index += 1) this.step(values);
  }

  placeActor(
    id: number,
    position: Vec3,
    rotationY = 0,
    changes: Partial<ActorState> = {},
  ): void {
    const actors = new Map(this.state.actors);
    const current = actors.get(id);
    if (!current) throw new Error(`missing actor fixture ${id}`);
    actors.set(id, {
      ...current,
      ...changes,
      pose: { position, rotationY },
    });
    this.state = { ...this.state, actors };
  }

  placeVehicle(
    id: number,
    position: Vec3,
    rotationY = 0,
    changes: Partial<VehicleState> = {},
  ): void {
    const vehicles = new Map(this.state.vehicles);
    const current = vehicles.get(id);
    if (!current) throw new Error(`missing vehicle fixture ${id}`);
    vehicles.set(id, {
      ...current,
      ...changes,
      pose: { position, rotationY },
    });
    this.state = { ...this.state, vehicles };
  }

  readyWeapon(): void {
    const weapons = new Map(this.state.weapons);
    const weapon = weapons.get("signal-9");
    if (!weapon) throw new Error("missing Signal-9 fixture");
    weapons.set(weapon.id, { ...weapon, cooldownTicks: 0 });
    this.state = { ...this.state, weapons };
  }

  setPhase(phaseId: string): void {
    const phaseIndex = this.controller.definition.phases.findIndex(
      (phase) => phase.id === phaseId,
    );
    if (phaseIndex < 0) throw new Error(`missing phase fixture ${phaseId}`);
    this.state = {
      ...this.state,
      mission: { ...this.state.mission, phaseIndex },
    };
  }

  setWantedLevel(wantedLevel: 0 | 1 | 2 | 3): void {
    this.state = {
      ...this.state,
      heat: {
        ...this.state.heat,
        value: wantedLevel,
        wantedLevel,
      },
    };
  }

  activateCourierChase(): void {
    this.state = {
      ...this.state,
      mission: {
        ...this.state.mission,
        phaseIndex: 1,
        completedObjectiveIds: [
          AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
          AFTERLIGHT_OBJECTIVE_IDS.learnDriving,
          AFTERLIGHT_OBJECTIVE_IDS.reachMission,
        ],
      },
    };
  }
}

function placeHeroForBuildingImpact(scenario: AfterlightScenario) {
  const world = createAfterlightCharacterWorld(scenario.state.seed);
  const hero = scenario.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
  if (!hero) throw new Error("missing hero coupe fixture");
  const rotationY = 0;
  const extents = vehiclePlanarExtents({
    ...hero,
    pose: { ...hero.pose, rotationY },
  });
  const obstacle = world.obstacles.find((candidate) => {
    const x = (candidate.minX + candidate.maxX) * 0.5;
    const z = candidate.maxZ + extents.z + 0.2;
    if (z >= 95) return false;
    return world.obstacles.every(
      (other) =>
        other.id === candidate.id ||
        x <= other.minX - extents.x ||
        x >= other.maxX + extents.x ||
        z <= other.minZ - extents.z ||
        z >= other.maxZ + extents.z,
    );
  });
  if (!obstacle) throw new Error("missing clear building impact fixture");
  const position: Vec3 = [
    (obstacle.minX + obstacle.maxX) * 0.5,
    0.72,
    obstacle.maxZ + extents.z + 0.2,
  ];
  scenario.placeVehicle(AFTERLIGHT_ENTITY_IDS.heroCoupe, position, rotationY, {
    occupiedBy: AFTERLIGHT_ENTITY_IDS.player,
    velocity: [0, 0, -26],
    health: 100,
    life: "active",
  });
  scenario.placeActor(
    AFTERLIGHT_ENTITY_IDS.player,
    [position[0], 1.15, position[2]],
    rotationY,
  );
  return { obstacle, extents };
}

describe("Afterlight step", () => {
  it("uses the purchased street tune in the deterministic driving step", () => {
    const standard = new AfterlightScenario();
    const tuned = new AfterlightScenario();
    tuned.state = applyAfterlightUpgrade(tuned.state, "street-tune");

    for (const scenario of [standard, tuned]) {
      scenario.placeVehicle(AFTERLIGHT_ENTITY_IDS.heroCoupe, [0, 0.72, 70], 0, {
        occupiedBy: AFTERLIGHT_ENTITY_IDS.player,
        velocity: [0, 0, 0],
      });
      scenario.placeActor(AFTERLIGHT_ENTITY_IDS.player, [0, 1.15, 70]);
      scenario.stepMany(60, { sprint: true, throttle: 1 });
    }

    const standardHero = standard.state.vehicles.get(
      AFTERLIGHT_ENTITY_IDS.heroCoupe,
    );
    const tunedHero = tuned.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (!standardHero || !tunedHero) throw new Error("missing coupe fixture");
    expect(vehiclePlanarSpeed(tunedHero)).toBeGreaterThan(
      vehiclePlanarSpeed(standardHero) + 2,
    );
  });

  it("keeps forward locomotion aligned with pointer-controlled camera yaw", () => {
    const scenario = new AfterlightScenario();
    const initial = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!initial) throw new Error("missing player fixture");

    scenario.step({ look: [8, 0] });
    const turned = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!turned) throw new Error("missing player after look input");
    expect(turned.pose.rotationY).toBeCloseTo(initial.pose.rotationY);
    const cameraYaw = initial.pose.rotationY - 8 * 0.025;

    const before = turned.pose.position;
    scenario.stepMany(30, { move: [0, 1] });
    const moved = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!moved) throw new Error("missing player after movement");
    const displacement = [
      moved.pose.position[0] - before[0],
      moved.pose.position[2] - before[2],
    ] as const;
    const forward = [Math.sin(cameraYaw), Math.cos(cameraYaw)] as const;
    expect(
      displacement[0] * forward[0] + displacement[1] * forward[1],
    ).toBeCloseTo(Math.hypot(...displacement), 5);
  });

  it("simulates a jump arc and returns the player to the street", () => {
    const scenario = new AfterlightScenario();
    const before = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!before) throw new Error("missing player fixture");

    scenario.step({ jumpPressed: true });
    const rising = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!rising) throw new Error("missing jumping player");
    expect(rising.pose.position[1]).toBeGreaterThan(before.pose.position[1]);
    expect(rising.velocity[1]).toBeGreaterThan(0);

    scenario.stepMany(120);
    const landed = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    expect(landed?.pose.position[1]).toBeCloseTo(1.165);
    expect(landed?.velocity[1]).toBeCloseTo(0);
  });

  it("slides against the same procedural building footprints that are rendered", () => {
    const scenario = new AfterlightScenario();
    const world = createAfterlightCharacterWorld(scenario.state.seed);
    const obstacle = world.obstacles[0];
    if (!obstacle) throw new Error("missing procedural building fixture");
    const x = (obstacle.minX + obstacle.maxX) * 0.5;
    const z = obstacle.minZ - AFTERLIGHT_CHARACTER_TUNING.radius - 0.02;
    const ground = world.sampleGround(x, z);
    if (!ground) throw new Error("missing ground beside building fixture");
    scenario.placeActor(AFTERLIGHT_ENTITY_IDS.player, [x, ground.height, z], 0);

    scenario.stepMany(30, { move: [0, 1] });
    const player = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);

    expect(player?.pose.position[2]).toBeCloseTo(
      obstacle.minZ - AFTERLIGHT_CHARACTER_TUNING.radius,
    );
    expect(player?.pose.position[0]).toBeCloseTo(x);
  });

  it("stops at a parked vehicle while preserving the enter interaction", () => {
    const scenario = new AfterlightScenario();
    const initialHero = scenario.state.vehicles.get(
      AFTERLIGHT_ENTITY_IDS.heroCoupe,
    );
    if (!initialHero) throw new Error("missing coupe fixture");
    scenario.placeActor(
      AFTERLIGHT_ENTITY_IDS.player,
      [initialHero.pose.position[0], 1.15, initialHero.pose.position[2] + 6],
      Math.PI,
    );

    scenario.stepMany(120, { move: [0, 1] });
    const stopped = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    const hero = scenario.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (!stopped || !hero) throw new Error("missing player or coupe fixture");

    expect(stopped.pose.position[2]).toBeCloseTo(
      hero.pose.position[2] + 2.2 + AFTERLIGHT_CHARACTER_TUNING.radius,
    );
    scenario.step({ interactPressed: true });
    expect(
      scenario.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe)?.occupiedBy,
    ).toBe(AFTERLIGHT_ENTITY_IDS.player);
  });

  it("leaves a clear forward walking lane beside the starting coupe", () => {
    const scenario = new AfterlightScenario();
    const before = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    const hero = scenario.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (!before || !hero) throw new Error("missing player or coupe fixture");

    scenario.stepMany(120, { move: [0, 1] });
    const after = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!after) throw new Error("missing moved player fixture");

    expect(after.pose.position[2]).toBeLessThan(
      hero.pose.position[2] + 2.2 + AFTERLIGHT_CHARACTER_TUNING.radius,
    );
    expect(after.pose.position[0]).toBeCloseTo(before.pose.position[0]);
  });

  it("accelerates, brakes, and preserves facing without idle snapping", () => {
    const scenario = new AfterlightScenario();
    scenario.placeVehicle(AFTERLIGHT_ENTITY_IDS.heroCoupe, [20, 0.72, 20], 0);

    scenario.step({ move: [1, 1] });
    const first = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!first) throw new Error("missing accelerating player fixture");
    const firstSpeed = Math.hypot(first.velocity[0], first.velocity[2]);
    expect(firstSpeed).toBeGreaterThan(0);
    expect(firstSpeed).toBeLessThan(2.6);

    scenario.stepMany(20, { move: [1, 1] });
    const moving = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!moving) throw new Error("missing moving player fixture");
    const movingYaw = moving.pose.rotationY;
    const movingSpeed = Math.hypot(moving.velocity[0], moving.velocity[2]);
    expect(movingSpeed).toBeCloseTo(LOCOMOTION_TUNING.walkSpeed, 1);

    scenario.step();
    const braking = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!braking) throw new Error("missing braking player fixture");
    const brakingSpeed = Math.hypot(braking.velocity[0], braking.velocity[2]);
    expect(brakingSpeed).toBeGreaterThan(0);
    expect(brakingSpeed).toBeLessThan(movingSpeed);
    expect(braking.pose.rotationY).toBeCloseTo(movingYaw);
  });

  it("turns entering the hero coupe into the first mission objective", () => {
    const initial = createInitialAfterlightState();
    const runtime = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed),
    );

    runtime.command(input({ interactPressed: true }));
    const events = runtime.advance();

    expect(
      runtime.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe)?.occupiedBy,
    ).toBe(AFTERLIGHT_ENTITY_IDS.player);
    expect(runtime.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "objective-completed",
        objectiveId: AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
      }),
    );
  });

  it("completes the driving lesson once the coupe reaches speed", () => {
    const initial = createInitialAfterlightState();
    const runtime = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed),
    );
    runtime.command(input({ interactPressed: true }));
    runtime.advance();

    for (let tick = 0; tick < 150; tick += 1) {
      runtime.command(input({ throttle: 1 }));
      runtime.advance();
    }

    expect(runtime.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.learnDriving,
    );
  });

  it("starts the coupe facing the Mission intercept", () => {
    const initial = createInitialAfterlightState();
    const runtime = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed),
    );
    const start = initial.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (!start) throw new Error("missing opening coupe");
    const startDistance = Math.hypot(
      start.pose.position[0] - AFTERLIGHT_LANDMARKS.missionIntercept[0],
      start.pose.position[2] - AFTERLIGHT_LANDMARKS.missionIntercept[2],
    );

    runtime.command(input({ interactPressed: true }));
    runtime.advance();
    for (let tick = 0; tick < 60; tick += 1) {
      runtime.command(input({ throttle: 1 }));
      runtime.advance();
    }

    const moved = runtime.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (!moved) throw new Error("missing driven coupe");
    const movedDistance = Math.hypot(
      moved.pose.position[0] - AFTERLIGHT_LANDMARKS.missionIntercept[0],
      moved.pose.position[2] - AFTERLIGHT_LANDMARKS.missionIntercept[2],
    );
    expect(moved.pose.position[2]).toBeLessThan(start.pose.position[2]);
    expect(movedDistance).toBeLessThan(startDistance);
  });

  it("prevents the hero coupe from penetrating rendered building footprints", () => {
    const scenario = new AfterlightScenario();
    const { obstacle, extents } = placeHeroForBuildingImpact(scenario);

    scenario.stepMany(90, { throttle: 1 });

    const hero = scenario.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    expect(hero?.pose.position[2]).toBeGreaterThanOrEqual(
      obstacle.maxZ + extents.z,
    );
    expect(hero?.pose.position[0]).toBeGreaterThan(obstacle.minX - extents.x);
    expect(hero?.pose.position[0]).toBeLessThan(obstacle.maxX + extents.x);
  });

  it("emits deterministic damage once for the same building impact", () => {
    const collide = () => {
      const scenario = new AfterlightScenario();
      placeHeroForBuildingImpact(scenario);
      const events = scenario
        .step({ throttle: 1 })
        .filter(
          (event) =>
            event.type === "vehicle-damaged" ||
            event.type === "vehicle-disabled",
        );
      return {
        events,
        vehicle: scenario.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe),
      };
    };

    const first = collide();
    const second = collide();

    expect(first).toEqual(second);
    expect(first.events).toEqual([
      {
        type: "vehicle-damaged",
        tick: 1,
        vehicleId: AFTERLIGHT_ENTITY_IDS.heroCoupe,
        amount: 33,
      },
    ]);
    expect(first.vehicle).toMatchObject({ health: 67, life: "active" });
  });

  it("advances the active courier along its road route after 120 neutral ticks", () => {
    const scenario = new AfterlightScenario();
    scenario.activateCourierChase();
    const initial = scenario.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier);
    if (!initial) throw new Error("missing courier fixture");

    scenario.step();
    const routeStart = scenario.state.vehicles.get(
      AFTERLIGHT_ENTITY_IDS.courier,
    );
    if (!routeStart) throw new Error("missing courier route start");
    scenario.stepMany(119);

    const courier = scenario.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier);
    if (!courier) throw new Error("missing courier after chase ticks");
    expect(
      Math.hypot(
        courier.pose.position[0] - routeStart.pose.position[0],
        courier.pose.position[2] - routeStart.pose.position[2],
      ),
    ).toBeGreaterThan(5);
    expect(vehiclePlanarSpeed(courier)).toBeGreaterThan(0);
    expect(courier.routeId).toBe(initial.routeId);
  });

  it("damages but does not instantly disable the courier on low-speed contact", () => {
    const scenario = new AfterlightScenario();
    const ids = AFTERLIGHT_ENTITY_IDS;
    scenario.activateCourierChase();
    scenario.placeVehicle(ids.heroCoupe, [70, 0.72, 42], Math.PI, {
      occupiedBy: ids.player,
      velocity: [0, 0, 6],
    });
    scenario.placeVehicle(ids.courier, [70, 0.72, 42], Math.PI, {
      velocity: [0, 0, 0],
      health: 120,
      life: "active",
    });
    scenario.placeActor(ids.player, [70, 1.15, 42], Math.PI);

    const events = scenario.step();
    const courier = scenario.state.vehicles.get(ids.courier);

    expect(courier?.health).toBeLessThan(120);
    expect(courier?.life).toBe("active");
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "vehicle-damaged",
        vehicleId: ids.courier,
        sourceId: ids.heroCoupe,
      }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: "vehicle-disabled",
        vehicleId: ids.courier,
      }),
    );
    expect(scenario.state.mission.completedObjectiveIds).not.toContain(
      AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
    );
  });

  it("fires the Signal-9 through the shared physics query", () => {
    const initial = createInitialAfterlightState();
    const actors = new Map(initial.actors);
    const player = actors.get(initial.playerId);
    if (!player) throw new Error("missing player fixture");
    actors.set(initial.playerId, {
      ...player,
      pose: { position: [66, 1.15, 44], rotationY: Math.PI },
    });
    const runtime = createGameRuntime(
      { ...initial, actors },
      createAfterlightStep(initial.seed),
    );

    runtime.command(input({ firePressed: true, aim: true }));
    runtime.advance();

    expect(
      runtime.state.actors.get(AFTERLIGHT_ENTITY_IDS.keyholderGuardA)?.health,
    ).toBe(56);
    expect(runtime.state.weapons.get("signal-9")?.magazine).toBe(23);
  });

  it("requires aim pitch to hit an elevated target", () => {
    const runShot = (lookY = 0) => {
      const scenario = new AfterlightScenario();
      scenario.placeActor(
        AFTERLIGHT_ENTITY_IDS.player,
        [64, 1.15, 56],
        Math.PI,
      );
      scenario.placeVehicle(
        AFTERLIGHT_ENTITY_IDS.heroCoupe,
        [20, 0.72, 20],
        0,
        {
          occupiedBy: undefined,
          velocity: [0, 0, 0],
        },
      );
      scenario.placeActor(
        AFTERLIGHT_ENTITY_IDS.keyholderGuardA,
        [64, 4.15, 48],
        0,
      );
      scenario.readyWeapon();
      scenario.step({ aim: true, firePressed: true, look: [0, lookY] });
      return scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.keyholderGuardA)
        ?.health;
    };

    expect(runShot()).toBe(90);
    expect(runShot(-14)).toBe(56);
  });

  it("keeps a vault guard from crossing or shooting through a vault wall", () => {
    const scenario = new AfterlightScenario();
    const ids = AFTERLIGHT_ENTITY_IDS;
    scenario.setPhase(AFTERLIGHT_PHASE_IDS.vault);
    scenario.placeActor(ids.player, [8.1, 1.15, -30], 0);
    scenario.placeActor(ids.vaultGuardA, [8.1, 1.15, -52], 0);
    scenario.placeActor(ids.vaultGuardB, [40, 1.15, -80], 0, {
      life: "down",
      health: 0,
    });
    scenario.placeActor(ids.vaultGuardC, [40, 1.15, -84], 0, {
      life: "down",
      health: 0,
    });
    scenario.placeActor(ids.vaultGuardD, [40, 1.15, -88], 0, {
      life: "down",
      health: 0,
    });
    scenario.readyWeapon();

    scenario.step({ aim: true, firePressed: true });
    scenario.stepMany(240);

    const guard = scenario.state.actors.get(ids.vaultGuardA);
    const player = scenario.state.actors.get(ids.player);
    if (!guard || !player) throw new Error("missing vault guard or player");

    expect(guard.pose.position[2]).toBeLessThan(-50.4);
    expect(player.health).toBe(100);
  });

  it("waits the configured reaction delay before the first exposed hostile shot", () => {
    const scenario = new AfterlightScenario();
    const ids = AFTERLIGHT_ENTITY_IDS;
    scenario.placeActor(ids.player, [0, 1.15, 0], Math.PI / 2);
    scenario.placeActor(ids.policeA, [-20, 1.15, 0], Math.PI / 2);
    scenario.placeVehicle(ids.heroCoupe, [20, 0.72, 20], 0, {
      occupiedBy: undefined,
      velocity: [0, 0, 0],
    });

    const preReaction = Array.from({ length: 18 }, () => {
      scenario.setWantedLevel(1);
      return scenario.step();
    }).flat();
    expect(
      preReaction.filter((event) => event.type === "actor-damaged"),
    ).toHaveLength(0);

    scenario.setWantedLevel(1);
    const reactionTick = scenario.step();
    expect(reactionTick).toContainEqual(
      expect.objectContaining({
        type: "actor-damaged",
        actorId: ids.player,
        sourceId: ids.policeA,
      }),
    );
  });

  it("lets pursuing police acquire and damage the occupied hero vehicle", () => {
    const scenario = new AfterlightScenario();
    const ids = AFTERLIGHT_ENTITY_IDS;
    scenario.placeActor(ids.player, [0, 1.15, 0], Math.PI / 2);
    scenario.placeActor(ids.policeA, [-20, 1.15, 0], Math.PI / 2);
    scenario.placeVehicle(ids.heroCoupe, [0, 0.72, 0], Math.PI / 2, {
      occupiedBy: ids.player,
      velocity: [0, 0, 0],
    });

    for (let tick = 0; tick < 18; tick += 1) {
      scenario.setWantedLevel(1);
      scenario.step();
    }
    scenario.setWantedLevel(1);
    const reactionTick = scenario.step();

    expect(reactionTick).toContainEqual(
      expect.objectContaining({
        type: "vehicle-damaged",
        vehicleId: ids.heroCoupe,
        sourceId: ids.policeA,
      }),
    );
  });

  it("caps simultaneous hostile shooters when several guards get the same lane", () => {
    const scenario = new AfterlightScenario();
    const ids = AFTERLIGHT_ENTITY_IDS;
    scenario.setWantedLevel(3);
    scenario.placeVehicle(ids.heroCoupe, [64, 0.72, 50], Math.PI, {
      occupiedBy: undefined,
      velocity: [0, 0, 0],
    });
    scenario.placeActor(ids.player, [0, 1.15, 0], Math.PI / 2);
    scenario.placeActor(ids.policeA, [-20, 1.15, -10], Math.PI / 2);
    scenario.placeActor(ids.policeB, [-20, 1.15, 0], Math.PI / 2);
    scenario.placeActor(ids.policeC, [-20, 1.15, 10], Math.PI / 2);

    for (let tick = 0; tick < 18; tick += 1) {
      scenario.setWantedLevel(3);
      scenario.step();
    }
    scenario.setWantedLevel(3);
    const fired = scenario.step();
    const shooters = new Set(
      fired
        .filter(
          (event): event is Extract<GameEvent, { type: "actor-damaged" }> =>
            event.type === "actor-damaged" && event.sourceId !== undefined,
        )
        .map((event) => event.sourceId),
    );

    expect(shooters.size).toBe(2);
  });

  it("produces identical hashes for identical commands", () => {
    const initial = createInitialAfterlightState(2407);
    const first = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed),
    );
    const second = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed),
    );
    const commands = [
      input({ interactPressed: true }),
      ...Array.from({ length: 80 }, () => input({ throttle: 1, steer: 0.25 })),
      input({ brake: true }),
    ];

    for (const command of commands) {
      first.command(command);
      second.command(command);
      first.advance();
      second.advance();
    }

    expect(first.hash()).toBe(second.hash());
  });

  it("holds district hostiles until the opening cinematic has cleared", () => {
    const initial = createInitialAfterlightState(2407, "vault-breach");
    const runtime = createGameRuntime(
      initial,
      createAfterlightStep(initial.seed, initial.mission.missionId),
    );

    for (let tick = 0; tick < 240; tick += 1) runtime.advance();

    expect(runtime.state.tick).toBe(240);
    expect(runtime.state.actors.get(runtime.state.playerId)?.health).toBe(100);
  });

  it("completes Courier Jack through collision, combat, and collection", () => {
    const scenario = new AfterlightScenario("courier-jack");
    const ids = AFTERLIGHT_ENTITY_IDS;
    const courier = scenario.state.vehicles.get(ids.courier);
    if (!courier) throw new Error("missing courier contract fixture");

    scenario.placeVehicle(ids.courier, courier.pose.position, Math.PI, {
      velocity: [0, 0, -14],
    });
    scenario.placeVehicle(ids.heroCoupe, courier.pose.position, Math.PI, {
      occupiedBy: ids.player,
      velocity: [0, 0, 26],
    });
    scenario.placeActor(ids.player, [
      courier.pose.position[0],
      1.15,
      courier.pose.position[2],
    ]);
    scenario.step();
    expect(scenario.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
    );
    scenario.placeVehicle(ids.courier, [70, 0.72, 42], Math.PI, {
      velocity: [0, 0, 0],
    });

    scenario.placeVehicle(ids.heroCoupe, [52, 0.72, 52], 0, {
      occupiedBy: undefined,
      velocity: [0, 0, 0],
    });
    for (const [guardId, x] of [
      [ids.keyholderGuardA, 66],
      [ids.keyholderGuardB, 74],
    ] as const) {
      scenario.placeActor(ids.player, [x, 1.15, 44], Math.PI);
      scenario.placeActor(guardId, [x, 1.15, 36], 0, {
        health: 1,
        life: "alive",
      });
      scenario.readyWeapon();
      scenario.step({ firePressed: true, aim: true });
      expect(scenario.state.actors.get(guardId)?.life, `guard ${guardId}`).toBe(
        "down",
      );
    }
    expect(scenario.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards,
    );
    scenario.placeActor(ids.player, [70, 1.15, 42]);
    scenario.step({ interactPressed: true });
    expect(scenario.state.inventory.has(AFTERLIGHT_ITEMS.vaultCredential)).toBe(
      true,
    );

    expect(scenario.state.mission.completed).toBe(true);
    expect(scenario.state.cash).toBe(4_000);
  });

  it("completes Vault Breach from its supplied credential", () => {
    const scenario = new AfterlightScenario("vault-breach");
    const ids = AFTERLIGHT_ENTITY_IDS;
    scenario.placeActor(ids.player, AFTERLIGHT_LANDMARKS.vaultReader);
    scenario.step({ interactPressed: true });
    scenario.step({ interactPressed: true });
    scenario.placeActor(ids.player, AFTERLIGHT_LANDMARKS.vaultExit);
    scenario.step();

    expect(scenario.state.mission.completed).toBe(true);
    expect(scenario.state.inventory.has(AFTERLIGHT_ITEMS.afterlightCore)).toBe(
      true,
    );
    expect(scenario.state.cash).toBe(6_500);
  });

  it("completes Blackout Hold after the authored defense timer", () => {
    const scenario = new AfterlightScenario("blackout-hold");
    scenario.placeActor(
      AFTERLIGHT_ENTITY_IDS.player,
      AFTERLIGHT_LANDMARKS.substationControl,
    );
    scenario.step({ interactPressed: true });
    scenario.step();
    scenario.stepMany(180);

    expect(scenario.state.mission.completed).toBe(true);
    expect(scenario.state.cash).toBe(3_000);
  });

  it("completes Bridge Run after launch, pursuit search, and escape", () => {
    const scenario = new AfterlightScenario("bridge-run");
    const ids = AFTERLIGHT_ENTITY_IDS;
    for (const id of [ids.policeA, ids.policeB, ids.policeC, ids.policeD]) {
      const actor = scenario.state.actors.get(id);
      if (!actor) throw new Error(`missing police fixture ${id}`);
      scenario.placeActor(id, actor.pose.position, actor.pose.rotationY, {
        health: 0,
        life: "down",
      });
    }
    scenario.placeVehicle(ids.heroCoupe, AFTERLIGHT_LANDMARKS.bridgeLaunch, 0, {
      occupiedBy: ids.player,
      velocity: [0, 0, 0],
    });
    scenario.placeActor(ids.player, AFTERLIGHT_LANDMARKS.bridgeLaunch);
    scenario.step({ interactPressed: true });
    expect(scenario.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun,
    );
    scenario.placeVehicle(ids.heroCoupe, AFTERLIGHT_LANDMARKS.bridgeEscape, 0, {
      occupiedBy: ids.player,
      velocity: [0, 0, 0],
    });
    scenario.placeActor(ids.player, AFTERLIGHT_LANDMARKS.bridgeEscape);
    scenario.stepMany(650);
    expect(["search", "return"]).toContain(scenario.state.heat.mode);
    expect(scenario.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.escapeAfterlightRun,
    );

    expect(scenario.state.mission.completed).toBe(true);
    expect(scenario.state.cash).toBe(5_000);
  });

  it("runs every required objective through the playable critical path", () => {
    const scenario = new AfterlightScenario();
    const ids = AFTERLIGHT_ENTITY_IDS;

    scenario.step({ interactPressed: true });
    scenario.stepMany(180, { throttle: 1 });
    scenario.placeVehicle(ids.heroCoupe, [70, 0.72, 42], Math.PI, {
      occupiedBy: ids.player,
      velocity: [0, 0, 0],
    });
    scenario.placeActor(ids.player, [70, 1.15, 42], Math.PI);
    scenario.stepMany(31);
    expect(scenario.state.mission.phaseIndex).toBe(1);

    const courierAtIntercept = scenario.state.vehicles.get(ids.courier);
    if (!courierAtIntercept) throw new Error("missing courier intercept");
    scenario.placeVehicle(
      ids.courier,
      courierAtIntercept.pose.position,
      courierAtIntercept.pose.rotationY,
      { velocity: [0, 0, -14] },
    );
    scenario.placeVehicle(
      ids.heroCoupe,
      courierAtIntercept.pose.position,
      Math.PI,
      {
        occupiedBy: ids.player,
        velocity: [0, 0, 26],
      },
    );
    scenario.placeActor(
      ids.player,
      [
        courierAtIntercept.pose.position[0],
        1.15,
        courierAtIntercept.pose.position[2],
      ],
      Math.PI,
    );
    scenario.step();
    expect(scenario.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
    );
    scenario.placeVehicle(ids.courier, [70, 0.72, 42], Math.PI, {
      velocity: [0, 0, 0],
    });

    scenario.placeVehicle(ids.heroCoupe, [52, 0.72, 52], 0, {
      occupiedBy: undefined,
      velocity: [0, 0, 0],
    });
    scenario.placeActor(ids.player, [66, 1.15, 44], Math.PI);
    scenario.placeActor(ids.keyholderGuardA, [66, 1.15, 36], 0, {
      health: 1,
      life: "alive",
    });
    scenario.readyWeapon();
    scenario.step({ firePressed: true, aim: true });
    scenario.placeActor(ids.player, [74, 1.15, 44], Math.PI);
    scenario.placeActor(ids.keyholderGuardB, [74, 1.15, 36], 0, {
      health: 1,
      life: "alive",
    });
    scenario.readyWeapon();
    scenario.step({ firePressed: true, aim: true });
    expect(scenario.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards,
    );

    scenario.placeActor(ids.player, [70, 1.15, 42], 0);
    scenario.step({ interactPressed: true });
    expect(scenario.state.inventory.has(AFTERLIGHT_ITEMS.vaultCredential)).toBe(
      true,
    );
    expect(scenario.state.mission.phaseIndex).toBe(2);

    for (const id of [ids.policeA, ids.policeB, ids.policeC, ids.policeD]) {
      const actor = scenario.state.actors.get(id);
      if (!actor) throw new Error(`missing police fixture ${id}`);
      scenario.placeActor(id, actor.pose.position, actor.pose.rotationY, {
        health: 0,
        life: "down",
      });
    }
    scenario.placeActor(ids.player, [14, 1.15, -42], 0);
    scenario.step({ interactPressed: true });
    scenario.step({ interactPressed: true });
    expect(scenario.state.inventory.has(AFTERLIGHT_ITEMS.afterlightCore)).toBe(
      true,
    );
    expect(scenario.state.inventory.has(AFTERLIGHT_ITEMS.bearerBonds)).toBe(
      true,
    );
    scenario.placeActor(ids.player, [14, 1.15, -30], 0);
    scenario.step();
    expect(scenario.state.mission.phaseIndex).toBe(3);

    scenario.placeVehicle(ids.heroCoupe, [-54, 0.72, -42], 0, {
      occupiedBy: undefined,
      velocity: [0, 0, 0],
    });
    scenario.placeActor(ids.player, [-70, 1.15, -42], 0);
    scenario.step({ interactPressed: true });
    scenario.step();
    scenario.stepMany(181);
    expect(scenario.state.mission.phaseIndex).toBe(4);

    scenario.placeVehicle(ids.heroCoupe, [0, 0.72, -114], 0, {
      occupiedBy: ids.player,
      velocity: [0, 0, 0],
      health: 100,
      life: "active",
    });
    scenario.placeActor(ids.player, [0, 1.15, -114], 0, {
      health: 100,
      life: "alive",
    });
    scenario.step({ interactPressed: true });
    scenario.placeVehicle(ids.heroCoupe, [0, 0.72, -218], 0, {
      occupiedBy: ids.player,
      velocity: [0, 0, 0],
    });
    scenario.placeActor(ids.player, [0, 1.15, -218], 0);
    scenario.stepMany(650);
    expect(scenario.state.mission.phaseIndex).toBe(5);

    scenario.placeVehicle(ids.heroCoupe, [0, 0.72, -232], 0, {
      occupiedBy: ids.player,
      velocity: [0, 0, 0],
    });
    scenario.placeActor(ids.player, [0, 1.15, -232], 0);
    scenario.stepMany(31);
    scenario.step({ interactPressed: true });

    const requiredObjectiveIds = scenario.controller.definition.phases.flatMap(
      (phase) =>
        phase.objectives
          .filter((objective) => !objective.optional)
          .map((objective) => objective.id),
    );
    expect(scenario.state.mission.completed).toBe(true);
    expect(scenario.state.mission.completedObjectiveIds).toEqual(
      expect.arrayContaining(requiredObjectiveIds),
    );
    expect(scenario.state.checkpointId).toBe("afterlight:checkpoint:debrief");
  });

  it("restores player and coupe at the current checkpoint", () => {
    const initial = createInitialAfterlightState();
    const actors = new Map(initial.actors);
    const player = actors.get(initial.playerId);
    if (!player) throw new Error("missing player fixture");
    actors.set(initial.playerId, { ...player, health: 0, life: "down" });
    const checkpointId = "afterlight:checkpoint:vault";
    const failed = {
      ...initial,
      actors,
      checkpointId,
      inventory: new Set([AFTERLIGHT_ITEMS.vaultCredential]),
      mission: { ...initial.mission, failed: true },
    };

    const restored = restoreAfterlightCheckpointState(failed);

    expect(restored.mission.failed).toBe(false);
    expect(restored.actors.get(restored.playerId)).toMatchObject({
      health: 100,
      life: "alive",
      pose: AFTERLIGHT_CHECKPOINTS[checkpointId].pose,
    });
    expect(restored.inventory.has(AFTERLIGHT_ITEMS.vaultCredential)).toBe(true);
  });

  it("keeps the bridge escape and safehouse inside the playable world", () => {
    const initial = createInitialAfterlightState();
    const actors = new Map(initial.actors);
    const player = actors.get(initial.playerId);
    const vehicles = new Map(initial.vehicles);
    const hero = vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
    if (!player || !hero) throw new Error("missing player or coupe fixture");
    actors.set(player.id, {
      ...player,
      pose: { position: [0, 1.15, -232], rotationY: 0 },
    });
    vehicles.set(hero.id, {
      ...hero,
      pose: { position: [0, 0.72, -218], rotationY: 0 },
    });
    const runtime = createGameRuntime(
      { ...initial, actors, vehicles },
      createAfterlightStep(initial.seed),
    );

    runtime.advance();

    expect(runtime.state.actors.get(player.id)?.pose.position[2]).toBe(-232);
    expect(runtime.state.vehicles.get(hero.id)?.pose.position[2]).toBe(-218);
  });
});
