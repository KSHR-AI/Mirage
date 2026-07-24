import { afterEach, describe, expect, it } from "vitest";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import { HotDropSimulation, type Game3DInput } from "./simulation";

const idle: Game3DInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  handbrake: false,
  action: false,
};

const simulations: HotDropSimulation[] = [];

async function createIsolatedPlayer() {
  const simulation = await HotDropSimulation.create();
  simulations.push(simulation);
  simulation.step({ ...idle, action: true });
  simulation.step(idle);
  const vehicle = simulation.activeVehicle();
  expect(vehicle).not.toBeNull();
  if (!vehicle) throw new Error("Starter vehicle was not entered");

  for (const candidate of simulation.vehicles) {
    if (candidate !== vehicle) candidate.body.setEnabled(false);
  }
  for (const prop of simulation.props) prop.body.setEnabled(false);
  return { simulation, vehicle };
}

function horizontalSpeed(body: RigidBody) {
  const velocity = body.linvel();
  return Math.hypot(velocity.x, velocity.z);
}

function yawDegrees(body: RigidBody) {
  const rotation = body.rotation();
  return (2 * Math.atan2(rotation.y, rotation.w) * 180) / Math.PI;
}

afterEach(() => {
  for (const simulation of simulations.splice(0)) simulation.dispose();
});

describe("Hot Drop 3D handling quality", () => {
  it("accelerates progressively and makes a controlled right turn", async () => {
    const { simulation, vehicle } = await createIsolatedPlayer();
    const start = { ...vehicle.body.translation() };

    for (let frame = 0; frame < 60; frame += 1) {
      simulation.step({ ...idle, up: true });
    }

    expect(horizontalSpeed(vehicle.body)).toBeGreaterThan(9);
    expect(horizontalSpeed(vehicle.body)).toBeLessThan(16);
    expect(vehicle.body.translation().z).toBeLessThan(start.z - 5);
    expect(Math.abs(yawDegrees(vehicle.body))).toBeLessThan(1);

    for (let frame = 0; frame < 60; frame += 1) {
      simulation.step({ ...idle, up: true, right: true });
    }

    expect(yawDegrees(vehicle.body)).toBeLessThan(-45);
    expect(yawDegrees(vehicle.body)).toBeGreaterThan(-100);
    expect(vehicle.body.translation().x).toBeGreaterThan(start.x + 4);
    expect(horizontalSpeed(vehicle.body)).toBeGreaterThan(5);
    expect(horizontalSpeed(vehicle.body)).toBeLessThan(24);

    for (let frame = 0; frame < 24; frame += 1) {
      simulation.step(idle);
    }
    expect(Math.abs(vehicle.body.angvel().y)).toBeLessThan(0.08);
  });

  it("brakes to a near stop, then transitions into reverse", async () => {
    const { simulation, vehicle } = await createIsolatedPlayer();

    for (let frame = 0; frame < 60; frame += 1) {
      simulation.step({ ...idle, up: true });
    }
    const cruisingSpeed = horizontalSpeed(vehicle.body);
    expect(cruisingSpeed).toBeGreaterThan(9);

    for (let frame = 0; frame < 45; frame += 1) {
      simulation.step({ ...idle, down: true });
    }
    expect(horizontalSpeed(vehicle.body)).toBeLessThan(3);

    for (let frame = 0; frame < 45; frame += 1) {
      simulation.step({ ...idle, down: true });
    }
    expect(vehicle.body.linvel().z).toBeGreaterThan(2);
    expect(horizontalSpeed(vehicle.body)).toBeLessThan(8);
  });

  it("rounds the first city intersection", async () => {
    const { simulation, vehicle } = await createIsolatedPlayer();
    for (let frame = 0; frame < 130; frame += 1) {
      simulation.step({ ...idle, up: true });
    }
    expect(vehicle.body.translation().x).toBeCloseTo(-45, 0);
    expect(vehicle.body.translation().z).toBeGreaterThan(-14);
    expect(vehicle.body.translation().z).toBeLessThan(-6);

    for (let frame = 0; frame < 70; frame += 1) {
      simulation.step({ ...idle, up: true, right: true });
    }

    expect(vehicle.body.translation().x).toBeGreaterThan(-37);
    expect(vehicle.body.translation().x).toBeLessThan(-25);
    expect(vehicle.body.translation().z).toBeGreaterThan(-43);
    expect(vehicle.body.translation().z).toBeLessThan(-27);
    expect(yawDegrees(vehicle.body)).toBeLessThan(-55);
    expect(yawDegrees(vehicle.body)).toBeGreaterThan(-95);
  });
});
