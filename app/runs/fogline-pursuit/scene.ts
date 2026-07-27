import * as THREE from "three";
import {
  CITY_BLOCKS,
  currentObjective,
  OBJECTIVES,
  ROAD_CENTERS,
  WORLD_HALF,
  type CopState,
  type FoglineState,
} from "./simulation";

const BUILDING_COLORS = [0x172026, 0x24242a, 0x1e2628, 0x292b2d];
const WINDOW_COLORS = [0xffc878, 0x89d5da, 0xf4a261];

export class FoglineScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
  private readonly playerCar: THREE.Group;
  private readonly objectiveMarker: THREE.Group;
  private readonly cops = new Map<number, THREE.Group>();
  private readonly traffic: Array<{
    car: THREE.Group;
    axis: "x" | "z";
    lane: number;
    offset: number;
    direction: 1 | -1;
    speed: number;
  }> = [];
  private objectiveIndex = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0x07131b);
    this.scene.fog = new THREE.FogExp2(0x0d2028, 0.012);

    const sky = new THREE.HemisphereLight(0x8ac6d1, 0x16100e, 2.8);
    this.scene.add(sky);

    const sunset = new THREE.DirectionalLight(0xffc285, 3.8);
    sunset.position.set(-80, 110, 60);
    sunset.castShadow = true;
    sunset.shadow.mapSize.set(2048, 2048);
    sunset.shadow.camera.left = -110;
    sunset.shadow.camera.right = 110;
    sunset.shadow.camera.top = 110;
    sunset.shadow.camera.bottom = -110;
    this.scene.add(sunset);

    this.createCity();
    this.playerCar = createCar(0xef4f3c, false);
    this.playerCar.traverse((object) => {
      object.castShadow = true;
    });
    const chaseFill = new THREE.PointLight(0xb9dcff, 75, 38, 1.7);
    chaseFill.position.set(0, 5, -3);
    this.playerCar.add(chaseFill);
    this.scene.add(this.playerCar);

    this.objectiveMarker = createObjectiveMarker();
    this.scene.add(this.objectiveMarker);
    this.createTraffic();

    this.camera.position.set(-72, 8, 95);
  }

  resize(width: number, height: number) {
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);
    this.renderer.setSize(safeWidth, safeHeight, false);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
  }

  render(state: FoglineState, elapsedSeconds: number) {
    this.playerCar.position.set(state.player.x, 0.72, state.player.z);
    this.playerCar.rotation.y = state.player.heading;
    const bodyRoll =
      Math.sin(state.player.heading * 3 + elapsedSeconds * 2) *
      Math.min(Math.abs(state.player.speed) / 400, 0.025);
    this.playerCar.rotation.z = bodyRoll;

    this.syncCops(state.cops, elapsedSeconds);
    this.syncObjective(state, elapsedSeconds);
    this.updateTraffic(elapsedSeconds);
    this.updateCamera(state);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    this.renderer.dispose();
  }

  private createCity() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_HALF * 2 + 30, WORLD_HALF * 2 + 30),
      new THREE.MeshStandardMaterial({
        color: 0x0b1112,
        roughness: 0.82,
        metalness: 0.18,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x151b1d,
      roughness: 0.42,
      metalness: 0.32,
    });
    for (const center of ROAD_CENTERS) {
      const vertical = new THREE.Mesh(
        new THREE.PlaneGeometry(22, WORLD_HALF * 2 + 16),
        roadMaterial,
      );
      vertical.rotation.x = -Math.PI / 2;
      vertical.position.set(center, 0.025, 0);
      vertical.receiveShadow = true;
      this.scene.add(vertical);

      const horizontal = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD_HALF * 2 + 16, 22),
        roadMaterial,
      );
      horizontal.rotation.x = -Math.PI / 2;
      horizontal.position.set(0, 0.03, center);
      horizontal.receiveShadow = true;
      this.scene.add(horizontal);
    }

    this.createRoadMarkings();
    this.createCableTracks();

    for (const block of CITY_BLOCKS) {
      const width = block.maxX - block.minX;
      const depth = block.maxZ - block.minZ;
      const x = (block.minX + block.maxX) / 2;
      const z = (block.minZ + block.maxZ) / 2;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, block.height, depth),
        new THREE.MeshStandardMaterial({
          color: BUILDING_COLORS[block.tone],
          roughness: 0.62,
          metalness: 0.2,
        }),
      );
      building.position.set(x, block.height / 2, z);
      building.castShadow = true;
      building.receiveShadow = true;
      this.scene.add(building);
      this.addWindows(building, width, depth, block.height, block.tone);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.28, 1.2, depth * 0.25),
        new THREE.MeshStandardMaterial({ color: 0x11191c, roughness: 0.8 }),
      );
      roof.position.set(x, block.height + 0.6, z);
      roof.castShadow = true;
      this.scene.add(roof);
    }

    this.createTransamerica();
    this.createBayBridge();
    this.createStreetLights();
  }

  private createRoadMarkings() {
    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xbfae83 });
    const curbMaterial = new THREE.MeshBasicMaterial({ color: 0x617278 });
    for (const center of ROAD_CENTERS) {
      for (let offset = -88; offset <= 88; offset += 10) {
        const verticalDash = new THREE.Mesh(
          new THREE.PlaneGeometry(0.22, 4),
          dashMaterial,
        );
        verticalDash.rotation.x = -Math.PI / 2;
        verticalDash.position.set(center, 0.055, offset);
        this.scene.add(verticalDash);

        const horizontalDash = new THREE.Mesh(
          new THREE.PlaneGeometry(4, 0.22),
          dashMaterial,
        );
        horizontalDash.rotation.x = -Math.PI / 2;
        horizontalDash.position.set(offset, 0.058, center);
        this.scene.add(horizontalDash);
      }

      for (const side of [-10.4, 10.4]) {
        const verticalCurb = new THREE.Mesh(
          new THREE.PlaneGeometry(0.15, WORLD_HALF * 2),
          curbMaterial,
        );
        verticalCurb.rotation.x = -Math.PI / 2;
        verticalCurb.position.set(center + side, 0.05, 0);
        this.scene.add(verticalCurb);

        const horizontalCurb = new THREE.Mesh(
          new THREE.PlaneGeometry(WORLD_HALF * 2, 0.15),
          curbMaterial,
        );
        horizontalCurb.rotation.x = -Math.PI / 2;
        horizontalCurb.position.set(0, 0.052, center + side);
        this.scene.add(horizontalCurb);
      }
    }
  }

  private createCableTracks() {
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a8d87,
      roughness: 0.3,
      metalness: 0.9,
    });
    for (const offset of [-1.05, 1.05]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.06, WORLD_HALF * 2),
        railMaterial,
      );
      rail.position.set(-24 + offset, 0.08, 0);
      this.scene.add(rail);
    }
  }

  private addWindows(
    building: THREE.Mesh,
    width: number,
    depth: number,
    height: number,
    seed: number,
  ) {
    const group = new THREE.Group();
    const rows = Math.max(2, Math.floor(height / 6));
    const frontColumns = Math.max(2, Math.floor(width / 5));
    const sideColumns = Math.max(2, Math.floor(depth / 5));

    for (let row = 0; row < rows; row += 1) {
      const y = -height / 2 + 3 + row * 5;
      for (let column = 0; column < frontColumns; column += 1) {
        if ((row * 3 + column + seed) % 4 === 0) continue;
        const x = -width / 2 + 2.5 + column * 5;
        for (const side of [-1, 1]) {
          const window = createWindow(seed + row + column);
          window.position.set(x, y, side * (depth / 2 + 0.012));
          if (side < 0) window.rotation.y = Math.PI;
          group.add(window);
        }
      }
      for (let column = 0; column < sideColumns; column += 1) {
        if ((row + column * 2 + seed) % 5 === 0) continue;
        const z = -depth / 2 + 2.5 + column * 5;
        for (const side of [-1, 1]) {
          const window = createWindow(seed + row + column + 2);
          window.position.set(side * (width / 2 + 0.012), y, z);
          window.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          group.add(window);
        }
      }
    }
    building.add(group);
  }

  private createTransamerica() {
    const tower = new THREE.Mesh(
      new THREE.ConeGeometry(7, 46, 4),
      new THREE.MeshStandardMaterial({
        color: 0xa8b2ad,
        roughness: 0.7,
        metalness: 0.08,
      }),
    );
    tower.position.set(2, 23, -2);
    tower.rotation.y = Math.PI / 4;
    tower.castShadow = true;
    this.scene.add(tower);
  }

  private createBayBridge() {
    const bridge = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({
      color: 0x667477,
      roughness: 0.55,
      metalness: 0.65,
    });
    for (const x of [-45, 45]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 32, 3), steel);
      tower.position.set(x, 16, -116);
      bridge.add(tower);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(120, 1.4, 5), steel);
    deck.position.set(0, 8, -116);
    bridge.add(deck);
    for (let x = -42; x <= 42; x += 7) {
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 18, 6),
        steel,
      );
      cable.position.set(x, 17, -116);
      bridge.add(cable);
    }
    this.scene.add(bridge);
  }

  private createStreetLights() {
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0x20282a,
      roughness: 0.5,
      metalness: 0.8,
    });
    const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffd18b });
    for (const x of ROAD_CENTERS) {
      for (let z = -72; z <= 72; z += 24) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.14, 5, 7),
          poleMaterial,
        );
        pole.position.set(x + 9.1, 2.5, z + 9.1);
        this.scene.add(pole);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 8, 8),
          bulbMaterial,
        );
        bulb.position.set(x + 9.1, 5, z + 9.1);
        this.scene.add(bulb);
      }
    }
  }

  private createTraffic() {
    const colors = [0xd9c8a9, 0x6f91a6, 0xe6a94e, 0x7d7b88, 0x3d806f];
    for (let index = 0; index < 10; index += 1) {
      const axis = index % 2 === 0 ? "z" : "x";
      const lane = ROAD_CENTERS[index % ROAD_CENTERS.length] + 4.2;
      const direction = index % 3 === 0 ? -1 : 1;
      const car = createCar(colors[index % colors.length], false, 0.82);
      this.scene.add(car);
      this.traffic.push({
        car,
        axis,
        lane,
        offset: index * 31,
        direction,
        speed: 7 + (index % 4) * 1.4,
      });
    }
  }

  private updateTraffic(elapsedSeconds: number) {
    for (const traffic of this.traffic) {
      const travel =
        ((elapsedSeconds * traffic.speed + traffic.offset) %
          (WORLD_HALF * 2 + 24)) -
        WORLD_HALF -
        12;
      if (traffic.axis === "z") {
        traffic.car.position.set(
          traffic.lane,
          0.58,
          travel * traffic.direction,
        );
        traffic.car.rotation.y = traffic.direction > 0 ? 0 : Math.PI;
      } else {
        traffic.car.position.set(
          travel * traffic.direction,
          0.58,
          traffic.lane,
        );
        traffic.car.rotation.y =
          traffic.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }

  private syncCops(cops: CopState[], elapsedSeconds: number) {
    const activeIds = new Set(cops.map((cop) => cop.id));
    for (const [id, group] of this.cops) {
      if (activeIds.has(id)) continue;
      this.scene.remove(group);
      this.cops.delete(id);
    }

    for (const cop of cops) {
      let group = this.cops.get(cop.id);
      if (!group) {
        group = createCar(0x111417, true);
        this.cops.set(cop.id, group);
        this.scene.add(group);
      }
      group.position.set(cop.x, 0.72, cop.z);
      group.rotation.y = cop.heading;
      const lightbar = group.getObjectByName("lightbar");
      if (lightbar) {
        lightbar.children[0].visible =
          Math.floor(elapsedSeconds * 9 + cop.id) % 2 === 0;
        lightbar.children[1].visible = !lightbar.children[0].visible;
      }
    }
  }

  private syncObjective(state: FoglineState, elapsedSeconds: number) {
    const objective = currentObjective(state);
    if (this.objectiveIndex !== state.objectiveIndex) {
      this.objectiveIndex = state.objectiveIndex;
      this.objectiveMarker.position.set(
        objective.point.x,
        0.25,
        objective.point.z,
      );
    }
    this.objectiveMarker.visible =
      state.phase !== "won" && state.phase !== "busted";
    this.objectiveMarker.rotation.y = elapsedSeconds * 0.9;
    const ring = this.objectiveMarker.getObjectByName("objective-ring");
    if (ring) {
      ring.position.y = 1.7 + Math.sin(elapsedSeconds * 2.4) * 0.3;
      ring.rotation.z = Math.sin(elapsedSeconds) * 0.16;
    }
    const beam = this.objectiveMarker.getObjectByName("objective-beam");
    if (beam instanceof THREE.Mesh) {
      const material = beam.material as THREE.MeshBasicMaterial;
      material.opacity = 0.13 + Math.sin(elapsedSeconds * 3) * 0.035;
    }
  }

  private updateCamera(state: FoglineState) {
    const forward = new THREE.Vector3(
      Math.sin(state.player.heading),
      0,
      Math.cos(state.player.heading),
    );
    const speedLift = Math.min(Math.abs(state.player.speed) / 18, 1.8);
    const desired = new THREE.Vector3(
      state.player.x,
      7.2 + speedLift,
      state.player.z,
    ).addScaledVector(forward, -13 - speedLift * 1.5);
    this.camera.position.lerp(desired, 0.1);
    const lookTarget = new THREE.Vector3(
      state.player.x,
      1.3,
      state.player.z,
    ).addScaledVector(forward, 5.5);
    this.camera.lookAt(lookTarget);
  }
}

function createCar(color: number, police: boolean, scale = 1) {
  const car = new THREE.Group();
  car.scale.setScalar(scale);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.32,
    metalness: 0.72,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x071015,
    roughness: 0.22,
    metalness: 0.45,
  });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.75, 7.2),
    bodyMaterial,
  );
  body.position.y = 0.72;
  body.castShadow = true;
  car.add(body);

  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(3.35, 0.38, 2.1),
    bodyMaterial,
  );
  hood.position.set(0, 1.15, 2.35);
  hood.castShadow = true;
  car.add(hood);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 1.1, 3),
    darkMaterial,
  );
  cabin.position.set(0, 1.55, -0.15);
  cabin.castShadow = true;
  car.add(cabin);

  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x080808,
    roughness: 0.9,
  });
  for (const x of [-1.8, 1.8]) {
    for (const z of [-2.35, 2.35]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.58, 0.58, 0.42, 12),
        wheelMaterial,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.45, z);
      wheel.castShadow = true;
      car.add(wheel);
    }
  }

  const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfaf0cf });
  const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xff2c3d });
  for (const x of [-1.1, 1.1]) {
    const headlight = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.25, 0.08),
      headlightMaterial,
    );
    headlight.position.set(x, 0.88, 3.63);
    car.add(headlight);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.22, 0.08),
      tailMaterial,
    );
    tail.position.set(x, 0.88, -3.63);
    car.add(tail);
  }

  if (police) {
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(3.62, 0.48, 2.1),
      new THREE.MeshStandardMaterial({
        color: 0xe5e7df,
        roughness: 0.5,
        metalness: 0.2,
      }),
    );
    doorPanel.position.set(0, 0.78, -0.1);
    car.add(doorPanel);

    const lightbar = new THREE.Group();
    lightbar.name = "lightbar";
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.22, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xff2638 }),
    );
    red.position.x = -0.45;
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.22, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x3388ff }),
    );
    blue.position.x = 0.45;
    lightbar.add(red, blue);
    lightbar.position.set(0, 2.2, -0.15);
    car.add(lightbar);
  }

  return car;
}

function createWindow(seed: number) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.45),
    new THREE.MeshBasicMaterial({
      color: WINDOW_COLORS[seed % WINDOW_COLORS.length],
      transparent: true,
      opacity: 0.5 + (seed % 3) * 0.12,
    }),
  );
}

function createObjectiveMarker() {
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.2, 0.28, 10, 48),
    new THREE.MeshBasicMaterial({ color: 0x9ee8c4 }),
  );
  ring.name = "objective-ring";
  ring.rotation.x = Math.PI / 2;
  marker.add(ring);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 4.6, 30, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9ee8c4,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  beam.name = "objective-beam";
  beam.position.y = 15;
  marker.add(beam);

  const light = new THREE.PointLight(0x7fffd0, 18, 28, 2);
  light.position.y = 3;
  marker.add(light);
  return marker;
}

export function objectiveProgressLabel(state: FoglineState) {
  if (state.phase === "won") return `${OBJECTIVES.length}/${OBJECTIVES.length}`;
  return `${state.objectiveIndex + 1}/${OBJECTIVES.length}`;
}
