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
  pursuitWaypoint: { x: number; z: number } | null;
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
  navigation: NavigationSnapshot;
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

export interface NavigationSnapshot {
  playerX: number;
  playerZ: number;
  headingDegrees: number;
  targetX: number;
  targetZ: number;
  targetLabel: string;
  targetDistance: number;
  relativeBearingDegrees: number;
  vehicles: Array<{
    id: string;
    role: VehicleRole;
    x: number;
    z: number;
  }>;
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
    const activeVehicle = this.getActiveVehicle();
    const vehicle = activeVehicle ?? this.getVehicle(this.lastVehicleId);
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
      navigation: this.navigationSnapshot(activeVehicle),
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

  private navigationSnapshot(
    activeVehicle: VehicleEntity | null,
  ): NavigationSnapshot {
    const player = this.playerPosition();
    const target = this.navigationTarget();
    const rotation = activeVehicle?.body.rotation();
    const headingDegrees = rotation
      ? -(2 * Math.atan2(rotation.y, rotation.w) * 180) / Math.PI
      : 0;
    const targetBearingDegrees =
      (Math.atan2(target.x - player.x, -(target.z - player.z)) * 180) / Math.PI;

    return {
      playerX: player.x,
      playerZ: player.z,
      headingDegrees: normalizeDegrees(headingDegrees),
      targetX: target.x,
      targetZ: target.z,
      targetLabel: target.label,
      targetDistance: distanceXZ(player, target),
      relativeBearingDegrees: normalizeDegrees(
        targetBearingDegrees - headingDegrees,
      ),
      vehicles: this.vehicles
        .filter((vehicle) => vehicle !== activeVehicle)
        .map((vehicle) => {
          const position = vehicle.body.translation();
          return {
            id: vehicle.id,
            role: vehicle.role,
            x: position.x,
            z: position.z,
          };
        }),
    };
  }

  private navigationTarget(): { x: number; z: number; label: string } {
    switch (this.mission.state.phase) {
      case "findCar": {
        const starter = this.getVehicle("starter");
        const position = starter?.body.translation() ?? STARTER_POSITION;
        return { x: position.x, z: position.z, label: "Ride" };
      }
      case "pickup":
        return { ...PACKAGE_POSITION, label: "Pickup" };
      case "deliver":
        return { ...DELIVERY_POSITION, label: "Safehouse" };
      case "won":
      case "busted": {
        const player = this.playerPosition();
        return { x: player.x, z: player.z, label: "Run complete" };
      }
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
        .setFriction(0.02)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
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
      pursuitWaypoint: null,
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
    const player = this.playerPosition();
    const playerVehicle = this.getActiveVehicle();
    const velocity = playerVehicle?.body.linvel() ?? { x: 0, z: 0 };
    const distance = distanceXZ(vehicle.body.translation(), player);
    const lookAhead = clamp(distance / 45, 0.2, 0.85);
    const predictedPlayer = {
      x: clamp(player.x + velocity.x * lookAhead, -52, 52),
      z: clamp(player.z + velocity.z * lookAhead, -42, 42),
    };
    let roadTarget = predictedPlayer;
    if (distance >= 12) {
      if (
        !vehicle.pursuitWaypoint ||
        distanceXZ(vehicle.body.translation(), vehicle.pursuitWaypoint) < 4.5
      ) {
        vehicle.pursuitWaypoint = pursuitWaypoint(
          vehicle.body.translation(),
          predictedPlayer,
        );
      }
      roadTarget = vehicle.pursuitWaypoint;
    } else {
      vehicle.pursuitWaypoint = null;
    }
    const target = rampAvoidanceWaypoint(
      vehicle.body.translation(),
      roadTarget,
    );
    return this.controlsToward(vehicle, target, 1.12);
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
    const forward = rotateVector(
      { x: 0, y: 0, z: -1 },
      vehicle.body.rotation(),
    );
    const right = rotateVector({ x: 1, y: 0, z: 0 }, vehicle.body.rotation());
    const forwardAlignment = direction.x * forward.x + direction.z * forward.z;
    const lateralAlignment = direction.x * right.x + direction.z * right.z;
    let steering = clamp(
      Math.atan2(lateralAlignment, forwardAlignment) / (Math.PI / 2),
      -1,
      1,
    );
    if (forwardAlignment < -0.85 && Math.abs(lateralAlignment) < 0.12) {
      if (vehicle.role === "police") {
        const road = nearestRoad(position);
        const outward =
          road.axis === "vertical"
            ? { x: Math.sign(road.coordinate), z: 0 }
            : { x: 0, z: Math.sign(road.coordinate) };
        steering = outward.x * right.x + outward.z * right.z >= 0 ? 1 : -1;
      } else {
        steering =
          vehicle.id.charCodeAt(vehicle.id.length - 1) % 2 === 0 ? 1 : -1;
      }
    }
    const speed = horizontalSpeed(vehicle.body.linvel());
    const pursuitSpeed = vehicle.role === "police" ? 1.18 : 1;
    const maxSpeed =
      VEHICLE_3D_PROFILES[vehicle.vehicleClass].maxSpeed * pursuitSpeed;
    let throttle = speed > maxSpeed * 0.78 ? 0.28 : throttleScale;
    if (forwardAlignment < -0.25) {
      throttle = Math.min(throttle, 0.32);
    } else if (Math.abs(steering) > 0.72) {
      throttle = Math.min(throttle, 0.68);
    }
    return {
      throttle,
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
    const pursuitAcceleration = vehicle.role === "police" ? 1.12 : 1;
    const pursuitSpeed = vehicle.role === "police" ? 1.18 : 1;
    const effectiveMaxSpeed = profile.maxSpeed * pursuitSpeed;

    body.resetForces(true);
    body.resetTorques(true);

    let driveForce = 0;
    if (controls.throttle > 0 && forwardSpeed < effectiveMaxSpeed) {
      driveForce =
        controls.throttle * profile.engineForce * pursuitAcceleration;
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

    const steeringAuthority = clamp(
      Math.abs(forwardSpeed) / 3.5,
      vehicle.role === "police" ? 0.28 : 0,
      1,
    );
    const speedRatio = clamp(Math.abs(forwardSpeed) / effectiveMaxSpeed, 0, 1);
    const direction = forwardSpeed >= 0 ? 1 : -1;
    const targetYawRate =
      -controls.steering *
      profile.steeringRate *
      steeringAuthority *
      (1 - speedRatio * 0.25) *
      direction *
      (controls.handbrake ? 1.35 : 1);
    const currentYawRate = body.angvel().y;
    const steeringResponse =
      controls.steering === 0 ? 18 : controls.handbrake ? 10 : 13;
    const steeringBlend = 1 - Math.exp(-steeringResponse * FIXED_TIMESTEP);
    body.setAngvel(
      {
        x: 0,
        y: currentYawRate + (targetYawRate - currentYawRate) * steeringBlend,
        z: 0,
      },
      true,
    );

    const maxHorizontalSpeed =
      forwardSpeed < 0 ? profile.reverseSpeed : effectiveMaxSpeed;
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
      const spawn = snapToRoad({
        x: clamp(player.x + offset.x, -52, 52),
        z: clamp(player.z + offset.z, -42, 42),
      });
      const firstTarget = pursuitWaypoint(spawn, player);
      const id = `police-${this.nextPoliceId}`;
      this.nextPoliceId += 1;
      this.spawnVehicle(
        id,
        this.mission.state.heat >= 3 ? "sport" : "muscle",
        {
          x: spawn.x,
          y: 0.95,
          z: spawn.z,
          yaw: yawToward(spawn, firstTarget),
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

type RoadPosition =
  | { axis: "vertical"; coordinate: number }
  | { axis: "horizontal"; coordinate: number };

const VERTICAL_ROADS = [-45, 45] as const;
const HORIZONTAL_ROADS = [-35, 35] as const;

function pursuitWaypoint(
  pursuer: { x: number; z: number },
  target: { x: number; z: number },
): { x: number; z: number } {
  if (distanceXZ(pursuer, target) < 12) return target;

  const pursuerRoad = nearestRoad(pursuer);
  const targetRoad = nearestRoad(target);

  if (
    pursuerRoad.axis === targetRoad.axis &&
    pursuerRoad.coordinate === targetRoad.coordinate
  ) {
    return target;
  }

  if (pursuerRoad.axis !== targetRoad.axis) {
    const intersection =
      pursuerRoad.axis === "vertical"
        ? { x: pursuerRoad.coordinate, z: targetRoad.coordinate }
        : { x: targetRoad.coordinate, z: pursuerRoad.coordinate };
    return distanceXZ(pursuer, intersection) > 4.5 ? intersection : target;
  }

  if (pursuerRoad.axis === "vertical") {
    const connector = closestConnector(HORIZONTAL_ROADS, pursuer.z, target.z);
    const firstIntersection = {
      x: pursuerRoad.coordinate,
      z: connector,
    };
    if (distanceXZ(pursuer, firstIntersection) > 4.5) {
      return firstIntersection;
    }
    return { x: targetRoad.coordinate, z: connector };
  }

  const connector = closestConnector(VERTICAL_ROADS, pursuer.x, target.x);
  const firstIntersection = {
    x: connector,
    z: pursuerRoad.coordinate,
  };
  if (distanceXZ(pursuer, firstIntersection) > 4.5) {
    return firstIntersection;
  }
  return { x: connector, z: targetRoad.coordinate };
}

function rampAvoidanceWaypoint(
  pursuer: { x: number; z: number },
  target: { x: number; z: number },
): { x: number; z: number } {
  for (const ramp of RAMPS) {
    if (ramp.tiltAxis === "x") {
      const travel = Math.sign(target.z - pursuer.z);
      const rampIsAhead =
        travel !== 0 &&
        (ramp.z - pursuer.z) * travel > 0 &&
        (ramp.z - target.z) * travel < 0;
      if (
        rampIsAhead &&
        Math.abs(ramp.z - pursuer.z) < 20 &&
        Math.abs(ramp.x - pursuer.x) < 8
      ) {
        const side = pursuer.x <= ramp.x ? -1 : 1;
        return {
          x: ramp.x + side * 5.2,
          z: ramp.z + travel * 6,
        };
      }
    } else {
      const travel = Math.sign(target.x - pursuer.x);
      const rampIsAhead =
        travel !== 0 &&
        (ramp.x - pursuer.x) * travel > 0 &&
        (ramp.x - target.x) * travel < 0;
      if (
        rampIsAhead &&
        Math.abs(ramp.x - pursuer.x) < 20 &&
        Math.abs(ramp.z - pursuer.z) < 8
      ) {
        const side = pursuer.z <= ramp.z ? -1 : 1;
        return {
          x: ramp.x + travel * 6,
          z: ramp.z + side * 5.2,
        };
      }
    }
  }
  return target;
}

function nearestRoad(position: { x: number; z: number }): RoadPosition {
  const vertical = closestValue(VERTICAL_ROADS, position.x);
  const horizontal = closestValue(HORIZONTAL_ROADS, position.z);
  return Math.abs(position.x - vertical) <= Math.abs(position.z - horizontal)
    ? { axis: "vertical", coordinate: vertical }
    : { axis: "horizontal", coordinate: horizontal };
}

function snapToRoad(position: { x: number; z: number }): {
  x: number;
  z: number;
} {
  const road = nearestRoad(position);
  return road.axis === "vertical"
    ? { x: road.coordinate, z: clamp(position.z, -42, 42) }
    : { x: clamp(position.x, -52, 52), z: road.coordinate };
}

function closestConnector(
  connectors: readonly number[],
  from: number,
  to: number,
): number {
  return connectors.reduce((best, candidate) =>
    Math.abs(from - candidate) + Math.abs(to - candidate) <
    Math.abs(from - best) + Math.abs(to - best)
      ? candidate
      : best,
  );
}

function closestValue(values: readonly number[], target: number): number {
  return values.reduce((best, candidate) =>
    Math.abs(target - candidate) < Math.abs(target - best) ? candidate : best,
  );
}

function yawToward(
  from: { x: number; z: number },
  to: { x: number; z: number },
): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeDegrees(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
