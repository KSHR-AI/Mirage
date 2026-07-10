import { describe, expect, it } from "vitest";
import {
  AFTERLIGHT_ITEMS,
  AFTERLIGHT_OBJECTIVE_IDS,
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
  createInitialAfterlightState,
} from "./afterlight-state";
import {
  AfterlightStepController,
  createAfterlightStep,
  restoreAfterlightCheckpointState,
} from "./afterlight-step";
import { RngStreams } from "./rng";
import { createGameRuntime } from "./runtime";
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

  constructor() {
    this.state = createInitialAfterlightState();
    this.controller = new AfterlightStepController(this.state.seed);
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
}

describe("Afterlight step", () => {
  it("keeps forward locomotion aligned with pointer-controlled camera yaw", () => {
    const scenario = new AfterlightScenario();
    const initial = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!initial) throw new Error("missing player fixture");

    scenario.step({ look: [8, 0] });
    const turned = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!turned) throw new Error("missing player after look input");
    expect(turned.pose.rotationY).not.toBeCloseTo(initial.pose.rotationY);

    const before = turned.pose.position;
    scenario.stepMany(30, { move: [0, 1] });
    const moved = scenario.state.actors.get(AFTERLIGHT_ENTITY_IDS.player);
    if (!moved) throw new Error("missing player after movement");
    const displacement = [
      moved.pose.position[0] - before[0],
      moved.pose.position[2] - before[2],
    ] as const;
    const forward = [
      Math.sin(turned.pose.rotationY),
      Math.cos(turned.pose.rotationY),
    ] as const;
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

    scenario.stepMany(60, { move: [0, 1] });
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

    scenario.placeVehicle(ids.heroCoupe, [70, 0.72, 42], Math.PI, {
      occupiedBy: ids.player,
      velocity: [0, 0, 12],
    });
    scenario.placeActor(ids.player, [70, 1.15, 42], Math.PI);
    scenario.step();
    expect(scenario.state.mission.completedObjectiveIds).toContain(
      AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
    );

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
