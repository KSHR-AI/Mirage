import * as THREE from "three";
import {
  CITY_BUILDINGS,
  DELIVERY_POSITION,
  PACKAGE_POSITION,
  RAMPS,
  ROAD_SEGMENTS,
  VEHICLE_3D_PROFILES,
  WORLD_DEPTH,
  WORLD_WIDTH,
} from "./config";
import {
  HotDropSimulation,
  type PropEntity,
  type VehicleEntity,
} from "./simulation";

interface VehicleVisual {
  group: THREE.Group;
  outline: THREE.LineSegments;
  siren: THREE.Group | null;
}

export class HotDropPresentation {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 320);

  private readonly vehicleVisuals = new Map<string, VehicleVisual>();
  private readonly propVisuals = new Map<string, THREE.Object3D>();
  private readonly footVisual: THREE.Group;
  private readonly packageMarker: THREE.Group;
  private readonly deliveryMarker: THREE.Group;
  private readonly starterMarker: THREE.Group;
  private readonly clock = new THREE.Clock();
  private width = 1;
  private height = 1;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly simulation: HotDropSimulation,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x101613);
    this.scene.fog = new THREE.FogExp2(0x111713, 0.0085);

    this.buildLighting();
    this.buildCity();
    this.footVisual = this.createFootVisual();
    this.scene.add(this.footVisual);
    this.packageMarker = this.createMissionMarker(0xffc84a, "package");
    this.packageMarker.position.set(
      PACKAGE_POSITION.x,
      PACKAGE_POSITION.y,
      PACKAGE_POSITION.z,
    );
    this.scene.add(this.packageMarker);
    this.deliveryMarker = this.createMissionMarker(0xcfff4e, "delivery");
    this.deliveryMarker.position.set(
      DELIVERY_POSITION.x,
      DELIVERY_POSITION.y,
      DELIVERY_POSITION.z,
    );
    this.scene.add(this.deliveryMarker);
    this.starterMarker = this.createMissionMarker(0xffc84a, "starter");
    this.scene.add(this.starterMarker);

    for (const prop of simulation.props) {
      const visual = this.createPropVisual(prop);
      this.propVisuals.set(prop.spec.id, visual);
      this.scene.add(visual);
    }

    this.camera.position.set(-55, 10, 31);
    this.camera.lookAt(-45, 0, 17);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
  }

  render(timeMilliseconds: number): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.syncVehicles(dt, timeMilliseconds);
    this.syncProps(dt);
    this.syncFoot(dt);
    this.syncMissionMarkers(timeMilliseconds);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.LineSegments
      ) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.renderer.dispose();
  }

  private buildLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0xc8e5dc, 0x263029, 2.2);
    this.scene.add(hemisphere);

    const moon = new THREE.DirectionalLight(0xffe6bd, 3.3);
    moon.position.set(-35, 60, 24);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -75;
    moon.shadow.camera.right = 75;
    moon.shadow.camera.top = 65;
    moon.shadow.camera.bottom = -65;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 140;
    this.scene.add(moon);

    const cityGlow = new THREE.PointLight(0xf06842, 42, 80, 1.5);
    cityGlow.position.set(0, 18, 0);
    this.scene.add(cityGlow);
  }

  private buildCity(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH),
      new THREE.MeshStandardMaterial({
        color: 0x596451,
        roughness: 1,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const asphaltMaterial = new THREE.MeshStandardMaterial({
      color: 0x232d2b,
      roughness: 0.96,
      metalness: 0.02,
    });
    for (const road of ROAD_SEGMENTS) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(road.width, road.depth),
        asphaltMaterial,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(road.x, 0.011, road.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    this.buildRoadMarkings();

    for (const building of CITY_BUILDINGS) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(building.width, building.height, building.depth),
        new THREE.MeshStandardMaterial({
          color: building.color,
          roughness: 0.82,
          metalness: 0.08,
        }),
      );
      body.position.y = building.height / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(building.width * 0.35, 1, building.depth * 0.32),
        new THREE.MeshStandardMaterial({
          color: 0x27302d,
          roughness: 0.9,
        }),
      );
      roof.position.y = building.height + 0.5;
      roof.castShadow = true;
      group.add(roof);

      const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0xffce70,
        emissive: 0xff8b36,
        emissiveIntensity: 0.7,
        roughness: 0.35,
      });
      for (let floor = 2; floor < building.height - 1; floor += 3.2) {
        for (
          let offset = -building.width * 0.32;
          offset <= building.width * 0.32;
          offset += 5
        ) {
          const windowMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 1),
            windowMaterial,
          );
          windowMesh.position.set(offset, floor, building.depth / 2 + 0.011);
          group.add(windowMesh);
        }
      }

      group.position.set(building.x, 0, building.z);
      this.scene.add(group);
    }

    this.buildSkyline();
    this.buildRamps();
  }

  private buildRoadMarkings(): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0xe9d9a7,
      transparent: true,
      opacity: 0.58,
    });
    for (const z of [-35, 35]) {
      for (let x = -55; x <= 55; x += 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.18), material);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.024, z);
        this.scene.add(dash);
      }
    }
    for (const x of [-45, 45]) {
      for (let z = -45; z <= 45; z += 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 4), material);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.024, z);
        this.scene.add(dash);
      }
    }
  }

  private buildSkyline(): void {
    const material = new THREE.MeshStandardMaterial({
      color: 0x1e2924,
      roughness: 0.9,
    });
    const placements = [
      [-54, -41, 12, 14, 8],
      [-30, -45, 20, 20, 7],
      [8, -45, 18, 11, 7],
      [34, -44, 15, 18, 8],
      [55, -22, 8, 15, 17],
      [55, 16, 8, 22, 18],
      [-55, -16, 8, 18, 17],
      [-55, 19, 8, 12, 17],
    ] as const;
    for (const [x, z, width, height, depth] of placements) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material,
      );
      mesh.position.set(x, height / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  private buildRamps(): void {
    for (const ramp of RAMPS) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(6.4, 0.6, 4.2),
        new THREE.MeshStandardMaterial({
          color: 0xa64d37,
          roughness: 0.75,
          metalness: 0.18,
        }),
      );
      mesh.position.set(ramp.x, 0.5, ramp.z);
      mesh.rotation.y = ramp.yaw;
      mesh.rotation[ramp.tiltAxis] = ramp.tilt;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xf0c34f });
      for (const offset of [-1.8, 0, 1.8]) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.62, 4.23),
          stripeMaterial,
        );
        stripe.position.copy(mesh.position);
        stripe.position.x += offset;
        stripe.rotation.copy(mesh.rotation);
        this.scene.add(stripe);
      }
    }
  }

  private createVehicleVisual(vehicle: VehicleEntity): VehicleVisual {
    const profile = VEHICLE_3D_PROFILES[vehicle.vehicleClass];
    const group = new THREE.Group();
    const isPolice = vehicle.role === "police";
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: isPolice ? 0xe9efe8 : vehicle.color,
      roughness: 0.58,
      metalness: 0.38,
    });
    const bodyGeometry = new THREE.BoxGeometry(
      profile.width,
      profile.height,
      profile.length,
    );
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const cabinLength =
      vehicle.vehicleClass === "van"
        ? profile.length * 0.58
        : profile.length * 0.42;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(
        profile.width * 0.82,
        profile.height * 0.62,
        cabinLength,
      ),
      new THREE.MeshStandardMaterial({
        color: isPolice ? 0x202825 : 0x283330,
        roughness: 0.35,
        metalness: 0.55,
      }),
    );
    cabin.position.set(
      0,
      profile.height * 0.68,
      vehicle.vehicleClass === "van" ? -0.1 : -profile.length * 0.08,
    );
    cabin.castShadow = true;
    group.add(cabin);

    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x111412,
      roughness: 0.9,
    });
    const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.28, 12);
    for (const x of [-profile.width / 2 - 0.08, profile.width / 2 + 0.08]) {
      for (const z of [-profile.length * 0.3, profile.length * 0.3]) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, -profile.height * 0.27, z);
        wheel.castShadow = true;
        group.add(wheel);
      }
    }

    const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffe3a2 });
    for (const x of [-profile.width * 0.3, profile.width * 0.3]) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.2, 0.08),
        headlightMaterial,
      );
      light.position.set(x, 0, -profile.length / 2 - 0.045);
      group.add(light);
    }

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(
          profile.width + 0.12,
          profile.height + 0.12,
          profile.length + 0.12,
        ),
      ),
      new THREE.LineBasicMaterial({
        color: 0xfff5d5,
        transparent: true,
        opacity: 0.9,
      }),
    );
    outline.visible = vehicle.role === "player";
    group.add(outline);

    let siren: THREE.Group | null = null;
    if (isPolice) {
      siren = new THREE.Group();
      const red = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.14, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xff4138 }),
      );
      const blue = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.14, 0.22),
        new THREE.MeshBasicMaterial({ color: 0x418dff }),
      );
      red.position.x = -0.24;
      blue.position.x = 0.24;
      siren.position.y = profile.height * 1.18;
      siren.add(red, blue);
      group.add(siren);
    }

    this.scene.add(group);
    return { group, outline, siren };
  }

  private createFootVisual(): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 0.8, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0xcfff4e,
        roughness: 0.62,
      }),
    );
    body.castShadow = true;
    group.add(body);
    const pointer = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: 0x1b241e }),
    );
    pointer.rotation.x = Math.PI / 2;
    pointer.position.set(0, 0.1, -0.55);
    group.add(pointer);
    return group;
  }

  private createPropVisual(prop: PropEntity): THREE.Object3D {
    if (prop.spec.kind === "crate") {
      return new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 1.3, 1.3),
        new THREE.MeshStandardMaterial({ color: 0x9a6942, roughness: 0.9 }),
      );
    }
    if (prop.spec.kind === "cone") {
      return new THREE.Mesh(
        new THREE.ConeGeometry(0.34, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0xf17035, roughness: 0.8 }),
      );
    }
    return new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.38, 1.1, 10),
      new THREE.MeshStandardMaterial({ color: 0xd94335, roughness: 0.7 }),
    );
  }

  private createMissionMarker(
    color: number,
    kind: "package" | "delivery" | "starter",
  ): THREE.Group {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(kind === "starter" ? 2.2 : 2.8, 0.16, 8, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);

    if (kind === "package") {
      const packageMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.1, 1.1),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.55,
        }),
      );
      packageMesh.position.y = 1.25;
      packageMesh.rotation.y = Math.PI / 4;
      packageMesh.castShadow = true;
      group.add(packageMesh);
    } else {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(
          kind === "starter" ? 1.8 : 2.4,
          kind === "starter" ? 2.3 : 3,
          kind === "starter" ? 3 : 5,
          24,
          1,
          true,
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: kind === "starter" ? 0.1 : 0.14,
          side: THREE.DoubleSide,
        }),
      );
      beam.position.y = kind === "starter" ? 1.5 : 2.5;
      group.add(beam);
    }
    return group;
  }

  private syncVehicles(dt: number, timeMilliseconds: number): void {
    const liveIds = new Set<string>();
    for (const vehicle of this.simulation.vehicles) {
      liveIds.add(vehicle.id);
      let visual = this.vehicleVisuals.get(vehicle.id);
      if (!visual) {
        visual = this.createVehicleVisual(vehicle);
        this.vehicleVisuals.set(vehicle.id, visual);
      }
      const position = vehicle.body.translation();
      const rotation = vehicle.body.rotation();
      const smoothing = 1 - Math.exp(-dt * 22);
      visual.group.position.lerp(
        new THREE.Vector3(position.x, position.y, position.z),
        smoothing,
      );
      visual.group.quaternion.slerp(
        new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
        smoothing,
      );
      visual.outline.visible = vehicle.role === "player";
      if (visual.siren) {
        const blink = Math.sin(timeMilliseconds * 0.025) > 0;
        visual.siren.children[0].visible = blink;
        visual.siren.children[1].visible = !blink;
      }
    }

    for (const [id, visual] of this.vehicleVisuals) {
      if (liveIds.has(id)) continue;
      this.scene.remove(visual.group);
      visual.group.traverse(disposeObject);
      this.vehicleVisuals.delete(id);
    }
  }

  private syncProps(dt: number): void {
    const smoothing = 1 - Math.exp(-dt * 26);
    for (const prop of this.simulation.props) {
      const visual = this.propVisuals.get(prop.spec.id);
      if (!visual) continue;
      const position = prop.body.translation();
      const rotation = prop.body.rotation();
      visual.position.lerp(
        new THREE.Vector3(position.x, position.y, position.z),
        smoothing,
      );
      visual.quaternion.slerp(
        new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
        smoothing,
      );
    }
  }

  private syncFoot(dt: number): void {
    const state = this.simulation.mission.state;
    this.footVisual.visible = state.mode === "foot";
    if (!this.footVisual.visible) return;
    const position = this.simulation.footBody.translation();
    this.footVisual.position.lerp(
      new THREE.Vector3(position.x, position.y, position.z),
      1 - Math.exp(-dt * 24),
    );
  }

  private syncMissionMarkers(timeMilliseconds: number): void {
    const phase = this.simulation.mission.state.phase;
    this.packageMarker.visible = phase === "pickup";
    this.deliveryMarker.visible = phase === "deliver";
    this.starterMarker.visible = phase === "findCar";
    const starter = this.simulation.vehicles.find(
      (vehicle) => vehicle.id === "starter",
    );
    if (starter) {
      const position = starter.body.translation();
      this.starterMarker.position.set(position.x, 0.05, position.z);
    }
    const pulse = 1 + Math.sin(timeMilliseconds * 0.005) * 0.12;
    this.packageMarker.scale.setScalar(pulse);
    this.deliveryMarker.scale.setScalar(pulse);
    this.starterMarker.scale.setScalar(pulse);
    this.packageMarker.rotation.y = timeMilliseconds * 0.001;
    this.deliveryMarker.rotation.y = -timeMilliseconds * 0.0008;
  }

  private updateCamera(dt: number): void {
    const target = this.simulation.playerPosition();
    const active = this.simulation.activeVehicle();
    let desired: THREE.Vector3;
    if (active) {
      const rotation = active.body.rotation();
      const quaternion = new THREE.Quaternion(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      );
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
      desired = new THREE.Vector3(
        target.x - forward.x * 10,
        target.y + 6.2,
        target.z - forward.z * 10,
      );
    } else {
      desired = new THREE.Vector3(target.x + 8, target.y + 7.5, target.z + 9);
    }
    const smoothing = 1 - Math.exp(-dt * 5.5);
    this.camera.position.lerp(desired, smoothing);
    const lookTarget = new THREE.Vector3(target.x, target.y + 0.55, target.z);
    const currentDirection = new THREE.Vector3();
    this.camera.getWorldDirection(currentDirection);
    const currentLook = this.camera.position.clone().add(currentDirection);
    currentLook.lerp(lookTarget, 1 - Math.exp(-dt * 7));
    this.camera.lookAt(currentLook);
  }
}

function disposeObject(object: THREE.Object3D): void {
  if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.dispose();
  }
}
