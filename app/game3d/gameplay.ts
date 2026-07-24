import type { VehicleClass } from "../game/engine";
import { VEHICLE_3D_PROFILES } from "./config";

export type MissionPhase = "findCar" | "pickup" | "deliver" | "won" | "busted";
export type Player3DMode = "foot" | "car";

export interface MissionStats {
  nearMisses: number;
  jumps: number;
  destroyed: number;
  escapes: number;
  vehicleSwaps: number;
  cleanSwaps: number;
}

export interface MissionState {
  phase: MissionPhase;
  mode: Player3DMode;
  score: number;
  heat: number;
  maxHeatReached: number;
  timeLeft: number;
  elapsed: number;
  deliveryElapsed: number;
  packageHealth: number;
  arrestProgress: number;
  escapeProgress: number;
  callout: string;
  calloutDetail: string;
  calloutTimer: number;
  resultReason: string;
  currentVehicleClass: VehicleClass;
  currentVehicleHealth: number;
  currentVehicleMaxHealth: number;
  stats: MissionStats;
}

export interface MissionTickContext {
  playerSpeed: number;
  currentVehicleHealth: number;
  currentVehicleMaxHealth: number;
  nearestPoliceDistance: number;
}

export function createMissionState(): MissionState {
  const starter = VEHICLE_3D_PROFILES.muscle;
  return {
    phase: "findCar",
    mode: "foot",
    score: 0,
    heat: 0,
    maxHeatReached: 0,
    timeLeft: 150,
    elapsed: 0,
    deliveryElapsed: 0,
    packageHealth: 100,
    arrestProgress: 0,
    escapeProgress: 0,
    callout: "FIND A RIDE",
    calloutDetail: "Get close and press E",
    calloutTimer: 3.4,
    resultReason: "",
    currentVehicleClass: "muscle",
    currentVehicleHealth: starter.maxHealth,
    currentVehicleMaxHealth: starter.maxHealth,
    stats: {
      nearMisses: 0,
      jumps: 0,
      destroyed: 0,
      escapes: 0,
      vehicleSwaps: 0,
      cleanSwaps: 0,
    },
  };
}

export function objectiveForMission(phase: MissionPhase): string {
  switch (phase) {
    case "findCar":
      return "Steal the marked ride";
    case "pickup":
      return "Grab the package";
    case "deliver":
      return "Deliver to the safehouse";
    case "won":
      return "Package delivered";
    case "busted":
      return "Run over";
  }
}

export class MissionController {
  readonly state: MissionState;

  constructor(initialState = createMissionState()) {
    this.state = initialState;
  }

  tick(deltaSeconds: number, context: MissionTickContext): void {
    const state = this.state;
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.04);
    state.calloutTimer = Math.max(0, state.calloutTimer - dt);
    state.currentVehicleHealth = context.currentVehicleHealth;
    state.currentVehicleMaxHealth = context.currentVehicleMaxHealth;

    if (state.phase === "won" || state.phase === "busted") return;

    state.elapsed += dt;
    state.timeLeft = Math.max(0, state.timeLeft - dt);

    if (state.phase === "deliver") {
      state.deliveryElapsed += dt;
      let targetHeat = 1;
      if (state.deliveryElapsed > 24) targetHeat = 2;
      if (state.deliveryElapsed > 52) targetHeat = 3;
      if (targetHeat > state.maxHeatReached) {
        state.maxHeatReached = targetHeat;
        state.heat = targetHeat;
        this.setCallout(
          `HEAT LEVEL ${targetHeat}`,
          targetHeat === 3 ? "Heavy units inbound" : "More units joining",
          1.6,
        );
      }

      if (
        context.nearestPoliceDistance < (state.mode === "foot" ? 3.5 : 4.5) &&
        (state.mode === "foot" || context.playerSpeed < 3)
      ) {
        state.arrestProgress += dt;
        if (state.arrestProgress > 2.35) this.end("BUSTED");
      } else {
        state.arrestProgress = Math.max(0, state.arrestProgress - dt * 1.8);
      }

      if (context.nearestPoliceDistance > 42 && state.heat > 1) {
        state.escapeProgress += dt;
        if (state.escapeProgress > 5.5) {
          state.heat -= 1;
          state.escapeProgress = 0;
          state.score += 450;
          state.stats.escapes += 1;
          this.setCallout("HEAT LOST", "+450 getaway bonus", 1.4);
        }
      } else {
        state.escapeProgress = Math.max(0, state.escapeProgress - dt * 0.6);
      }
    }

    if (state.mode === "car" && context.playerSpeed > 23) {
      state.score += Math.floor(dt * 24);
    }

    if (state.timeLeft <= 0) {
      this.end("TIME UP");
    } else if (state.packageHealth <= 0) {
      this.end("PACKAGE LOST");
    } else if (state.mode === "car" && context.currentVehicleHealth <= 0) {
      this.end("RIDE WRECKED");
    }
  }

  enterVehicle(
    vehicleClass: VehicleClass,
    health: number,
    maxHealth: number,
  ): void {
    const state = this.state;
    state.mode = "car";
    state.currentVehicleClass = vehicleClass;
    state.currentVehicleHealth = health;
    state.currentVehicleMaxHealth = maxHealth;
    const profile = VEHICLE_3D_PROFILES[vehicleClass];

    if (state.phase === "findCar") {
      state.phase = "pickup";
      state.score += 100;
      this.setCallout("RIDE ACQUIRED", `${profile.label} · package marked`);
    } else {
      this.setCallout("BACK IN", `${profile.label} · ${profile.trait}`, 1.1);
    }
  }

  exitVehicle(): void {
    this.state.mode = "foot";
    this.state.arrestProgress = 0;
    const profile = VEHICLE_3D_PROFILES[this.state.currentVehicleClass];
    this.setCallout(
      "ON FOOT",
      `Find a new ride or re-enter the ${profile.label}`,
      1.4,
    );
  }

  collectPackage(): void {
    const state = this.state;
    if (state.phase !== "pickup") return;
    state.phase = "deliver";
    state.heat = 1;
    state.maxHeatReached = 1;
    state.score += 500;
    state.deliveryElapsed = 0;
    this.setCallout(
      "PACKAGE SECURED",
      "Swap unseen to cut heat. Keep the cargo intact.",
    );
  }

  swapVehicle(
    vehicleClass: VehicleClass,
    health: number,
    maxHealth: number,
    witnessed: boolean,
  ): void {
    const state = this.state;
    const profile = VEHICLE_3D_PROFILES[vehicleClass];
    state.mode = "car";
    state.currentVehicleClass = vehicleClass;
    state.currentVehicleHealth = health;
    state.currentVehicleMaxHealth = maxHealth;
    state.stats.vehicleSwaps += 1;

    if (state.phase === "findCar") {
      state.phase = "pickup";
      state.score += 100;
      this.setCallout(`${profile.label.toUpperCase()} BOOSTED`, profile.trait);
      return;
    }

    if (state.phase !== "deliver") {
      this.setCallout(`${profile.label.toUpperCase()} BOOSTED`, profile.trait);
      return;
    }

    if (witnessed) {
      state.heat = Math.min(3, state.heat + 1);
      state.maxHeatReached = Math.max(state.maxHeatReached, state.heat);
      this.setCallout(
        "SWAP SPOTTED",
        `${profile.label} acquired · heat increased`,
        1.7,
      );
    } else {
      state.heat = Math.max(0, state.heat - 1);
      state.escapeProgress = 0;
      state.score += 350;
      state.stats.cleanSwaps += 1;
      this.setCallout(
        "CLEAN SWITCH",
        `${profile.label} acquired · heat down · +350`,
        1.7,
      );
    }
  }

  registerImpact(severity: number, vehicleClass: VehicleClass): void {
    if (this.state.phase !== "deliver" || severity <= 0) return;
    const profile = VEHICLE_3D_PROFILES[vehicleClass];
    this.state.packageHealth = Math.max(
      0,
      this.state.packageHealth -
        severity * profile.packageDamageMultiplier * 1.25,
    );
  }

  registerJump(): void {
    this.state.score += 300;
    this.state.stats.jumps += 1;
    this.setCallout("AIRBORNE", "+300 jump", 1.1);
  }

  registerBreakable(value: number, label: string): void {
    this.state.score += value;
    this.state.stats.destroyed += 1;
    this.setCallout(label, `+${value}`, 0.8);
  }

  registerNearMiss(): void {
    this.state.score += 180;
    this.state.stats.nearMisses += 1;
    this.setCallout("NEAR MISS", "+180 nerve bonus", 0.9);
  }

  deliver(): void {
    const state = this.state;
    if (state.phase !== "deliver" || state.mode !== "car") return;
    state.phase = "won";
    const packageBonus = Math.floor(state.packageHealth * 10);
    state.score += 2000 + Math.floor(state.timeLeft * 20) + packageBonus;
    state.callout = "DROP COMPLETE";
    state.calloutDetail = `${Math.ceil(
      state.packageHealth,
    )}% cargo · +${packageBonus}`;
    state.calloutTimer = 99;
  }

  policeCount(): number {
    return this.state.phase === "deliver" ? this.state.heat * 2 : 0;
  }

  isTerminal(): boolean {
    return this.state.phase === "won" || this.state.phase === "busted";
  }

  notify(title: string, detail: string, duration = 1.2): void {
    this.setCallout(title, detail, duration);
  }

  private end(reason: string): void {
    if (this.isTerminal()) return;
    this.state.phase = "busted";
    this.state.resultReason = reason;
    this.state.callout = reason;
    this.state.calloutDetail = "Run it back";
    this.state.calloutTimer = 99;
  }

  private setCallout(title: string, detail: string, duration = 1.8): void {
    this.state.callout = title;
    this.state.calloutDetail = detail;
    this.state.calloutTimer = duration;
  }
}
