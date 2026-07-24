import { describe, expect, it } from "vitest";
import {
  createGameState,
  stepGame,
  type GameInput,
  type GameState,
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
  });
});
