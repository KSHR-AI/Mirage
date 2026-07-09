"use client";

import { Float, Line, Sky, Sparkles } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  CapsuleCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import {
  BRIDGE_END,
  CAR_SPAWN,
  CITY_MAX,
  CITY_MIN,
  MISSIONS,
  PLAYER_SPAWN,
  ROAD_LINES,
  createBuildings,
  districtAt,
  type Building,
  type Mission,
  type Vec3,
} from "./bay-city-data";

export type GameMode = "foot" | "car";

export type ControlState = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  brake: boolean;
  jump: boolean;
  action: boolean;
  lookDeltaX: number;
  lookDeltaY: number;
};

export type Telemetry = {
  x: number;
  z: number;
  speed: number;
  location: string;
  nearVehicle: boolean;
  mode: GameMode;
};

type SceneProps = {
  controlsRef: MutableRefObject<ControlState>;
  missionIndex: number;
  mode: GameMode;
  paused: boolean;
  started: boolean;
  wanted: number;
  onDamage: (amount: number) => void;
  onMissionComplete: (index: number) => void;
  onModeChange: (mode: GameMode) => void;
  onTelemetry: (telemetry: Telemetry) => void;
};

const UP = new THREE.Vector3(0, 1, 0);

export const BayCityScene = memo(function BayCityScene(props: SceneProps) {
  const buildings = useMemo(() => createBuildings(2407), []);

  return (
    <Physics gravity={[0, -18, 0]} timeStep="vary">
      <CityWorld buildings={buildings} mission={MISSIONS[props.missionIndex]} />
      <PlayerAndCar {...props} />
    </Physics>
  );
});

function CityWorld({ buildings, mission }: { buildings: Building[]; mission?: Mission }) {
  return (
    <>
      <color attach="background" args={["#ed8b72"]} />
      <fog attach="fog" args={["#d39c8f", 72, 245]} />
      <Sky
        distance={450000}
        inclination={0.49}
        azimuth={0.19}
        mieCoefficient={0.007}
        mieDirectionalG={0.86}
        rayleigh={1.4}
        turbidity={8}
      />
      <ambientLight intensity={1.1} color="#ffd7bf" />
      <hemisphereLight intensity={1.5} color="#ffe3c7" groundColor="#305462" />
      <directionalLight
        castShadow
        color="#fff0cf"
        intensity={3.25}
        position={[-76, 92, 42]}
        shadow-camera-bottom={-115}
        shadow-camera-far={280}
        shadow-camera-left={-115}
        shadow-camera-right={115}
        shadow-camera-top={115}
        shadow-mapSize={[2048, 2048]}
      />

      <BayWater />
      <CityGround buildings={buildings} />
      <RoadNetwork />
      <CityBuildings buildings={buildings} />
      <Landmarks />
      <GoldenGateBridge />
      <StreetFurniture />
      <Traffic />
      <Pedestrians />
      {mission?.kind === "checkpoint" ? <MissionBeacon mission={mission} /> : null}
      <Sparkles
        color="#fff0ba"
        count={110}
        opacity={0.2}
        position={[0, 18, -24]}
        scale={[220, 48, 250]}
        size={1.3}
        speed={0.12}
      />
    </>
  );
}

function BayWater() {
  const material = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!material.current) return;
    material.current.emissiveIntensity = 0.15 + Math.sin(clock.elapsedTime * 0.4) * 0.035;
  });

  return (
    <mesh position={[0, -1.45, -48]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[520, 520, 1, 1]} />
      <meshStandardMaterial
        ref={material}
        color="#1e7990"
        emissive="#0f5269"
        emissiveIntensity={0.15}
        metalness={0.38}
        roughness={0.27}
      />
    </mesh>
  );
}

function CityGround({ buildings }: { buildings: Building[] }) {
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      <CuboidCollider args={[100, 0.5, 100]} position={[0, -0.5, 0]} />
      {buildings.map((building) => (
        <CuboidCollider
          args={[building.size[0] / 2, building.size[1] / 2, building.size[2] / 2]}
          key={building.id}
          position={building.position}
        />
      ))}
      <CuboidCollider args={[7.8, 22, 7.8]} position={[28, 22, -28]} />
      <CuboidCollider args={[10.5, 6, 8.5]} position={[-56, 6, 28]} />
      <CuboidCollider args={[1, 4, 100]} position={[CITY_MIN - 1, 3.5, 0]} />
      <CuboidCollider args={[1, 4, 100]} position={[CITY_MAX + 1, 3.5, 0]} />
      <CuboidCollider args={[100, 4, 1]} position={[0, 3.5, CITY_MAX + 1]} />
      <CuboidCollider args={[43, 4, 1]} position={[-54, 3.5, CITY_MIN - 1]} />
      <CuboidCollider args={[43, 4, 1]} position={[54, 3.5, CITY_MIN - 1]} />
    </RigidBody>
  );
}

function RoadNetwork() {
  const blocks = useMemo(
    () =>
      [-56, -28, 0, 28, 56].flatMap((x) =>
        [-56, -28, 0, 28, 56].map((z) => ({ x, z })),
      ),
    [],
  );

  return (
    <group>
      <mesh receiveShadow position={[0, -0.03, 0]}>
        <boxGeometry args={[200, 0.08, 200]} />
        <meshStandardMaterial color="#3d4650" roughness={0.98} />
      </mesh>

      {blocks.map(({ x, z }) => (
        <group key={`${x}-${z}`} position={[x, 0.12, z]}>
          <mesh receiveShadow>
            <boxGeometry args={[20, 0.24, 20]} />
            <meshStandardMaterial color="#84908f" roughness={0.98} />
          </mesh>
          <mesh receiveShadow position={[0, 0.14, 0]}>
            <boxGeometry args={[18.6, 0.08, 18.6]} />
            <meshStandardMaterial color="#6e7775" roughness={1} />
          </mesh>
        </group>
      ))}

      {ROAD_LINES.map((x) => (
        <mesh key={`road-x-${x}`} receiveShadow position={[x, 0.13, 0]}>
          <boxGeometry args={[10, 0.16, 200]} />
          <meshStandardMaterial color="#29343c" roughness={0.96} />
        </mesh>
      ))}
      {ROAD_LINES.map((z) => (
        <mesh key={`road-z-${z}`} receiveShadow position={[0, 0.135, z]}>
          <boxGeometry args={[200, 0.17, 10]} />
          <meshStandardMaterial color="#29343c" roughness={0.96} />
        </mesh>
      ))}

      <RoadMarkings />
    </group>
  );
}

function RoadMarkings() {
  const dashes = useMemo(() => {
    const values: Array<{ id: string; position: Vec3; scale: Vec3 }> = [];
    ROAD_LINES.forEach((line) => {
      for (let axis = -88; axis <= 88; axis += 11) {
        values.push({
          id: `v-${line}-${axis}`,
          position: [line, 0.235, axis],
          scale: [0.16, 0.025, 4.8],
        });
        values.push({
          id: `h-${line}-${axis}`,
          position: [axis, 0.24, line],
          scale: [4.8, 0.025, 0.16],
        });
      }
    });
    return values;
  }, []);

  return (
    <group>
      {dashes.map((dash) => (
        <mesh key={dash.id} position={dash.position} scale={dash.scale}>
          <boxGeometry />
          <meshBasicMaterial color="#f4c861" />
        </mesh>
      ))}
    </group>
  );
}

function CityBuildings({ buildings }: { buildings: Building[] }) {
  return (
    <group>
      {buildings.map((building) => (
        <BuildingMesh building={building} key={building.id} />
      ))}
    </group>
  );
}

function BuildingMesh({ building }: { building: Building }) {
  const [width, height, depth] = building.size;
  const ledgeCount = Math.max(1, Math.min(4, Math.floor(height / 8)));

  return (
    <group position={building.position}>
      <mesh castShadow receiveShadow>
        {building.style === "tower" ? (
          <boxGeometry args={[width * 0.9, height, depth * 0.9]} />
        ) : (
          <boxGeometry args={[width, height, depth]} />
        )}
        <meshStandardMaterial color={building.color} roughness={0.78} metalness={0.05} />
      </mesh>

      {Array.from({ length: ledgeCount }, (_, index) => {
        const y = -height / 2 + ((index + 1) * height) / (ledgeCount + 1);
        return (
          <group key={index} position={[0, y, 0]}>
            <mesh position={[0, 0, depth / 2 + 0.016]}>
              <boxGeometry args={[width * 0.72, 0.34, 0.035]} />
              <meshStandardMaterial
                color={building.windowColor}
                emissive={building.windowColor}
                emissiveIntensity={0.75}
                roughness={0.18}
              />
            </mesh>
            <mesh position={[width / 2 + 0.016, 0, 0]}>
              <boxGeometry args={[0.035, 0.34, depth * 0.66]} />
              <meshStandardMaterial
                color={building.windowColor}
                emissive={building.windowColor}
                emissiveIntensity={0.62}
                roughness={0.18}
              />
            </mesh>
          </group>
        );
      })}

      <mesh castShadow position={[0, height / 2 + 0.3, 0]}>
        <boxGeometry args={[width * 0.78, 0.6, depth * 0.78]} />
        <meshStandardMaterial color={building.roofColor} roughness={0.9} />
      </mesh>
      {building.style === "office" ? (
        <mesh castShadow position={[0, height / 2 + 1.2, 0]}>
          <boxGeometry args={[width * 0.28, 1.8, depth * 0.28]} />
          <meshStandardMaterial color="#394851" metalness={0.45} roughness={0.5} />
        </mesh>
      ) : null}
    </group>
  );
}

function Landmarks() {
  return (
    <group>
      <TransamericaPyramid />
      <PaintedLadies />
      <CoitTower />
      <FerryBuilding />
      <SutroTower />
      <Hills />
    </group>
  );
}

function TransamericaPyramid() {
  return (
    <group position={[28, 0.35, -28]}>
      <mesh castShadow receiveShadow position={[0, 19, 0]}>
        <coneGeometry args={[7.6, 38, 4]} />
        <meshStandardMaterial color="#d9ddd4" roughness={0.68} />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh key={index} position={[0, 4 + index * 4, 5.2 - index * 0.58]}>
          <boxGeometry args={[2.2, 0.32, 0.06]} />
          <meshStandardMaterial color="#8fd4e7" emissive="#4ca4c1" emissiveIntensity={0.55} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 41, 0]}>
        <cylinderGeometry args={[0.09, 0.14, 7, 8]} />
        <meshStandardMaterial color="#444b50" metalness={0.7} />
      </mesh>
    </group>
  );
}

function PaintedLadies() {
  const colors = ["#ef6f7c", "#6fb3b8", "#f0ba65", "#9a79b7", "#7fa277"];
  return (
    <group position={[-56, 0.35, 28]}>
      {colors.map((color, index) => (
        <group key={color} position={[(index - 2) * 4.1, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, 4.5, 0]}>
            <boxGeometry args={[3.7, 8.8, 8]} />
            <meshStandardMaterial color={color} roughness={0.82} />
          </mesh>
          <mesh castShadow position={[0, 9.2, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[3.1, 3.3, 4]} />
            <meshStandardMaterial color="#4d4651" roughness={0.9} />
          </mesh>
          <mesh position={[0, 4.5, 4.03]}>
            <boxGeometry args={[1.15, 2.8, 0.08]} />
            <meshStandardMaterial color="#f5e9d2" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CoitTower() {
  return (
    <group position={[85, 0.4, -84]}>
      <mesh castShadow position={[0, 10, 0]}>
        <cylinderGeometry args={[2.5, 3.2, 20, 14]} />
        <meshStandardMaterial color="#e5d8bc" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 19.4, 0]}>
        <cylinderGeometry args={[3.1, 2.7, 1.7, 14]} />
        <meshStandardMaterial color="#bdb39f" roughness={0.88} />
      </mesh>
      <pointLight color="#ffd46f" distance={24} intensity={20} position={[0, 19, 0]} />
    </group>
  );
}

function FerryBuilding() {
  return (
    <group position={[87, 0.35, 6]}>
      <mesh castShadow position={[0, 4, 0]}>
        <boxGeometry args={[9, 8, 10]} />
        <meshStandardMaterial color="#d8c79f" roughness={0.88} />
      </mesh>
      <mesh castShadow position={[0, 13, 0]}>
        <boxGeometry args={[4, 10, 4]} />
        <meshStandardMaterial color="#e7d6ac" roughness={0.86} />
      </mesh>
      <mesh castShadow position={[0, 18.7, 0]}>
        <coneGeometry args={[3.2, 4, 4]} />
        <meshStandardMaterial color="#4a826e" roughness={0.76} />
      </mesh>
      <mesh position={[0, 14.2, 2.04]}>
        <cylinderGeometry args={[1.08, 1.08, 0.08, 24]} />
        <meshStandardMaterial color="#f5e6bc" emissive="#ffce6e" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function SutroTower() {
  return (
    <group position={[-88, 5, -82]}>
      {[0, 1, 2].map((index) => (
        <mesh
          castShadow
          key={index}
          position={[(index - 1) * 2.8, 19, 0]}
          rotation={[0, 0, (index - 1) * 0.035]}
        >
          <cylinderGeometry args={[0.16, 0.32, 38, 6]} />
          <meshStandardMaterial color="#b34e54" metalness={0.65} roughness={0.55} />
        </mesh>
      ))}
      {[8, 17, 26, 35].map((height) => (
        <mesh key={height} position={[0, height, 0]}>
          <boxGeometry args={[8, 0.18, 0.18]} />
          <meshStandardMaterial color="#d7caca" metalness={0.6} />
        </mesh>
      ))}
      <pointLight color="#ff4d6d" distance={18} intensity={16} position={[0, 39, 0]} />
    </group>
  );
}

function Hills() {
  return (
    <group>
      <mesh position={[-122, -5, -42]} scale={[1.2, 0.62, 1]} receiveShadow>
        <sphereGeometry args={[62, 18, 10]} />
        <meshStandardMaterial color="#567a65" roughness={1} />
      </mesh>
      <mesh position={[182, -8, 8]} scale={[1.15, 0.44, 1]} receiveShadow>
        <sphereGeometry args={[70, 18, 10]} />
        <meshStandardMaterial color="#466e62" roughness={1} />
      </mesh>
    </group>
  );
}

function GoldenGateBridge() {
  const towerZ = [-122, -172];
  const cablePointsLeft: Vec3[] = [
    [-7.4, 2.6, -99],
    [-7.4, 24, -122],
    [-7.4, 8, -147],
    [-7.4, 24, -172],
    [-7.4, 2.6, BRIDGE_END],
  ];
  const cablePointsRight = cablePointsLeft.map(([x, y, z]) => [-x, y, z] as Vec3);

  return (
    <group>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[8.5, 0.5, 49]} position={[0, -0.4, -146]} />
        <CuboidCollider args={[0.35, 1.15, 49]} position={[-8.15, 0.75, -146]} />
        <CuboidCollider args={[0.35, 1.15, 49]} position={[8.15, 0.75, -146]} />
      </RigidBody>
      <mesh castShadow receiveShadow position={[0, -0.4, -146]}>
        <boxGeometry args={[17, 1, 98]} />
        <meshStandardMaterial color="#2a343a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.14, -146]}>
        <boxGeometry args={[0.18, 0.025, 96]} />
        <meshBasicMaterial color="#f6cb63" />
      </mesh>

      {towerZ.map((z) => (
        <group key={z} position={[0, 0, z]}>
          {[-7.2, 7.2].map((x) => (
            <mesh castShadow key={x} position={[x, 12, 0]}>
              <boxGeometry args={[1.7, 24, 2.4]} />
              <meshStandardMaterial color="#d84f3f" roughness={0.7} metalness={0.18} />
            </mesh>
          ))}
          {[6, 14, 22].map((y) => (
            <mesh castShadow key={y} position={[0, y, 0]}>
              <boxGeometry args={[15.8, 1.1, 2.1]} />
              <meshStandardMaterial color="#d84f3f" roughness={0.72} />
            </mesh>
          ))}
        </group>
      ))}

      <Line color="#e66a55" lineWidth={2} points={cablePointsLeft} />
      <Line color="#e66a55" lineWidth={2} points={cablePointsRight} />
      {[-7.4, 7.4].flatMap((x) =>
        Array.from({ length: 13 }, (_, index) => {
          const z = -101 - index * 7.2;
          const nearest = Math.min(Math.abs(z + 122), Math.abs(z + 172));
          const top = 7 + Math.max(0, 17 - nearest * 0.68);
          return (
            <Line
              color="#e66a55"
              key={`${x}-${index}`}
              lineWidth={1}
              points={[
                [x, 1.1, z],
                [x, top, z],
              ]}
            />
          );
        }),
      )}
      {[-8.2, 8.2].map((x) => (
        <mesh key={x} position={[x, 1.15, -146]}>
          <boxGeometry args={[0.35, 1.7, 98]} />
          <meshStandardMaterial color="#c9473b" roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function StreetFurniture() {
  const trees = useMemo(
    () =>
      Array.from({ length: 38 }, (_, index) => {
        const road = ROAD_LINES[index % ROAD_LINES.length];
        const axis = -84 + ((index * 17) % 168);
        const vertical = index % 2 === 0;
        return {
          id: index,
          position: vertical
            ? ([road + (index % 4 < 2 ? -6.8 : 6.8), 0.35, axis] as Vec3)
            : ([axis, 0.35, road + (index % 4 < 2 ? -6.8 : 6.8)] as Vec3),
        };
      }),
    [],
  );

  return (
    <group>
      {trees.map(({ id, position }) => (
        <group key={id} position={position}>
          <mesh castShadow position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.13, 0.22, 3, 7]} />
            <meshStandardMaterial color="#5b493b" roughness={1} />
          </mesh>
          <mesh castShadow position={[0, 3.7, 0]}>
            <icosahedronGeometry args={[1.55, 1]} />
            <meshStandardMaterial color={id % 3 ? "#3f7b59" : "#5e9865"} roughness={0.95} />
          </mesh>
        </group>
      ))}
      {ROAD_LINES.flatMap((road, roadIndex) =>
        [-82, -54, -26, 2, 30, 58, 86].map((z, index) => (
          <group key={`${road}-${z}`} position={[road + 6.2, 0.3, z]}>
            <mesh castShadow position={[0, 2.7, 0]}>
              <cylinderGeometry args={[0.07, 0.1, 5.4, 7]} />
              <meshStandardMaterial color="#25343a" metalness={0.65} />
            </mesh>
            <mesh position={[0, 5.4, 0]}>
              <sphereGeometry args={[0.25, 10, 8]} />
              <meshStandardMaterial
                color="#ffe7a0"
                emissive="#ffc75c"
                emissiveIntensity={roadIndex % 2 ? 1.8 : 1.25}
              />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}

function Traffic() {
  const cars = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        id: index,
        axis: index % 2 === 0 ? ("x" as const) : ("z" as const),
        lane: ROAD_LINES[index % ROAD_LINES.length] + (index % 4 < 2 ? -2.5 : 2.5),
        start: -88 + ((index * 23) % 176),
        direction: index % 3 === 0 ? -1 : 1,
        color: ["#e85d5d", "#54b0a8", "#f0b957", "#8c78c5", "#d6d8d8"][index % 5],
        speed: 5 + (index % 4) * 1.1,
      })),
    [],
  );

  return (
    <group>
      {cars.map((car) => (
        <TrafficCar key={car.id} {...car} />
      ))}
      <CableCar />
    </group>
  );
}

function TrafficCar({
  axis,
  color,
  direction,
  lane,
  speed,
  start,
}: {
  axis: "x" | "z";
  color: string;
  direction: number;
  lane: number;
  speed: number;
  start: number;
}) {
  const group = useRef<THREE.Group>(null);
  const distance = useRef(start);

  useFrame((_, delta) => {
    if (!group.current) return;
    distance.current += direction * speed * Math.min(delta, 0.04);
    if (distance.current > 94) distance.current = -94;
    if (distance.current < -94) distance.current = 94;
    if (axis === "x") {
      group.current.position.set(distance.current, 0.65, lane);
      group.current.rotation.y = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      group.current.position.set(lane, 0.65, distance.current);
      group.current.rotation.y = direction > 0 ? Math.PI : 0;
    }
  });

  return (
    <group ref={group}>
      <VehicleModel color={color} compact />
    </group>
  );
}

function CableCar() {
  const group = useRef<THREE.Group>(null);
  const z = useRef(82);
  useFrame((_, delta) => {
    if (!group.current) return;
    z.current -= Math.min(delta, 0.04) * 3.8;
    if (z.current < -88) z.current = 88;
    group.current.position.set(-14, 0.8, z.current);
  });
  return (
    <group ref={group}>
      <mesh castShadow position={[0, 0.9, 0]}>
        <boxGeometry args={[2.5, 1.8, 4.8]} />
        <meshStandardMaterial color="#b54a3f" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.2, -2.42]}>
        <boxGeometry args={[1.8, 0.7, 0.04]} />
        <meshStandardMaterial color="#96d5dc" emissive="#4d9ca7" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 3.1, 6]} />
        <meshStandardMaterial color="#28343b" metalness={0.65} />
      </mesh>
    </group>
  );
}

function Pedestrians() {
  const people = useMemo(
    () =>
      Array.from({ length: 22 }, (_, index) => ({
        id: index,
        position: [
          ROAD_LINES[index % ROAD_LINES.length] + (index % 2 ? 6.4 : -6.4),
          0.35,
          -84 + ((index * 19) % 168),
        ] as Vec3,
        color: ["#ff7d75", "#5bc0be", "#ffd166", "#a78bfa"][index % 4],
      })),
    [],
  );
  return (
    <group>
      {people.map((person) => (
        <group key={person.id} position={person.position}>
          <mesh castShadow position={[0, 1.15, 0]}>
            <capsuleGeometry args={[0.25, 0.72, 5, 8]} />
            <meshStandardMaterial color={person.color} roughness={0.82} />
          </mesh>
          <mesh castShadow position={[0, 1.95, 0]}>
            <sphereGeometry args={[0.25, 10, 8]} />
            <meshStandardMaterial color="#8e624d" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function MissionBeacon({ mission }: { mission: Mission }) {
  return (
    <Float floatIntensity={0.26} rotationIntensity={0.08} speed={1.5}>
      <group position={mission.target}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[5.2, 0.24, 12, 72]} />
          <meshStandardMaterial
            color="#d9ff5c"
            emissive="#b8ff21"
            emissiveIntensity={2.7}
            metalness={0.35}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0, 7, 0]}>
          <cylinderGeometry args={[1.7, 4.8, 14, 32, 1, true]} />
          <meshBasicMaterial color="#caff5f" opacity={0.1} side={THREE.DoubleSide} transparent />
        </mesh>
        <pointLight color="#d9ff5c" distance={26} intensity={24} />
      </group>
    </Float>
  );
}

function PlayerAndCar({
  controlsRef,
  missionIndex,
  mode,
  paused,
  started,
  wanted,
  onDamage,
  onMissionComplete,
  onModeChange,
  onTelemetry,
}: SceneProps) {
  const player = useRef<RapierRigidBody>(null);
  const car = useRef<RapierRigidBody>(null);
  const carVisual = useRef<THREE.Group>(null);
  const targetRef = useRef(new THREE.Vector3(...PLAYER_SPAWN));
  const cameraYaw = useRef(0);
  const cameraPitch = useRef(-0.08);
  const carYaw = useRef(0);
  const carOrbit = useRef(0);
  const actionLocked = useRef(false);
  const missionGate = useRef(-1);
  const damageGate = useRef(0);
  const telemetryClock = useRef(0);
  const { camera } = useThree();
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const movement = useMemo(() => new THREE.Vector3(), []);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const cameraGoal = useMemo(() => new THREE.Vector3(), []);
  const lookGoal = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);

  useEffect(() => {
    const playerBody = player.current;
    const carBody = car.current;
    if (!playerBody || !carBody) return;

    if (mode === "car") {
      playerBody.setEnabled(false);
      const position = carBody.translation();
      playerBody.setTranslation(position, true);
      cameraYaw.current = carYaw.current;
    } else {
      const carPosition = carBody.translation();
      const exitRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, carYaw.current);
      playerBody.setEnabled(true);
      playerBody.setTranslation(
        {
          x: carPosition.x + exitRight.x * 2.4,
          y: Math.max(1.1, carPosition.y + 0.2),
          z: carPosition.z + exitRight.z * 2.4,
        },
        true,
      );
      playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      cameraYaw.current = carYaw.current;
    }
  }, [mode]);

  useFrame((_, rawDelta) => {
    const playerBody = player.current;
    const carBody = car.current;
    if (!playerBody || !carBody) return;
    const delta = Math.min(rawDelta, 0.04);
    damageGate.current = Math.max(0, damageGate.current - delta);

    const carPosition = carBody.translation();
    const playerPosition = playerBody.translation();
    const carVelocity = carBody.linvel();
    const playerVelocity = playerBody.linvel();
    const nearVehicle =
      (playerPosition.x - carPosition.x) ** 2 + (playerPosition.z - carPosition.z) ** 2 < 22;

    if (controlsRef.current.action && !actionLocked.current && !paused) {
      actionLocked.current = true;
      controlsRef.current.action = false;
      if (mode === "foot" && nearVehicle) {
        onModeChange("car");
        if (missionIndex === 0 && missionGate.current !== 0) {
          missionGate.current = 0;
          onMissionComplete(0);
        }
      } else if (mode === "car" && Math.hypot(carVelocity.x, carVelocity.z) < 10) {
        onModeChange("foot");
      }
    }
    if (!controlsRef.current.action) actionLocked.current = false;

    if (controlsRef.current.lookDeltaX || controlsRef.current.lookDeltaY) {
      const dx = controlsRef.current.lookDeltaX;
      const dy = controlsRef.current.lookDeltaY;
      if (mode === "car") {
        carOrbit.current -= dx * 0.0031;
      } else {
        cameraYaw.current -= dx * 0.0031;
      }
      cameraPitch.current = THREE.MathUtils.clamp(cameraPitch.current - dy * 0.0021, -0.34, 0.34);
      controlsRef.current.lookDeltaX = 0;
      controlsRef.current.lookDeltaY = 0;
    }

    forward.set(0, 0, -1).applyAxisAngle(UP, carYaw.current);
    right.set(1, 0, 0).applyAxisAngle(UP, carYaw.current);
    velocity.set(carVelocity.x, 0, carVelocity.z);

    if (mode === "car") {
      const throttle = Number(controlsRef.current.forward) - Number(controlsRef.current.back);
      const steering = Number(controlsRef.current.left) - Number(controlsRef.current.right);
      let forwardSpeed = velocity.dot(forward);
      let sideSpeed = velocity.dot(right);
      const topSpeed = controlsRef.current.sprint ? 34 : 27;
      const acceleration = throttle >= 0 ? 22 : 15;

      if (!paused) {
        forwardSpeed += throttle * acceleration * delta;
        forwardSpeed = THREE.MathUtils.clamp(forwardSpeed, -13, topSpeed);
        if (Math.abs(throttle) < 0.1) forwardSpeed *= Math.pow(0.987, delta * 60);
        if (controlsRef.current.brake) forwardSpeed *= Math.pow(0.87, delta * 60);
        sideSpeed *= Math.pow(0.78, delta * 60);

        if (Math.abs(steering) > 0 && Math.abs(forwardSpeed) > 0.45) {
          const directionSign = forwardSpeed >= 0 ? 1 : -1;
          const turnRate = 0.75 + Math.min(1.2, Math.abs(forwardSpeed) * 0.035);
          carYaw.current += steering * directionSign * turnRate * delta;
        }
      } else {
        forwardSpeed *= Math.pow(0.82, delta * 60);
        sideSpeed *= Math.pow(0.78, delta * 60);
      }

      quaternion.setFromAxisAngle(UP, carYaw.current);
      carBody.setRotation(quaternion, true);
      carBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      carBody.setLinvel(
        {
          x: forward.x * forwardSpeed + right.x * sideSpeed,
          y: carVelocity.y,
          z: forward.z * forwardSpeed + right.z * sideSpeed,
        },
        true,
      );
      if (carVisual.current) {
        carVisual.current.rotation.z = THREE.MathUtils.lerp(
          carVisual.current.rotation.z,
          -steering * Math.min(0.06, Math.abs(forwardSpeed) * 0.004),
          0.12,
        );
      }
    } else {
      const footForward = forward.set(0, 0, -1).applyAxisAngle(UP, cameraYaw.current);
      const footRight = right.set(1, 0, 0).applyAxisAngle(UP, cameraYaw.current);
      movement.set(0, 0, 0);
      movement.addScaledVector(
        footForward,
        Number(controlsRef.current.forward) - Number(controlsRef.current.back),
      );
      movement.addScaledVector(
        footRight,
        Number(controlsRef.current.right) - Number(controlsRef.current.left),
      );
      if (movement.lengthSq() > 0) {
        movement.normalize();
        const speed = controlsRef.current.sprint ? 8.5 : 5.6;
        playerBody.setLinvel(
          { x: movement.x * speed, y: playerVelocity.y, z: movement.z * speed },
          true,
        );
        const angle = Math.atan2(-movement.x, -movement.z);
        quaternion.setFromAxisAngle(UP, angle);
        playerBody.setRotation(quaternion, true);
      } else {
        playerBody.setLinvel({ x: 0, y: playerVelocity.y, z: 0 }, true);
      }
      if (controlsRef.current.jump && Math.abs(playerVelocity.y) < 0.18 && !paused) {
        playerBody.applyImpulse({ x: 0, y: 5.4, z: 0 }, true);
        controlsRef.current.jump = false;
      }
    }

    const activePosition = mode === "car" ? carBody.translation() : playerBody.translation();
    targetRef.current.set(activePosition.x, activePosition.y, activePosition.z);

    const mission = MISSIONS[missionIndex];
    if (mission?.kind === "checkpoint" && !paused && missionGate.current !== missionIndex) {
      const dx = activePosition.x - mission.target[0];
      const dz = activePosition.z - mission.target[2];
      if (dx * dx + dz * dz < 48) {
        missionGate.current = missionIndex;
        onMissionComplete(missionIndex);
      }
    }

    if (activePosition.y < -5) {
      if (mode === "car") {
        carBody.setTranslation(
          { x: CAR_SPAWN[0], y: CAR_SPAWN[1], z: CAR_SPAWN[2] },
          true,
        );
        carBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        carYaw.current = 0;
      } else {
        playerBody.setTranslation(
          { x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] },
          true,
        );
        playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (!paused && damageGate.current <= 0) {
        damageGate.current = 1;
        onDamage(4);
      }
    }

    if (!started) {
      cameraGoal.set(82, 48, 104);
      lookGoal.set(0, 8, -22);
    } else if (mode === "car") {
      const orbitYaw = carYaw.current + carOrbit.current;
      const orbitForward = movement.set(0, 0, -1).applyAxisAngle(UP, orbitYaw);
      cameraGoal.set(
        activePosition.x - orbitForward.x * 10.5,
        activePosition.y + 5.4 + cameraPitch.current * 6,
        activePosition.z - orbitForward.z * 10.5,
      );
      lookGoal.set(activePosition.x, activePosition.y + 1.15, activePosition.z);
    } else {
      const viewForward = movement.set(0, 0, -1).applyAxisAngle(UP, cameraYaw.current);
      cameraGoal.set(
        activePosition.x - viewForward.x * 6.8,
        activePosition.y + 3.5 + cameraPitch.current * 4,
        activePosition.z - viewForward.z * 6.8,
      );
      lookGoal.set(activePosition.x, activePosition.y + 0.75, activePosition.z);
    }
    const cameraBlend = 1 - Math.exp(-delta * 7.5);
    camera.position.lerp(cameraGoal, cameraBlend);
    camera.lookAt(lookGoal);

    telemetryClock.current += delta;
    if (telemetryClock.current > 0.11) {
      telemetryClock.current = 0;
      const speed =
        mode === "car"
          ? Math.hypot(carVelocity.x, carVelocity.z) * 3.6
          : Math.hypot(playerVelocity.x, playerVelocity.z) * 3.6;
      onTelemetry({
        x: activePosition.x,
        z: activePosition.z,
        speed,
        location: districtAt(activePosition.x, activePosition.z),
        nearVehicle,
        mode,
      });
    }
  });

  return (
    <>
      <RigidBody
        ref={player}
        colliders={false}
        enabledRotations={[false, false, false]}
        friction={0.9}
        linearDamping={0.12}
        lockRotations
        mass={1}
        position={PLAYER_SPAWN}
      >
        <CapsuleCollider args={[0.45, 0.35]} />
        <Avatar visible={mode === "foot"} />
      </RigidBody>

      <RigidBody
        ref={car}
        angularDamping={4}
        ccd
        colliders={false}
        enabledRotations={[false, true, false]}
        friction={0.78}
        linearDamping={0.12}
        mass={5.4}
        position={CAR_SPAWN}
      >
        <CuboidCollider args={[1.08, 0.44, 2.18]} position={[0, 0.45, 0]} />
        <group ref={carVisual}>
          <VehicleModel color="#f05a47" hero />
        </group>
      </RigidBody>

      <PoliceFleet
        onDamage={onDamage}
        paused={paused}
        targetRef={targetRef}
        wanted={wanted}
      />
    </>
  );
}

function Avatar({ visible }: { visible: boolean }) {
  return (
    <group position={[0, -0.77, 0]} visible={visible}>
      <mesh castShadow position={[0, 1.18, 0]}>
        <capsuleGeometry args={[0.34, 0.74, 6, 10]} />
        <meshStandardMaterial color="#20a4a8" roughness={0.76} />
      </mesh>
      <mesh castShadow position={[0, 1.98, 0]}>
        <sphereGeometry args={[0.31, 14, 10]} />
        <meshStandardMaterial color="#9d684e" roughness={0.86} />
      </mesh>
      <mesh castShadow position={[-0.18, 0.42, 0]}>
        <capsuleGeometry args={[0.13, 0.58, 5, 8]} />
        <meshStandardMaterial color="#273245" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0.18, 0.42, 0]}>
        <capsuleGeometry args={[0.13, 0.58, 5, 8]} />
        <meshStandardMaterial color="#273245" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 1.22, 0.28]}>
        <boxGeometry args={[0.52, 0.62, 0.18]} />
        <meshStandardMaterial color="#f0b957" roughness={0.8} />
      </mesh>
    </group>
  );
}

export function VehicleModel({
  color,
  compact = false,
  hero = false,
  police = false,
}: {
  color: string;
  compact?: boolean;
  hero?: boolean;
  police?: boolean;
}) {
  const length = compact ? 3.3 : 4.15;
  const width = compact ? 1.65 : 2.05;
  const wheelZ = length * 0.34;

  return (
    <group scale={hero ? 1.08 : 1}>
      <mesh castShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[width, 0.62, length]} />
        <meshStandardMaterial color={police ? "#e8edf0" : color} metalness={0.34} roughness={0.42} />
      </mesh>
      <mesh castShadow position={[0, 0.96, 0.18]}>
        <boxGeometry args={[width * 0.78, 0.58, length * 0.49]} />
        <meshStandardMaterial color={police ? "#263546" : "#243845"} metalness={0.52} roughness={0.3} />
      </mesh>
      {police ? (
        <>
          <mesh position={[0, 1.31, 0.08]}>
            <boxGeometry args={[1.1, 0.12, 0.22]} />
            <meshStandardMaterial color="#202a34" />
          </mesh>
          <mesh position={[-0.34, 1.38, 0.08]}>
            <boxGeometry args={[0.4, 0.12, 0.2]} />
            <meshStandardMaterial color="#ff3f62" emissive="#ff234b" emissiveIntensity={3} />
          </mesh>
          <mesh position={[0.34, 1.38, 0.08]}>
            <boxGeometry args={[0.4, 0.12, 0.2]} />
            <meshStandardMaterial color="#48a8ff" emissive="#258cff" emissiveIntensity={3} />
          </mesh>
        </>
      ) : null}
      {[[-width / 2 - 0.08, -wheelZ], [width / 2 + 0.08, -wheelZ], [-width / 2 - 0.08, wheelZ], [width / 2 + 0.08, wheelZ]].map(
        ([x, z], index) => (
          <mesh castShadow key={index} position={[x, 0.34, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.36, 0.36, 0.23, 14]} />
            <meshStandardMaterial color="#12171b" roughness={0.8} />
          </mesh>
        ),
      )}
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.6, -length / 2 - 0.015]}>
          <boxGeometry args={[0.42, 0.22, 0.035]} />
          <meshStandardMaterial color="#fff1b4" emissive="#ffe585" emissiveIntensity={hero ? 2.4 : 1.1} />
        </mesh>
      ))}
      {hero ? (
        <pointLight color="#ffe59a" distance={16} intensity={9} position={[0, 0.7, -2.2]} />
      ) : null}
    </group>
  );
}

function PoliceFleet({
  onDamage,
  paused,
  targetRef,
  wanted,
}: {
  onDamage: (amount: number) => void;
  paused: boolean;
  targetRef: MutableRefObject<THREE.Vector3>;
  wanted: number;
}) {
  const groups = useRef<Array<THREE.Group | null>>([]);
  const positions = useRef([
    new THREE.Vector3(-80, 0.7, 80),
    new THREE.Vector3(84, 0.7, -4),
    new THREE.Vector3(-82, 0.7, -78),
  ]);
  const hitCooldown = useRef(0);
  const direction = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    const step = Math.min(delta, 0.04);
    hitCooldown.current = Math.max(0, hitCooldown.current - step);
    groups.current.forEach((group, index) => {
      if (!group) return;
      group.visible = index < wanted;
      if (index >= wanted || paused) return;

      const position = positions.current[index];
      direction.copy(targetRef.current).sub(position);
      const distance = direction.length();
      if (distance > 120) {
        const angle = index * 2.1 + clock.elapsedTime * 0.08;
        position.set(
          targetRef.current.x + Math.sin(angle) * 48,
          0.72,
          targetRef.current.z + Math.cos(angle) * 48,
        );
      } else if (distance > 0.01) {
        direction.normalize();
        const speed = 9.5 + wanted * 2.4 + index * 0.55;
        position.addScaledVector(direction, step * speed);
        position.y = 0.72;
        group.rotation.y = Math.atan2(-direction.x, -direction.z);
      }
      group.position.copy(position);

      if (distance < 4.3 && hitCooldown.current <= 0) {
        hitCooldown.current = 2.2;
        onDamage(1.2);
        position.addScaledVector(direction, -7);
      }
    });
  });

  return (
    <group>
      {[0, 1, 2].map((index) => (
        <group
          key={index}
          ref={(group) => {
            groups.current[index] = group;
          }}
          visible={false}
        >
          <VehicleModel color="#eef1f3" police />
          <pointLight color="#ff3157" distance={11} intensity={12} position={[-0.45, 1.5, 0]} />
          <pointLight color="#379eff" distance={11} intensity={12} position={[0.45, 1.5, 0]} />
        </group>
      ))}
    </group>
  );
}
