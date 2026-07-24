import { describe, expect, it } from "vitest";
import { VEHICLE_3D_PROFILES } from "./config";
import { MissionController } from "./gameplay";

const quiet = {
  playerSpeed: 0,
  currentVehicleHealth: VEHICLE_3D_PROFILES.muscle.maxHealth,
  currentVehicleMaxHealth: VEHICLE_3D_PROFILES.muscle.maxHealth,
  nearestPoliceDistance: Number.POSITIVE_INFINITY,
};

describe("Hot Drop 3D gameplay layer", () => {
  it("runs the complete car, package, pursuit, and delivery sequence", () => {
    const mission = new MissionController();

    mission.enterVehicle(
      "muscle",
      VEHICLE_3D_PROFILES.muscle.maxHealth,
      VEHICLE_3D_PROFILES.muscle.maxHealth,
    );
    expect(mission.state.phase).toBe("pickup");
    expect(mission.state.score).toBe(100);

    mission.collectPackage();
    expect(mission.state.phase).toBe("deliver");
    expect(mission.state.heat).toBe(1);
    expect(mission.policeCount()).toBe(2);

    mission.deliver();
    expect(mission.state.phase).toBe("won");
    expect(mission.state.score).toBeGreaterThan(3000);
  });

  it("escalates heat over time and rewards breaking pursuit", () => {
    const mission = new MissionController();
    mission.enterVehicle(
      "muscle",
      VEHICLE_3D_PROFILES.muscle.maxHealth,
      VEHICLE_3D_PROFILES.muscle.maxHealth,
    );
    mission.collectPackage();

    mission.state.deliveryElapsed = 24;
    mission.tick(0.04, quiet);
    expect(mission.state.heat).toBe(2);
    expect(mission.policeCount()).toBe(4);

    mission.state.escapeProgress = 5.49;
    mission.tick(0.04, quiet);
    expect(mission.state.heat).toBe(1);
    expect(mission.state.stats.escapes).toBe(1);
  });

  it("cuts heat for unseen swaps and raises it for witnessed swaps", () => {
    const clean = new MissionController();
    clean.enterVehicle(
      "muscle",
      VEHICLE_3D_PROFILES.muscle.maxHealth,
      VEHICLE_3D_PROFILES.muscle.maxHealth,
    );
    clean.collectPackage();
    clean.state.heat = 2;
    clean.state.maxHeatReached = 2;
    clean.swapVehicle(
      "sport",
      VEHICLE_3D_PROFILES.sport.maxHealth,
      VEHICLE_3D_PROFILES.sport.maxHealth,
      false,
    );
    expect(clean.state.heat).toBe(1);
    expect(clean.state.stats.cleanSwaps).toBe(1);
    expect(clean.state.score).toBe(950);

    const spotted = new MissionController();
    spotted.enterVehicle(
      "muscle",
      VEHICLE_3D_PROFILES.muscle.maxHealth,
      VEHICLE_3D_PROFILES.muscle.maxHealth,
    );
    spotted.collectPackage();
    spotted.swapVehicle(
      "van",
      VEHICLE_3D_PROFILES.van.maxHealth,
      VEHICLE_3D_PROFILES.van.maxHealth,
      true,
    );
    expect(spotted.state.heat).toBe(2);
    expect(spotted.state.maxHeatReached).toBe(2);
    expect(spotted.state.stats.cleanSwaps).toBe(0);
  });

  it("makes the Lockbox protect cargo better than the Flash", () => {
    const sport = new MissionController();
    sport.enterVehicle(
      "sport",
      VEHICLE_3D_PROFILES.sport.maxHealth,
      VEHICLE_3D_PROFILES.sport.maxHealth,
    );
    sport.collectPackage();
    sport.registerImpact(10, "sport");

    const van = new MissionController();
    van.enterVehicle(
      "van",
      VEHICLE_3D_PROFILES.van.maxHealth,
      VEHICLE_3D_PROFILES.van.maxHealth,
    );
    van.collectPackage();
    van.registerImpact(10, "van");

    expect(sport.state.packageHealth).toBeLessThan(van.state.packageHealth);
  });

  it("ends runs on timeout, wreck, cargo loss, or arrest", () => {
    const timeout = new MissionController();
    timeout.state.timeLeft = 0.01;
    timeout.tick(0.02, quiet);
    expect(timeout.state.resultReason).toBe("TIME UP");

    const wreck = new MissionController();
    wreck.enterVehicle("sport", 0, VEHICLE_3D_PROFILES.sport.maxHealth);
    wreck.tick(0.02, {
      ...quiet,
      currentVehicleHealth: 0,
      currentVehicleMaxHealth: VEHICLE_3D_PROFILES.sport.maxHealth,
    });
    expect(wreck.state.resultReason).toBe("RIDE WRECKED");

    const cargo = new MissionController();
    cargo.state.packageHealth = 0;
    cargo.tick(0.02, quiet);
    expect(cargo.state.resultReason).toBe("PACKAGE LOST");

    const arrest = new MissionController();
    arrest.enterVehicle(
      "muscle",
      VEHICLE_3D_PROFILES.muscle.maxHealth,
      VEHICLE_3D_PROFILES.muscle.maxHealth,
    );
    arrest.collectPackage();
    arrest.state.arrestProgress = 2.34;
    arrest.tick(0.04, { ...quiet, nearestPoliceDistance: 1 });
    expect(arrest.state.resultReason).toBe("BUSTED");
  });
});
