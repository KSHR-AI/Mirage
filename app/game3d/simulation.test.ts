import { afterEach, describe, expect, it } from "vitest";
import { DELIVERY_POSITION, PACKAGE_POSITION } from "./config";
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

async function createSimulation() {
  const simulation = await HotDropSimulation.create();
  simulations.push(simulation);
  return simulation;
}

afterEach(() => {
  for (const simulation of simulations.splice(0)) simulation.dispose();
});

describe("Hot Drop 3D physics integration", () => {
  it("enters a rigid-body vehicle and drives it through the fixed-step world", async () => {
    const simulation = await createSimulation();
    const start = simulation.vehicles.find(
      (vehicle) => vehicle.id === "starter",
    );
    expect(start).toBeDefined();
    if (!start) return;
    const startPosition = { ...start.body.translation() };

    simulation.step({ ...idle, action: true });
    simulation.step(idle);
    expect(simulation.snapshot().mission.mode).toBe("car");
    expect(simulation.snapshot().mission.phase).toBe("pickup");

    for (let frame = 0; frame < 120; frame += 1) {
      simulation.step({ ...idle, up: true });
    }

    const endPosition = start.body.translation();
    expect(
      Math.hypot(
        endPosition.x - startPosition.x,
        endPosition.z - startPosition.z,
      ),
    ).toBeGreaterThan(6);
    expect(simulation.snapshot().speedMph).toBeGreaterThan(8);
    expect(endPosition.y).toBeGreaterThan(0.4);
  });

  it("exits, re-enters, and swaps control to an AI traffic vehicle", async () => {
    const simulation = await createSimulation();
    simulation.step({ ...idle, action: true });
    simulation.step(idle);
    const starter = simulation.activeVehicle();
    expect(starter).not.toBeNull();
    if (!starter) return;
    starter.body.setLinvel({ x: 0, y: 0, z: 0 }, true);

    simulation.step({ ...idle, action: true });
    simulation.step(idle);
    expect(simulation.snapshot().mission.mode).toBe("foot");

    const sport = simulation.vehicles.find(
      (vehicle) => vehicle.id === "traffic-sport",
    );
    expect(sport).toBeDefined();
    if (!sport) return;
    const position = sport.body.translation();
    simulation.footBody.setTranslation(
      { x: position.x, y: 1.1, z: position.z },
      true,
    );
    simulation.step({ ...idle, action: true });

    expect(simulation.snapshot().mission.mode).toBe("car");
    expect(simulation.snapshot().vehicleClass).toBe("sport");
    expect(simulation.snapshot().mission.stats.vehicleSwaps).toBe(1);
    expect(simulation.activeVehicle()?.id).toBe("traffic-sport");
  });

  it("connects mission triggers to 3D positions and spawns police pursuit bodies", async () => {
    const simulation = await createSimulation();
    simulation.step({ ...idle, action: true });
    simulation.step(idle);
    const vehicle = simulation.activeVehicle();
    expect(vehicle).not.toBeNull();
    if (!vehicle) return;

    vehicle.body.setTranslation(
      {
        x: PACKAGE_POSITION.x,
        y: 1,
        z: PACKAGE_POSITION.z,
      },
      true,
    );
    simulation.step(idle);

    expect(simulation.snapshot().mission.phase).toBe("deliver");
    expect(simulation.snapshot().policeCount).toBe(2);

    vehicle.body.setTranslation(
      {
        x: DELIVERY_POSITION.x,
        y: 1,
        z: DELIVERY_POSITION.z,
      },
      true,
    );
    simulation.step(idle);

    expect(simulation.snapshot().mission.phase).toBe("won");
  });

  it("launches a vehicle from a physical ramp and simulates breakable props", async () => {
    const simulation = await createSimulation();
    simulation.step({ ...idle, action: true });
    simulation.step(idle);
    const vehicle = simulation.activeVehicle();
    expect(vehicle).not.toBeNull();
    if (!vehicle) return;

    for (const candidate of simulation.vehicles) {
      if (candidate !== vehicle) candidate.body.setEnabled(false);
    }
    vehicle.body.enableCcd(false);
    vehicle.body.setTranslation({ x: 5, y: 1, z: -35 }, true);
    vehicle.body.setRotation(
      {
        x: 0,
        y: -Math.sin(Math.PI / 4),
        z: 0,
        w: Math.cos(Math.PI / 4),
      },
      true,
    );
    vehicle.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    simulation.step(idle);
    vehicle.body.enableCcd(true);
    vehicle.body.setLinvel({ x: 20, y: 0, z: 0 }, true);
    let maximumHeight = vehicle.body.translation().y;
    for (let frame = 0; frame < 90; frame += 1) {
      simulation.step({ ...idle, up: true });
      maximumHeight = Math.max(maximumHeight, vehicle.body.translation().y);
    }
    expect(maximumHeight).toBeGreaterThan(1.35);
    expect(simulation.snapshot().mission.stats.jumps).toBeGreaterThan(0);

    const propSimulation = await createSimulation();
    propSimulation.step({ ...idle, action: true });
    propSimulation.step(idle);
    const propVehicle = propSimulation.activeVehicle();
    expect(propVehicle).not.toBeNull();
    if (!propVehicle) return;
    for (const candidate of propSimulation.vehicles) {
      if (candidate !== propVehicle) candidate.body.setEnabled(false);
    }
    const targetProp = propSimulation.props[0];
    targetProp.body.setTranslation({ x: -45, y: 0.65, z: 8 }, true);
    for (let frame = 0; frame < 120; frame += 1) {
      propSimulation.step({ ...idle, up: true });
    }
    expect(propSimulation.snapshot().mission.stats.destroyed).toBeGreaterThan(
      0,
    );
    expect(targetProp.broken).toBe(true);
  });
});
