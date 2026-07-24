import { describe, expect, it } from "vitest";
import {
  VEHICLE_PROFILES,
  createGameState,
  stepGame,
  type GameInput,
  type GameState,
  type VehicleClass,
} from "./engine";

const idle: GameInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  handbrake: false,
  action: false,
};

function enterCar(state: GameState) {
  state.foot = { x: state.car.x, y: state.car.y };
  stepGame(state, { ...idle, action: true }, 1 / 60);
}

function releaseAction(state: GameState) {
  stepGame(state, idle, 1 / 60);
}

function exitCar(state: GameState) {
  state.car.speed = 0;
  stepGame(state, { ...idle, action: true }, 1 / 60);
  releaseAction(state);
}

function setVehicleClass(state: GameState, vehicleClass: VehicleClass) {
  const profile = VEHICLE_PROFILES[vehicleClass];
  state.car.vehicleClass = vehicleClass;
  state.car.health = profile.maxHealth;
  state.car.maxHealth = profile.maxHealth;
  state.car.radius = profile.radius;
}

describe("Hot Drop mission loop", () => {
  it("starts on foot and enters the marked car through the interaction", () => {
    const state = createGameState();

    expect(state.phase).toBe("findCar");
    expect(state.mode).toBe("foot");

    enterCar(state);

    expect(state.mode).toBe("car");
    expect(state.phase).toBe("pickup");
    expect(state.score).toBe(100);
  });

  it("collects the package, raises heat, and deploys pursuing units", () => {
    const state = createGameState();
    enterCar(state);
    state.car.x = state.packagePosition.x;
    state.car.y = state.packagePosition.y;

    stepGame(state, idle, 1 / 60);

    expect(state.phase).toBe("deliver");
    expect(state.heat).toBe(1);
    expect(state.cops).toHaveLength(2);
    expect(state.score).toBeGreaterThanOrEqual(600);
  });

  it("escalates the pursuit as the delivery runs long", () => {
    const state = createGameState();
    state.mode = "car";
    state.phase = "deliver";
    state.heat = 1;
    state.maxHeatReached = 1;
    state.deliveryElapsed = 24;

    stepGame(state, idle, 0.04);

    expect(state.heat).toBe(2);
    expect(state.maxHeatReached).toBe(2);
    expect(state.cops).toHaveLength(4);

    state.deliveryElapsed = 52;
    stepGame(state, idle, 0.04);

    expect(state.heat).toBe(3);
    expect(state.cops).toHaveLength(6);
  });

  it("accelerates, steers, and responds to the handbrake", () => {
    const state = createGameState();
    state.mode = "car";
    state.phase = "pickup";
    const start = { x: state.car.x, y: state.car.y };

    for (let frame = 0; frame < 90; frame += 1) {
      stepGame(state, { ...idle, up: true }, 1 / 60);
    }

    expect(
      Math.hypot(state.car.x - start.x, state.car.y - start.y),
    ).toBeGreaterThan(30);
    expect(state.car.speed).toBeGreaterThan(0);
    const angleBeforeTurn = state.car.angle;
    const speedBeforeBrake = state.car.speed;

    for (let frame = 0; frame < 30; frame += 1) {
      stepGame(
        state,
        { ...idle, up: true, left: true, handbrake: true },
        1 / 60,
      );
    }

    expect(state.car.angle).not.toBe(angleBeforeTurn);
    expect(state.car.speed).toBeLessThan(speedBeforeBrake);
  });

  it("lets the player exit, re-enter, and steal any traffic vehicle", () => {
    const state = createGameState();
    enterCar(state);
    releaseAction(state);
    const originalClass = state.car.vehicleClass;

    exitCar(state);

    expect(state.mode).toBe("foot");
    expect(state.stats.vehicleSwaps).toBe(0);

    stepGame(state, { ...idle, action: true }, 1 / 60);
    expect(state.mode).toBe("car");
    releaseAction(state);
    exitCar(state);

    const target = state.traffic.find(
      (vehicle) => vehicle.vehicleClass === "sport",
    );
    expect(target).toBeDefined();
    if (!target) return;
    target.route = null;
    target.speed = 0;
    target.x = state.foot.x;
    target.y = state.foot.y;

    stepGame(state, { ...idle, action: true }, 1 / 60);

    expect(state.mode).toBe("car");
    expect(state.car.vehicleClass).toBe("sport");
    expect(state.stats.vehicleSwaps).toBe(1);
    expect(
      state.traffic.some(
        (vehicle) =>
          vehicle.route === null && vehicle.vehicleClass === originalClass,
      ),
    ).toBe(true);
  });

  it("cuts heat for an unseen swap and raises it for a witnessed swap", () => {
    const unseen = createGameState();
    unseen.mode = "car";
    unseen.phase = "deliver";
    unseen.heat = 2;
    unseen.maxHeatReached = 2;
    exitCar(unseen);
    const unseenTarget = unseen.traffic[0];
    unseenTarget.route = null;
    unseenTarget.speed = 0;
    unseenTarget.x = unseen.foot.x;
    unseenTarget.y = unseen.foot.y;

    stepGame(unseen, { ...idle, action: true }, 1 / 60);

    expect(unseen.heat).toBe(1);
    expect(unseen.stats.cleanSwaps).toBe(1);
    expect(unseen.score).toBe(350);
    expect(unseen.cops).toHaveLength(2);

    const witnessed = createGameState();
    witnessed.mode = "car";
    witnessed.phase = "deliver";
    witnessed.heat = 1;
    witnessed.maxHeatReached = 1;
    exitCar(witnessed);
    const witnessedTarget = witnessed.traffic[0];
    witnessedTarget.route = null;
    witnessedTarget.speed = 0;
    witnessedTarget.x = witnessed.foot.x;
    witnessedTarget.y = witnessed.foot.y;
    witnessed.cops = [
      {
        id: 0,
        x: witnessed.foot.x,
        y: witnessed.foot.y - 110,
        angle: Math.PI / 2,
        speed: 0,
        radius: 25,
        contactCooldown: 0,
      },
    ];

    stepGame(witnessed, { ...idle, action: true }, 1 / 60);

    expect(witnessed.heat).toBe(2);
    expect(witnessed.maxHeatReached).toBe(2);
    expect(witnessed.stats.cleanSwaps).toBe(0);
    expect(witnessed.cops).toHaveLength(4);
  });

  it("gives every class distinct speed, durability, and cargo protection", () => {
    expect(VEHICLE_PROFILES.sport.topSpeed).toBeGreaterThan(
      VEHICLE_PROFILES.muscle.topSpeed,
    );
    expect(VEHICLE_PROFILES.muscle.topSpeed).toBeGreaterThan(
      VEHICLE_PROFILES.van.topSpeed,
    );
    expect(VEHICLE_PROFILES.muscle.maxHealth).toBeGreaterThan(
      VEHICLE_PROFILES.sport.maxHealth,
    );
    expect(VEHICLE_PROFILES.muscle.turnRate).toBeLessThan(
      VEHICLE_PROFILES.sport.turnRate,
    );
    expect(VEHICLE_PROFILES.van.packageDamageMultiplier).toBeLessThan(
      VEHICLE_PROFILES.muscle.packageDamageMultiplier,
    );

    const classes = new Set(
      createGameState().traffic.map((vehicle) => vehicle.vehicleClass),
    );
    expect(classes).toEqual(new Set(["sport", "muscle", "van"]));

    const sport = createGameState();
    sport.mode = "car";
    sport.phase = "pickup";
    sport.traffic = [];
    sport.car.x = 600;
    sport.car.y = 900;
    sport.car.angle = 0;
    setVehicleClass(sport, "sport");

    const van = createGameState();
    van.mode = "car";
    van.phase = "pickup";
    van.traffic = [];
    van.car.x = 600;
    van.car.y = 900;
    van.car.angle = 0;
    setVehicleClass(van, "van");

    for (let frame = 0; frame < 90; frame += 1) {
      stepGame(sport, { ...idle, up: true }, 1 / 60);
      stepGame(van, { ...idle, up: true }, 1 / 60);
    }

    expect(sport.car.speed).toBeGreaterThan(van.car.speed);
    expect(sport.car.maxHealth).toBeLessThan(van.car.maxHealth);

    for (const state of [sport, van]) {
      state.phase = "deliver";
      state.heat = 1;
      state.maxHeatReached = 1;
      state.cops = [
        {
          id: 0,
          x: state.car.x,
          y: state.car.y,
          angle: state.car.angle,
          speed: 0,
          radius: 25,
          contactCooldown: 0,
        },
      ];
    }
    const sportHealthBefore = sport.car.health;
    const vanHealthBefore = van.car.health;

    stepGame(sport, idle, 1 / 60);
    stepGame(van, idle, 1 / 60);

    expect(sportHealthBefore - sport.car.health).toBeGreaterThan(
      vanHealthBefore - van.car.health,
    );
    expect(100 - sport.packageHealth).toBeGreaterThan(100 - van.packageHealth);
  });

  it("completes the run and awards a delivery bonus at the safehouse", () => {
    const state = createGameState();
    state.mode = "car";
    state.phase = "deliver";
    state.heat = 1;
    state.maxHeatReached = 1;
    state.car.x = state.deliveryPosition.x;
    state.car.y = state.deliveryPosition.y;

    stepGame(state, idle, 1 / 60);

    expect(state.phase).toBe("won");
    expect(state.score).toBeGreaterThan(2000);
  });

  it("ends the run when the ride is destroyed or the clock expires", () => {
    const wrecked = createGameState();
    wrecked.mode = "car";
    wrecked.phase = "pickup";
    wrecked.car.health = 0;
    stepGame(wrecked, idle, 1 / 60);

    expect(wrecked.phase).toBe("busted");
    expect(wrecked.resultReason).toBe("RIDE WRECKED");

    const expired = createGameState();
    expired.timeLeft = 0.001;
    stepGame(expired, idle, 0.02);

    expect(expired.phase).toBe("busted");
    expect(expired.resultReason).toBe("TIME UP");

    const lostPackage = createGameState();
    lostPackage.mode = "car";
    lostPackage.phase = "deliver";
    lostPackage.packageHealth = 0;
    stepGame(lostPackage, idle, 1 / 60);

    expect(lostPackage.phase).toBe("busted");
    expect(lostPackage.resultReason).toBe("PACKAGE LOST");
  });
});
