import RAPIER, {
  type Collider,
  type KinematicCharacterController,
  type RigidBody,
  type World,
} from "@dimforge/rapier3d-compat";
import type { VehicleClass } from "../game/engine";
import {
  BREAKABLE_PROPS,
  CITY_BUILDINGS,
  DELIVERY_POSITION,
  FIXED_TIMESTEP,
  FOOT_START,
  PACKAGE_POSITION,
  RAMPS,
  STARTER_POSITION,
  TRAFFIC_ROUTE,
  VEHICLE_3D_PROFILES,
  WORLD_DEPTH,
  WORLD_WIDTH,
  type PropSpec,
} from "./config";
import {
  MissionController,
  objectiveForMission,
  type MissionState,
} from "./gameplay";

export interface Game3DInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  action: boolean;
}

export type VehicleRole = "player" | "traffic" | "police" | "parked";

export interface VehicleEntity {
  id: string;
  vehicleClass: VehicleClass;
  color: number;
  role: VehicleRole;
  body: RigidBody;
  collider: Collider;
  health: number;
  maxHealth: number;
  routeIndex: number;
  previousSpeed: number;
  airborne: boolean;
  nearMissReady: boolean;
}

export interface PropEntity {
  spec: PropSpec;
  body: RigidBody;
  collider: Collider;
  broken: boolean;
}

export interface SimulationSnapshot {
  mission: MissionState;
  objective: string;
  speedMph: number;
  interaction: string;
  vehicleLabel: string;
  vehicleTrait: string;
  vehicleClass: VehicleClass;
  vehicleHealthPercent: number;
  policeCount: number;
  playerY: number;
  drifting: boolean;
}

interface VehicleControls {
  throttle: number;
  steering: number;
  handbrake: boolean;
}

const EMPTY_CONTROLS: VehicleControls = {
  throttle: 0,
  steering: 0,
  handbrake: false,
};

export class HotDropSimulation {
  readonly world: World;
  readonly mission = new MissionController();
  readonly vehicles: VehicleEntity[] = [];
  readonly props: PropEntity[] = [];
  readonly footBody: RigidBody;
  readonly footCollider: Collider;
  readonly characterController: KinematicCharacterController;

  private activeVehicleId: string | null = null;
  private lastVehicleId = "starter";
  private actionHeld = false;
  private nextPoliceId = 0;
  private drifting = false;

  static async create(): Promise<HotDropSimulation> {
    await RAPIER.init();
    return new HotDropSimulation();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.world.timestep = FIXED_TIMESTEP;
    this.createStaticWorld();

    this.footBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        FOOT_START.x,
        FOOT_START.y,
        FOOT_START.z,
      ),
    );
    this.footCollider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.45, 0.35).setFriction(0),
      this.footBody,
    );
    this.characterController = this.world.createCharacterController(0.06);
    this.characterController.setSlideEnabled(true);
    this.characterController.enableAutostep(0.35, 0.2, false);
    this.characterController.enableSnapToGround(0.25);

    this.spawnVehicle(
      "starter",
      "muscle",
      STARTER_POSITION,
      "parked",
      0xf06842,
      0,
    );
    this.spawnVehicle(
      "traffic-sport",
      "sport",
      { x: 0, y: 0.82, z: -35, yaw: -Math.PI / 2 },
      "traffic",
      0x58c9d6,
      2,
    );
    this.spawnVehicle(
      "traffic-van",
      "van",
      { x: 45, y: 1.15, z: 12, yaw: 0 },
      "traffic",
      0x7dbf83,
      2,
    );
    this.spawnVehicle(
      "traffic-muscle",
      "muscle",
      { x: -12, y: 0.9, z: 35, yaw: Math.PI / 2 },
      "traffic",
      0xa985d6,
      4,
    );
    this.createProps();
  }

  step(input: Game3DInput): void {
    const actionPressed = input.action && !this.actionHeld;
    this.actionHeld = input.action;
    const state = this.mission.state;

    if (!this.mission.isTerminal()) {
      if (state.mode === "foot") {
        this.updateFoot(input);
        if (actionPressed) this.tryEnterNearestVehicle();
      } else {
        const playerVehicle = this.getActiveVehicle();
        if (actionPressed && playerVehicle) {
          const speed = horizontalSpeed(playerVehicle.body.linvel());
          if (speed <= 4.2) {
            this.exitVehicle(playerVehicle);
          } else {
            this.mission.notify(
              "TOO FAST",
              "Slow below 10 MPH to bail out",
              1.1,
            );
          }
        }
      }
    }

    for (const vehicle of this.vehicles) {
      let controls = EMPTY_CONTROLS;
      if (!this.mission.isTerminal()) {
        if (vehicle.id === this.activeVehicleId) {
          controls = {
            throttle: Number(input.up) - Number(input.down),
            steering: Number(input.right) - Number(input.left),
            handbrake: input.handbrake,
          };
          this.drifting =
            input.handbrake && horizontalSpeed(vehicle.body.linvel()) > 7;
        } else if (vehicle.role === "traffic") {
          controls = this.routeControls(vehicle);
        } else if (vehicle.role === "police") {
          controls = this.pursuitControls(vehicle);
        }
      }
      this.applyVehicleControls(vehicle, controls);
    }

    this.world.step();
    this.afterPhysicsStep();
  }

  snapshot(): SimulationSnapshot {
    const state = this.mission.state;
    const vehicle =
      this.getActiveVehicle() ?? this.getVehicle(this.lastVehicleId);
    const profile =
      VEHICLE_3D_PROFILES[vehicle?.vehicleClass ?? state.currentVehicleClass];
    const speed = vehicle ? horizontalSpeed(vehicle.body.linvel()) : 0;
    const vehicleHealthPercent = vehicle
      ? (vehicle.health / vehicle.maxHealth) * 100
      : 0;
    const playerY =
      state.mode === "car" && vehicle
        ? vehicle.body.translation().y
        : this.footBody.translation().y;

    return {
      mission: {
        ...state,
        stats: { ...state.stats },
      },
      objective: objectiveForMission(state.phase),
      speedMph: Math.round(speed * 2.237),
      interaction: this.interactionPrompt(),
      vehicleLabel: profile.label,
      vehicleTrait: profile.trait,
      vehicleClass: vehicle?.vehicleClass ?? state.currentVehicleClass,
      vehicleHealthPercent,
      policeCount: this.vehicles.filter(
        (candidate) => candidate.role === "police",
      ).length,
      playerY,
      drifting: this.drifting,
    };
  }

  playerPosition(): { x: number; y: number; z: number } {
    const vehicle = this.getActiveVehicle();
    const position =
      this.mission.state.mode === "car" && vehicle
        ? vehicle.body.translation()
        : this.footBody.translation();
    return { x: position.x, y: position.y, z: position.z };
  }

  activeVehicle(): VehicleEntity | null {
    return this.getActiveVehicle();
  }

  dispose(): void {
    this.characterController.free();
    this.world.free();
  }

  private createStaticWorld(): void {
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(WORLD_WIDTH / 2, 0.25, WORLD_DEPTH / 2)
        .setTranslation(0, -0.25, 0)
        .setFriction(1.2),
    );

    for (const building of CITY_BUILDINGS) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          building.width / 2,
          building.height / 2,
          building.depth / 2,
        )
          .setTranslation(building.x, building.height / 2, building.z)
          .setFriction(0.9)
          .setRestitution(0.08),
      );
    }

    const wallThickness = 1;
    const wallHeight = 2.5;
    const walls = [
      { x: 0, z: -WORLD_DEPTH / 2, width: WORLD_WIDTH, depth: wallThickness },
      { x: 0, z: WORLD_DEPTH / 2, width: WORLD_WIDTH, depth: wallThickness },
      { x: -WORLD_WIDTH / 2, z: 0, width: wallThickness, depth: WORLD_DEPTH },
      { x: WORLD_WIDTH / 2, z: 0, width: wallThickness, depth: WORLD_DEPTH },
    ];
    for (const wall of walls) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          wall.width / 2,
          wallHeight / 2,
          wall.depth / 2,
        ).setTranslation(wall.x, wallHeight / 2, wall.z),
      );
    }

    for (const ramp of RAMPS) {
      const halfAngle = ramp.tilt / 2;
      const rotation =
        ramp.tiltAxis === "x"
          ? { x: Math.sin(halfAngle), y: 0, z: 0, w: Math.cos(halfAngle) }
          : { x: 0, y: 0, z: Math.sin(halfAngle), w: Math.cos(halfAngle) };
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(3.2, 0.3, 2.1)
          .setTranslation(ramp.x, 0.5, ramp.z)
          .setRotation(rotation)
          .setFriction(1.1),
      );
    }
  }

  private createProps(): void {
    for (const spec of BREAKABLE_PROPS) {
      const dimensions =
        spec.kind === "crate"
          ? { halfHeight: 0.65, radius: 0.65 }
          : spec.kind === "cone"
            ? { halfHeight: 0.45, radius: 0.34 }
            : { halfHeight: 0.55, radius: 0.32 };
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(spec.x, dimensions.halfHeight, spec.z)
          .setLinearDamping(0.9)
          .setAngularDamping(0.7),
      );
      const colliderDescriptor =
        spec.kind === "crate"
          ? RAPIER.ColliderDesc.cuboid(0.65, 0.65, 0.65)
          : spec.kind === "cone"
            ? RAPIER.ColliderDesc.cone(0.45, 0.34)
            : RAPIER.ColliderDesc.cylinder(0.55, 0.32);
      const collider = this.world.createCollider(
        colliderDescriptor
          .setDensity(spec.kind === "crate" ? 18 : 8)
          .setFriction(0.8)
          .setRestitution(0.25),
        body,
      );
      this.props.push({ spec, body, collider, broken: false });
    }
  }

  private spawnVehicle(
    id: string,
    vehicleClass: VehicleClass,
    position: { x: number; y: number; z: number; yaw: number },
    role: VehicleRole,
    color: number,
    routeIndex: number,
  ): VehicleEntity {
    const profile = VEHICLE_3D_PROFILES[vehicleClass];
    const halfYaw = position.yaw / 2;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({
          x: 0,
          y: Math.sin(halfYaw),
          z: 0,
          w: Math.cos(halfYaw),
        })
        .setLinearDamping(0.12)
        .setAngularDamping(2.2)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .enabledRotations(false, true, false),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        profile.width / 2,
        profile.height / 2,
        profile.length / 2,
      )
        .setMass(profile.mass)
        .setFriction(0.95)
        .setRestitution(0.04),
      body,
    );
    const entity: VehicleEntity = {
      id,
      vehicleClass,
      color,
      role,
      body,
      collider,
      health: profile.maxHealth,
      maxHealth: profile.maxHealth,
      routeIndex,
      previousSpeed: 0,
      airborne: false,
      nearMissReady: true,
    };
    this.vehicles.push(entity);
    return entity;
  }

  private updateFoot(input: Game3DInput): void {
    const xAxis = Number(input.right) - Number(input.left);
    const zAxis = Number(input.down) - Number(input.up);
    const length = Math.hypot(xAxis, zAxis) || 1;
    const desired = {
      x: (xAxis / length) * 6.5 * FIXED_TIMESTEP,
      y: -0.05,
      z: (zAxis / length) * 6.5 * FIXED_TIMESTEP,
    };
    this.characterController.computeColliderMovement(
      this.footCollider,
      desired,
    );
    const movement = this.characterController.computedMovement();
    const position = this.footBody.translation();
    this.footBody.setNextKinematicTranslation({
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    });
  }

  private tryEnterNearestVehicle(): void {
    const nearest = this.nearestStealableVehicle();
    if (!nearest || nearest.distance > 5) return;

    const vehicle = nearest.vehicle;
    const isReentry = vehicle.id === this.lastVehicleId;
    const witnessed =
      this.mission.state.phase === "deliver" &&
      this.nearestPoliceDistance() < 35;
    vehicle.role = "player";
    this.activeVehicleId = vehicle.id;
    this.lastVehicleId = vehicle.id;
    this.footBody.setEnabled(false);

    if (isReentry) {
      this.mission.enterVehicle(
        vehicle.vehicleClass,
        vehicle.health,
        vehicle.maxHealth,
      );
    } else {
      this.mission.swapVehicle(
        vehicle.vehicleClass,
        vehicle.health,
        vehicle.maxHealth,
        witnessed,
      );
    }
    this.syncPoliceCount();
  }

  private exitVehicle(vehicle: VehicleEntity): void {
    const position = vehicle.body.translation();
    const rotation = vehicle.body.rotation();
    const right = rotateVector({ x: 1, y: 0, z: 0 }, rotation);
    vehicle.role = "parked";
    vehicle.body.setLinvel({ x: 0, y: vehicle.body.linvel().y, z: 0 }, true);
    this.activeVehicleId = null;
    this.lastVehicleId = vehicle.id;
    this.footBody.setEnabled(true);
    this.footBody.setTranslation(
      {
        x:
          position.x +
          right.x * (VEHICLE_3D_PROFILES[vehicle.vehicleClass].width + 1),
        y: Math.max(1.05, position.y),
        z:
          position.z +
          right.z * (VEHICLE_3D_PROFILES[vehicle.vehicleClass].width + 1),
      },
      true,
    );
    this.mission.exitVehicle();
  }

  private routeControls(vehicle: VehicleEntity): VehicleControls {
    const target = TRAFFIC_ROUTE[vehicle.routeIndex];
    const controls = this.controlsToward(vehicle, target, 0.66);
    const position = vehicle.body.translation();
    if (distanceXZ(position, target) < 5) {
      vehicle.routeIndex = (vehicle.routeIndex + 1) % TRAFFIC_ROUTE.length;
    }
    return controls;
  }

  private pursuitControls(vehicle: VehicleEntity): VehicleControls {
    return this.controlsToward(vehicle, this.playerPosition(), 1);
  }

  private controlsToward(
    vehicle: VehicleEntity,
    target: { x: number; z: number },
    throttleScale: number,
  ): VehicleControls {
    const position = vehicle.body.translation();
    const delta = { x: target.x - position.x, y: 0, z: target.z - position.z };
    const length = Math.hypot(delta.x, delta.z) || 1;
    const direction = { x: delta.x / length, y: 0, z: delta.z / length };
    const right = rotateVector({ x: 1, y: 0, z: 0 }, vehicle.body.rotation());
    const steering = clamp(
      direction.x * right.x + direction.z * right.z,
      -1,
      1,
    );
    const speed = horizontalSpeed(vehicle.body.linvel());
    const maxSpeed = VEHICLE_3D_PROFILES[vehicle.vehicleClass].maxSpeed;
    return {
      throttle: speed > maxSpeed * 0.78 ? 0.28 : throttleScale,
      steering,
      handbrake: Math.abs(steering) > 0.76 && speed > 12,
    };
  }

  private applyVehicleControls(
    vehicle: VehicleEntity,
    controls: VehicleControls,
  ): void {
    const body = vehicle.body;
    const profile = VEHICLE_3D_PROFILES[vehicle.vehicleClass];
    const rotation = body.rotation();
    const forward = rotateVector({ x: 0, y: 0, z: -1 }, rotation);
    const right = rotateVector({ x: 1, y: 0, z: 0 }, rotation);
    const velocity = body.linvel();
    const forwardSpeed = velocity.x * forward.x + velocity.z * forward.z;
    const lateralSpeed = velocity.x * right.x + velocity.z * right.z;
    const mass = body.mass();

    let driveForce = 0;
    if (controls.throttle > 0 && forwardSpeed < profile.maxSpeed) {
      driveForce = controls.throttle * profile.engineForce;
    } else if (controls.throttle < 0) {
      driveForce =
        forwardSpeed > 1
          ? controls.throttle * profile.brakeForce
          : forwardSpeed > -profile.reverseSpeed
            ? controls.throttle * profile.engineForce * 0.58
            : 0;
    }

    body.addForce(
      {
        x: forward.x * driveForce,
        y: -mass * Math.min(horizontalSpeed(velocity) * 0.3, 8),
        z: forward.z * driveForce,
      },
      true,
    );

    const grip = controls.handbrake ? profile.driftGrip : profile.grip;
    body.addForce(
      {
        x: -right.x * lateralSpeed * mass * grip,
        y: 0,
        z: -right.z * lateralSpeed * mass * grip,
      },
      true,
    );
    body.addForce(
      {
        x: -forward.x * forwardSpeed * mass * 0.34,
        y: 0,
        z: -forward.z * forwardSpeed * mass * 0.34,
      },
      true,
    );

    const steeringAuthority = clamp(Math.abs(forwardSpeed) / 5, 0.12, 1);
    const direction = forwardSpeed >= 0 ? 1 : -1;
    body.addTorque(
      {
        x: 0,
        y:
          -controls.steering *
          profile.steeringTorque *
          steeringAuthority *
          direction *
          (controls.handbrake ? 1.35 : 1),
        z: 0,
      },
      true,
    );

    const maxHorizontalSpeed =
      forwardSpeed < 0 ? profile.reverseSpeed : profile.maxSpeed;
    const currentHorizontalSpeed = horizontalSpeed(velocity);
    if (currentHorizontalSpeed > maxHorizontalSpeed * 1.08) {
      const scale = (maxHorizontalSpeed * 1.08) / currentHorizontalSpeed;
      body.setLinvel(
        { x: velocity.x * scale, y: velocity.y, z: velocity.z * scale },
        true,
      );
    }
  }

  private afterPhysicsStep(): void {
    const playerVehicle = this.getActiveVehicle();
    if (playerVehicle) {
      const velocity = playerVehicle.body.linvel();
      const speed = horizontalSpeed(velocity);
      const speedDrop = Math.max(0, playerVehicle.previousSpeed - speed);
      if (speedDrop > 4.5 && playerVehicle.body.translation().y < 2.4) {
        const profile = VEHICLE_3D_PROFILES[playerVehicle.vehicleClass];
        const severity = (speedDrop - 3.5) * 2.3;
        playerVehicle.health = Math.max(
          0,
          playerVehicle.health - severity * profile.damageMultiplier,
        );
        this.mission.registerImpact(severity, playerVehicle.vehicleClass);
        this.mission.notify(
          "HARD HIT",
          `${profile.label} integrity ${Math.ceil(
            (playerVehicle.health / playerVehicle.maxHealth) * 100,
          )}%`,
          1.15,
        );
      }
      playerVehicle.previousSpeed = speed;

      const y = playerVehicle.body.translation().y;
      if (!playerVehicle.airborne && y > 1.65 && velocity.y > 0.6) {
        playerVehicle.airborne = true;
        this.mission.registerJump();
      } else if (playerVehicle.airborne && y < 1.25) {
        playerVehicle.airborne = false;
      }

      this.updateBreakables(playerVehicle, speed);
      this.updateNearMisses(playerVehicle, speed);

      if (
        this.mission.state.phase === "pickup" &&
        distanceXZ(playerVehicle.body.translation(), PACKAGE_POSITION) < 4.2
      ) {
        this.mission.collectPackage();
      }
      if (
        this.mission.state.phase === "deliver" &&
        distanceXZ(playerVehicle.body.translation(), DELIVERY_POSITION) < 5
      ) {
        this.mission.deliver();
      }
    }

    for (const vehicle of this.vehicles) {
      if (vehicle !== playerVehicle) {
        vehicle.previousSpeed = horizontalSpeed(vehicle.body.linvel());
      }
    }

    const currentVehicle = playerVehicle ?? this.getVehicle(this.lastVehicleId);
    this.mission.tick(FIXED_TIMESTEP, {
      playerSpeed: playerVehicle
        ? horizontalSpeed(playerVehicle.body.linvel())
        : 0,
      currentVehicleHealth: currentVehicle?.health ?? 0,
      currentVehicleMaxHealth: currentVehicle?.maxHealth ?? 1,
      nearestPoliceDistance: this.nearestPoliceDistance(),
    });
    this.syncPoliceCount();
  }

  private updateBreakables(playerVehicle: VehicleEntity, speed: number): void {
    if (speed < 5) return;
    const carPosition = playerVehicle.body.translation();
    const vehicleProfile = VEHICLE_3D_PROFILES[playerVehicle.vehicleClass];
    for (const prop of this.props) {
      if (prop.broken) continue;
      const propPosition = prop.body.translation();
      const propReach = prop.spec.kind === "crate" ? 0.85 : 0.55;
      const impactReach =
        Math.max(vehicleProfile.width, vehicleProfile.length) / 2 + propReach;
      if (distanceXZ(carPosition, propPosition) > impactReach) continue;
      prop.broken = true;
      const deltaX = propPosition.x - carPosition.x;
      const deltaZ = propPosition.z - carPosition.z;
      const length = Math.hypot(deltaX, deltaZ) || 1;
      prop.body.applyImpulse(
        {
          x: (deltaX / length) * speed * 2.5,
          y: Math.min(8, speed * 0.35),
          z: (deltaZ / length) * speed * 2.5,
        },
        true,
      );
      const label =
        prop.spec.kind === "hydrant" ? "CITY PRESSURE" : "SMASH BONUS";
      this.mission.registerBreakable(prop.spec.value, label);
    }
  }

  private updateNearMisses(playerVehicle: VehicleEntity, speed: number): void {
    for (const traffic of this.vehicles) {
      if (traffic.role !== "traffic") continue;
      const gap = distanceXZ(
        playerVehicle.body.translation(),
        traffic.body.translation(),
      );
      if (gap > 8) traffic.nearMissReady = true;
      if (traffic.nearMissReady && gap > 2.3 && gap < 4.3 && speed > 17) {
        traffic.nearMissReady = false;
        this.mission.registerNearMiss();
      }
    }
  }

  private syncPoliceCount(): void {
    const desired = this.mission.policeCount();
    const police = this.vehicles.filter((vehicle) => vehicle.role === "police");

    for (let index = desired; index < police.length; index += 1) {
      this.world.removeRigidBody(police[index].body);
      const vehicleIndex = this.vehicles.indexOf(police[index]);
      if (vehicleIndex >= 0) this.vehicles.splice(vehicleIndex, 1);
    }

    const spawnOffsets = [
      { x: -16, z: 18 },
      { x: 16, z: -18 },
      { x: 24, z: 8 },
      { x: -24, z: -8 },
      { x: 8, z: 26 },
      { x: -8, z: -26 },
    ];
    const player = this.playerPosition();
    for (let index = police.length; index < desired; index += 1) {
      const offset = spawnOffsets[index % spawnOffsets.length];
      const id = `police-${this.nextPoliceId}`;
      this.nextPoliceId += 1;
      this.spawnVehicle(
        id,
        this.mission.state.heat >= 3 ? "sport" : "muscle",
        {
          x: clamp(player.x + offset.x, -52, 52),
          y: 0.95,
          z: clamp(player.z + offset.z, -42, 42),
          yaw: Math.atan2(-offset.x, -offset.z),
        },
        "police",
        0xe9efe8,
        0,
      );
    }
  }

  private nearestPoliceDistance(): number {
    const player = this.playerPosition();
    let nearest = Number.POSITIVE_INFINITY;
    for (const vehicle of this.vehicles) {
      if (vehicle.role !== "police") continue;
      nearest = Math.min(
        nearest,
        distanceXZ(player, vehicle.body.translation()),
      );
    }
    return nearest;
  }

  private nearestStealableVehicle(): {
    vehicle: VehicleEntity;
    distance: number;
  } | null {
    const foot = this.footBody.translation();
    let nearest: { vehicle: VehicleEntity; distance: number } | null = null;
    for (const vehicle of this.vehicles) {
      if (vehicle.role === "police" || vehicle.health <= 0) continue;
      const gap = distanceXZ(foot, vehicle.body.translation());
      if (!nearest || gap < nearest.distance) {
        nearest = { vehicle, distance: gap };
      }
    }
    return nearest;
  }

  private interactionPrompt(): string {
    const active = this.getActiveVehicle();
    if (this.mission.state.mode === "car" && active) {
      return horizontalSpeed(active.body.linvel()) <= 4.2
        ? `Exit ${VEHICLE_3D_PROFILES[active.vehicleClass].label}`
        : "";
    }
    const nearest = this.nearestStealableVehicle();
    if (!nearest || nearest.distance > 5) return "";
    const profile = VEHICLE_3D_PROFILES[nearest.vehicle.vehicleClass];
    return nearest.vehicle.id === this.lastVehicleId
      ? `Re-enter ${profile.label}`
      : `Steal ${profile.label}`;
  }

  private getActiveVehicle(): VehicleEntity | null {
    return this.activeVehicleId
      ? (this.getVehicle(this.activeVehicleId) ?? null)
      : null;
  }

  private getVehicle(id: string): VehicleEntity | undefined {
    return this.vehicles.find((vehicle) => vehicle.id === id);
  }
}

function rotateVector(
  vector: { x: number; y: number; z: number },
  quaternion: { x: number; y: number; z: number; w: number },
): { x: number; y: number; z: number } {
  const ix =
    quaternion.w * vector.x + quaternion.y * vector.z - quaternion.z * vector.y;
  const iy =
    quaternion.w * vector.y + quaternion.z * vector.x - quaternion.x * vector.z;
  const iz =
    quaternion.w * vector.z + quaternion.x * vector.y - quaternion.y * vector.x;
  const iw =
    -quaternion.x * vector.x -
    quaternion.y * vector.y -
    quaternion.z * vector.z;

  return {
    x:
      ix * quaternion.w +
      iw * -quaternion.x +
      iy * -quaternion.z -
      iz * -quaternion.y,
    y:
      iy * quaternion.w +
      iw * -quaternion.y +
      iz * -quaternion.x -
      ix * -quaternion.z,
    z:
      iz * quaternion.w +
      iw * -quaternion.z +
      ix * -quaternion.y -
      iy * -quaternion.x,
  };
}

function horizontalSpeed(vector: { x: number; z: number }): number {
  return Math.hypot(vector.x, vector.z);
}

function distanceXZ(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
