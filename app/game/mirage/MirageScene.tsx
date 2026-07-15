"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera as OrthographicCameraComponent } from "@react-three/drei";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import {
  Color,
  Group,
  InstancedMesh,
  MathUtils,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Vector3,
} from "three";

import { CITY_BLOCKS, CITY_BUILDINGS, ROAD_LINES, TREE_POSITIONS } from "./map";
import {
  BOOST_PADS,
  MISSION_TARGETS,
  RAMP_POSITION,
  ROUTE_LENGTH,
  advanceMirageRun,
  getCurrentTarget,
  getRoutePose,
  getTrafficCount,
  getTrafficPose,
} from "./simulation";
import type { MirageInput, MirageRunState } from "./types";

interface MirageSceneProps {
  readonly inputRef: MutableRefObject<MirageInput>;
  readonly onReady: () => void;
  readonly onRenderStats: (drawCalls: number, triangles: number) => void;
  readonly onSnapshot: (state: MirageRunState) => void;
  readonly running: boolean;
  readonly stateRef: MutableRefObject<MirageRunState>;
}

interface BoxInstance {
  readonly color: string;
  readonly position: readonly [number, number, number];
  readonly rotationY?: number;
  readonly scale: readonly [number, number, number];
}

const TRAFFIC_COLORS = ["#f0c44f", "#4f9e9c", "#e87561", "#d7e3dc"];

function BoxInstances({
  castShadow = false,
  emissive,
  emissiveIntensity = 0,
  items,
  metalness = 0.02,
  receiveShadow = false,
  roughness = 0.82,
}: {
  readonly castShadow?: boolean;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly items: readonly BoxInstance[];
  readonly metalness?: number;
  readonly receiveShadow?: boolean;
  readonly roughness?: number;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const helper = new Object3D();
    const color = new Color();
    items.forEach((item, index) => {
      helper.position.set(...item.position);
      helper.rotation.set(0, item.rotationY ?? 0, 0);
      helper.scale.set(...item.scale);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
      mesh.setColorAt(index, color.set(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry />
      <meshStandardMaterial
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        metalness={metalness}
        roughness={roughness}
      />
    </instancedMesh>
  );
}

function RouteGuides() {
  const items = useMemo<readonly BoxInstance[]>(() => {
    const guides: BoxInstance[] = [];
    for (
      let routeDistance = 5;
      routeDistance < ROUTE_LENGTH;
      routeDistance += 9
    ) {
      const pose = getRoutePose(routeDistance);
      guides.push({
        color: "#d8ff55",
        position: [pose.x, 0.15, pose.z],
        rotationY: pose.yaw,
        scale: [0.22, 0.05, 3.4],
      });
    }
    return guides;
  }, []);

  return (
    <BoxInstances
      emissive="#8fca2c"
      emissiveIntensity={1.6}
      items={items}
      roughness={0.4}
    />
  );
}

function CityGround() {
  const sidewalkItems = useMemo<readonly BoxInstance[]>(
    () =>
      CITY_BLOCKS.map((block) => ({
        color:
          block.district === "waterfront"
            ? "#b9b49f"
            : block.district === "victorian"
              ? "#c8c5ad"
              : "#b8bab1",
        position: [block.x, 0.12, block.z],
        scale: [22, 0.45, 22],
      })),
    [],
  );
  const roadItems = useMemo<readonly BoxInstance[]>(
    () => [
      ...ROAD_LINES.map((line) => ({
        color: "#26363a",
        position: [line, -0.02, 0] as const,
        scale: [14, 0.22, 238] as const,
      })),
      ...ROAD_LINES.map((line) => ({
        color: "#26363a",
        position: [0, -0.01, line] as const,
        scale: [238, 0.22, 14] as const,
      })),
    ],
    [],
  );
  const laneItems = useMemo<readonly BoxInstance[]>(() => {
    const items: BoxInstance[] = [];
    for (const line of ROAD_LINES) {
      for (let offset = -102; offset <= 102; offset += 12) {
        items.push({
          color: "#e8c65e",
          position: [line, 0.115, offset],
          scale: [0.16, 0.035, 4.8],
        });
        items.push({
          color: "#e8c65e",
          position: [offset, 0.12, line],
          scale: [4.8, 0.035, 0.16],
        });
      }
    }
    for (const target of MISSION_TARGETS.filter(
      (candidate) => candidate.type !== "finish",
    )) {
      for (let stripe = -4; stripe <= 4; stripe += 2) {
        items.push({
          color: "#f3efe0",
          position: [target.x + stripe, 0.13, target.z],
          scale: [0.9, 0.04, 5.2],
        });
      }
    }
    return items;
  }, []);

  return (
    <group>
      <mesh receiveShadow position={[0, -0.55, 0]}>
        <boxGeometry args={[310, 1, 270]} />
        <meshStandardMaterial color="#80947a" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[146, -0.16, 0]}>
        <boxGeometry args={[58, 0.42, 270]} />
        <meshStandardMaterial
          color="#3f8998"
          metalness={0.08}
          roughness={0.32}
        />
      </mesh>
      <BoxInstances items={roadItems} receiveShadow roughness={0.94} />
      <BoxInstances items={sidewalkItems} receiveShadow roughness={0.96} />
      <BoxInstances items={laneItems} roughness={0.7} />
    </group>
  );
}

function CityBuildings() {
  const bodyItems = useMemo<readonly BoxInstance[]>(
    () =>
      CITY_BUILDINGS.map((building) => ({
        color: building.color,
        position: [building.x, building.height / 2 + 0.38, building.z],
        scale: [building.width, building.height, building.depth],
      })),
    [],
  );
  const roofItems = useMemo<readonly BoxInstance[]>(
    () =>
      CITY_BUILDINGS.flatMap((building) => {
        const roof: BoxInstance = {
          color: building.accent,
          position: [building.x, building.height + 0.52, building.z],
          scale: [building.width + 0.45, 0.42, building.depth + 0.45],
        };
        if (building.kind !== "tower") return [roof];
        return [
          roof,
          {
            color: building.accent,
            position: [building.x, building.height + 2.1, building.z],
            scale: [building.width * 0.66, 2.8, building.depth * 0.66],
          },
        ];
      }),
    [],
  );
  const windowItems = useMemo<readonly BoxInstance[]>(() => {
    const items: BoxInstance[] = [];
    for (const building of CITY_BUILDINGS) {
      const bands = building.height > 18 ? 4 : building.height > 10 ? 2 : 1;
      for (let index = 0; index < bands; index += 1) {
        const y = 2.8 + ((building.height - 4) * (index + 1)) / (bands + 1);
        const color = index % 2 === 0 ? "#173f49" : "#f1dc9c";
        items.push({
          color,
          position: [building.x, y, building.z + building.depth / 2 + 0.04],
          scale: [building.width * 0.7, 0.65, 0.11],
        });
        items.push({
          color,
          position: [building.x + building.width / 2 + 0.04, y, building.z],
          scale: [0.11, 0.65, building.depth * 0.7],
        });
      }
    }
    return items;
  }, []);
  const awnings = useMemo<readonly BoxInstance[]>(
    () =>
      CITY_BUILDINGS.filter(
        (building) => building.kind === "shop" || building.kind === "row-house",
      ).map((building) => ({
        color: building.accent,
        position: [building.x, 2.15, building.z + building.depth / 2 + 0.48],
        scale: [building.width * 0.72, 0.2, 0.95],
      })),
    [],
  );
  return (
    <group>
      <BoxInstances castShadow items={bodyItems} receiveShadow />
      <BoxInstances castShadow items={roofItems} metalness={0.12} />
      <BoxInstances items={windowItems} metalness={0.22} roughness={0.3} />
      <BoxInstances castShadow items={awnings} roughness={0.62} />
    </group>
  );
}

function StreetTrees() {
  const trunks = useMemo<readonly BoxInstance[]>(
    () =>
      TREE_POSITIONS.map((tree) => ({
        color: "#6c4d38",
        position: [tree.x, 1.15, tree.z],
        scale: [0.42, 2.3, 0.42],
      })),
    [],
  );
  const crowns = useMemo<readonly BoxInstance[]>(
    () =>
      TREE_POSITIONS.map((tree, index) => ({
        color: index % 2 === 0 ? "#3f7256" : "#5a855c",
        position: [tree.x, 3.1 + (index % 3) * 0.18, tree.z],
        scale: [2.9, 3.6, 2.9],
      })),
    [],
  );
  return (
    <group>
      <BoxInstances castShadow items={trunks} />
      <BoxInstances castShadow items={crowns} roughness={0.96} />
    </group>
  );
}

function CityLandmarks() {
  return (
    <group>
      <group position={[-90, 0.4, -54]}>
        {[-7, 0, 7].map((x, index) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh castShadow position={[0, 5.4, 0]}>
              <boxGeometry args={[6.2, 10, 13]} />
              <meshStandardMaterial
                color={["#e76b75", "#54a39f", "#eebd55"][index]}
                roughness={0.84}
              />
            </mesh>
            <mesh
              castShadow
              position={[0, 11.2, 0]}
              rotation={[0, Math.PI / 4, 0]}
            >
              <coneGeometry args={[5.2, 3.2, 4]} />
              <meshStandardMaterial color="#3e4a4e" roughness={0.9} />
            </mesh>
          </group>
        ))}
      </group>

      <group position={[-36, 0.4, -67]}>
        {[-4.8, 4.8].map((x) => (
          <mesh key={x} castShadow position={[x, 4, 0]}>
            <boxGeometry args={[1.1, 8, 1.1]} />
            <meshStandardMaterial color="#a83335" roughness={0.72} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 7.4, 0]}>
          <boxGeometry args={[11, 1.15, 1.8]} />
          <meshStandardMaterial color="#bd3c3f" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0, 8.5, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[8, 0.35, 2.1]} />
          <meshStandardMaterial color="#e9c15f" roughness={0.64} />
        </mesh>
      </group>

      <mesh castShadow position={[18, 15, -18]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[8, 30, 4]} />
        <meshStandardMaterial color="#d6d4c2" roughness={0.72} />
      </mesh>

      <group position={[-108, 0.45, 0]}>
        <mesh castShadow position={[0, 1.25, 0]}>
          <boxGeometry args={[3.2, 2.5, 6.6]} />
          <meshStandardMaterial color="#a83e37" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0, 2.8, 0]}>
          <boxGeometry args={[3.35, 0.28, 6.9]} />
          <meshStandardMaterial color="#f3d16e" roughness={0.58} />
        </mesh>
      </group>

      <group position={[137, 0, -88]}>
        {[-16, 16].map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh castShadow position={[0, 11, 0]}>
              <boxGeometry args={[2.2, 22, 2.2]} />
              <meshStandardMaterial color="#dd5b4d" roughness={0.68} />
            </mesh>
            <mesh castShadow position={[0, 20, 0]}>
              <boxGeometry args={[2.5, 1.5, 9]} />
              <meshStandardMaterial color="#dd5b4d" roughness={0.68} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 8, 0]}>
          <boxGeometry args={[1.15, 0.8, 42]} />
          <meshStandardMaterial
            color="#374c50"
            metalness={0.28}
            roughness={0.55}
          />
        </mesh>
      </group>

      <group position={[113, 0, 36]}>
        <mesh castShadow position={[4, 4.5, -8]}>
          <boxGeometry args={[1.2, 9, 1.2]} />
          <meshStandardMaterial color="#e5c759" roughness={0.6} />
        </mesh>
        <mesh castShadow position={[4, 4.5, 8]}>
          <boxGeometry args={[1.2, 9, 1.2]} />
          <meshStandardMaterial color="#e5c759" roughness={0.6} />
        </mesh>
        <mesh castShadow position={[4, 8.4, 0]}>
          <boxGeometry args={[1.2, 1.2, 17.2]} />
          <meshStandardMaterial color="#e5c759" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function BoostPadsAndRamp() {
  const pads = useMemo<readonly BoxInstance[]>(
    () =>
      BOOST_PADS.flatMap((pad) =>
        [-2.1, 0, 2.1].map((offset) => ({
          color: "#cfff4f",
          position: [
            pad.x + Math.cos(pad.yaw) * offset,
            0.18,
            pad.z + Math.sin(pad.yaw) * offset,
          ] as const,
          rotationY: pad.yaw,
          scale: [1.15, 0.08, 5.6] as const,
        })),
      ),
    [],
  );
  return (
    <group>
      <BoxInstances
        emissive="#8bcc2d"
        emissiveIntensity={1.8}
        items={pads}
        roughness={0.4}
      />
      <group
        position={[RAMP_POSITION.x, 0.65, RAMP_POSITION.z]}
        rotation={[0.2, 0, 0]}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[7.6, 0.8, 7]} />
          <meshStandardMaterial color="#df664e" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.43, 0]}>
          <boxGeometry args={[5.2, 0.06, 5.6]} />
          <meshStandardMaterial color="#f3d66b" roughness={0.55} />
        </mesh>
      </group>
    </group>
  );
}

function CarModel({
  color,
  police = false,
}: {
  color: string;
  police?: boolean;
}) {
  return (
    <group>
      <mesh castShadow position={[0, 0.68, 0]}>
        <boxGeometry args={[2.05, 0.72, 4.25]} />
        <meshStandardMaterial color={color} metalness={0.22} roughness={0.46} />
      </mesh>
      <mesh castShadow position={[0, 1.28, 0.25]}>
        <boxGeometry args={[1.7, 0.72, 2.05]} />
        <meshStandardMaterial
          color="#18343b"
          metalness={0.3}
          roughness={0.22}
        />
      </mesh>
      <mesh position={[0, 0.72, -2.14]}>
        <boxGeometry args={[1.45, 0.18, 0.08]} />
        <meshStandardMaterial
          color="#fff3bb"
          emissive="#ffe49a"
          emissiveIntensity={1.5}
        />
      </mesh>
      <mesh position={[0, 0.72, 2.14]}>
        <boxGeometry args={[1.45, 0.16, 0.08]} />
        <meshStandardMaterial
          color="#fa5260"
          emissive="#d42338"
          emissiveIntensity={1.2}
        />
      </mesh>
      {[
        [-1.02, -1.35],
        [1.02, -1.35],
        [-1.02, 1.35],
        [1.02, 1.35],
      ].map(([x, z]) => (
        <mesh
          key={`${x}-${z}`}
          castShadow
          position={[x, 0.42, z]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.42, 0.42, 0.28, 12]} />
          <meshStandardMaterial color="#10171a" roughness={0.88} />
        </mesh>
      ))}
      {police ? (
        <group position={[0, 1.78, 0.1]}>
          <mesh position={[-0.38, 0, 0]}>
            <boxGeometry args={[0.68, 0.18, 0.24]} />
            <meshStandardMaterial
              color="#ef3d4e"
              emissive="#ef3d4e"
              emissiveIntensity={2.6}
            />
          </mesh>
          <mesh position={[0.38, 0, 0]}>
            <boxGeometry args={[0.68, 0.18, 0.24]} />
            <meshStandardMaterial
              color="#4c8eff"
              emissive="#4c8eff"
              emissiveIntensity={2.6}
            />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function DynamicVehicles({
  inputRef,
  stateRef,
}: Pick<MirageSceneProps, "inputRef" | "stateRef">) {
  const playerRef = useRef<Group>(null);
  const pursuitRefs = useRef<Array<Group | null>>([]);
  const trafficRefs = useRef<Array<Group | null>>([]);
  const boostFlameRef = useRef<Group>(null);
  useFrame(() => {
    const state = stateRef.current;
    const player = playerRef.current;
    if (player) {
      const jumpProgress =
        state.car.jumpRemaining > 0 ? 1 - state.car.jumpRemaining / 1.05 : 0;
      const jumpHeight =
        state.car.jumpRemaining > 0 ? Math.sin(jumpProgress * Math.PI) * 3 : 0;
      player.position.set(state.car.x, 0.28 + jumpHeight, state.car.z);
      player.rotation.y = state.car.yaw;
    }
    if (boostFlameRef.current) {
      boostFlameRef.current.visible =
        inputRef.current.boost && state.car.boost > 0.02;
      boostFlameRef.current.scale.z = 0.7 + Math.sin(state.elapsed * 24) * 0.2;
    }
    state.pursuers.forEach((pursuer, index) => {
      const group = pursuitRefs.current[index];
      if (!group) return;
      group.visible = state.routeIndex > 0 && state.phase !== "complete";
      group.position.set(pursuer.x, 0.28, pursuer.z);
      group.rotation.y = pursuer.yaw;
      group.scale.setScalar(
        index === Math.floor(state.elapsed * 8) % 2 ? 1.02 : 1,
      );
    });
    for (let index = 0; index < getTrafficCount(); index += 1) {
      const pose = getTrafficPose(index, state.elapsed);
      const group = trafficRefs.current[index];
      if (!group) continue;
      group.position.set(pose.x, 0.28, pose.z);
      group.rotation.y = pose.yaw;
    }
  });
  return (
    <group>
      <group ref={playerRef}>
        <group scale={1.18}>
          <CarModel color="#ff4e3d" />
        </group>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.7, 3.15, 28]} />
          <meshBasicMaterial
            color="#d8ff55"
            depthWrite={false}
            opacity={0.92}
            transparent
          />
        </mesh>
        <group ref={boostFlameRef} position={[0, 0.72, 2.75]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.45, 2.2, 8]} />
            <meshStandardMaterial
              color="#d8ff55"
              emissive="#76d72f"
              emissiveIntensity={2.8}
              transparent
              opacity={0.82}
            />
          </mesh>
        </group>
      </group>
      {[0, 1].map((index) => (
        <group
          key={index}
          ref={(group) => {
            pursuitRefs.current[index] = group;
          }}
        >
          <CarModel color="#e7ece7" police />
        </group>
      ))}
      {Array.from({ length: getTrafficCount() }, (_, index) => (
        <group
          key={index}
          ref={(group) => {
            trafficRefs.current[index] = group;
          }}
          scale={0.92}
        >
          <CarModel color={TRAFFIC_COLORS[index % TRAFFIC_COLORS.length]} />
        </group>
      ))}
    </group>
  );
}

function MissionMarker({ stateRef }: Pick<MirageSceneProps, "stateRef">) {
  const rootRef = useRef<Group>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const state = stateRef.current;
    const root = rootRef.current;
    if (!root) return;
    const target = getCurrentTarget(state);
    root.visible = state.phase !== "complete";
    root.position.set(target.x, 0.28, target.z);
    const pulse = 1 + Math.sin(state.elapsed * 5) * 0.12;
    root.scale.setScalar(pulse);
    root.rotation.y += 0.012;
    if (materialRef.current) {
      materialRef.current.opacity = 0.18 + Math.sin(state.elapsed * 4) * 0.04;
    }
  });
  return (
    <group ref={rootRef}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[5.4, 0.55, 8, 32]} />
        <meshStandardMaterial
          color="#d8ff55"
          emissive="#8fca2c"
          emissiveIntensity={2.4}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[0, 5, 0]}>
        <cylinderGeometry args={[4.5, 4.5, 10, 24, 1, true]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#d8ff55"
          depthWrite={false}
          emissive="#8fca2c"
          emissiveIntensity={0.8}
          opacity={0.2}
          side={2}
          transparent
        />
      </mesh>
      <mesh position={[0, 10.8, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1.7, 3.2, 4]} />
        <meshStandardMaterial
          color="#d8ff55"
          emissive="#8fca2c"
          emissiveIntensity={2}
        />
      </mesh>
    </group>
  );
}

function CameraRig({ stateRef }: Pick<MirageSceneProps, "stateRef">) {
  const size = useThree((root) => root.size);
  const cameraRef = useRef<OrthographicCamera>(null);
  const lookAt = useRef(new Vector3(-72, 0, 104));
  const desired = useRef(new Vector3());
  const lookTarget = useRef(new Vector3());
  useFrame((_, delta) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const car = stateRef.current.car;
    const targetZoom = size.width < 600 ? 8.6 : 13.5;
    desired.current.set(car.x + 8, 100, car.z + 14);
    camera.position.lerp(desired.current, 1 - Math.exp(-delta * 4.5));
    lookTarget.current.set(car.x, 0.6, car.z);
    lookAt.current.lerp(lookTarget.current, 1 - Math.exp(-delta * 6));
    camera.lookAt(lookAt.current);
    const zoom = MathUtils.damp(camera.zoom, targetZoom, 6, delta);
    if (Math.abs(zoom - camera.zoom) > 0.001) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
  });
  return (
    <OrthographicCameraComponent
      ref={cameraRef}
      makeDefault
      far={400}
      near={0.1}
      position={[-64, 100, 118]}
      zoom={13.5}
    />
  );
}

function SimulationDriver({
  inputRef,
  onSnapshot,
  running,
  stateRef,
}: Omit<MirageSceneProps, "onReady" | "onRenderStats">) {
  const publishTimer = useRef(0);
  const previousEvent = useRef(-1);
  useFrame((_, delta) => {
    if (running) {
      stateRef.current = advanceMirageRun(
        stateRef.current,
        inputRef.current,
        Math.min(0.05, delta),
      );
    }
    publishTimer.current += delta;
    const eventChanged = stateRef.current.eventId !== previousEvent.current;
    if (publishTimer.current >= 0.08 || eventChanged) {
      publishTimer.current = 0;
      previousEvent.current = stateRef.current.eventId;
      onSnapshot(stateRef.current);
    }
  });
  return null;
}

function RenderTelemetry({
  onRenderStats,
}: Pick<MirageSceneProps, "onRenderStats">) {
  const gl = useThree((root) => root.gl);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    onRenderStats(gl.info.render.calls, gl.info.render.triangles);
  });
  return null;
}

export const MirageScene = memo(function MirageScene({
  inputRef,
  onReady,
  onRenderStats,
  onSnapshot,
  running,
  stateRef,
}: MirageSceneProps) {
  useEffect(() => onReady(), [onReady]);
  return (
    <>
      <color attach="background" args={["#9bd3df"]} />
      <fog attach="fog" args={["#9bd3df", 110, 275]} />
      <hemisphereLight args={["#dff6f3", "#63745c", 1.6]} />
      <directionalLight
        castShadow
        color="#fff0c8"
        intensity={3.2}
        position={[70, 110, 45]}
        shadow-bias={-0.00018}
        shadow-camera-bottom={-90}
        shadow-camera-far={280}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <CityGround />
      <RouteGuides />
      <CityBuildings />
      <StreetTrees />
      <CityLandmarks />
      <BoostPadsAndRamp />
      <DynamicVehicles inputRef={inputRef} stateRef={stateRef} />
      <MissionMarker stateRef={stateRef} />
      <CameraRig stateRef={stateRef} />
      <SimulationDriver
        inputRef={inputRef}
        onSnapshot={onSnapshot}
        running={running}
        stateRef={stateRef}
      />
      <RenderTelemetry onRenderStats={onRenderStats} />
    </>
  );
});
