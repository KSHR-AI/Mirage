"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CourierYard } from "./CourierYard";
import { InstancedPrimitives } from "./InstancedPrimitives";
import { cityMissionZone } from "./city-layout";
import {
  filterPoweredCityFeatures,
  isCityLightPowered,
  type CityPowerState,
} from "./power";
import {
  createSanFranciscoBackdrop,
  SF_CABLE_CAR_POSITION,
} from "./san-francisco-details";
import type {
  BoxInstance,
  CityMissionZoneId,
  CityQuality,
  CityVec3,
  MissionZone,
} from "./types";

type CityLandmarksProps = {
  activeZone: CityMissionZoneId | null;
  missionProgress: number;
  powerState: CityPowerState;
  quality: CityQuality;
  reducedMotion: boolean;
  shadows: boolean;
};

export const CityLandmarks = memo(function CityLandmarks({
  activeZone,
  missionProgress,
  powerState,
  quality,
  reducedMotion,
  shadows,
}: CityLandmarksProps) {
  return (
    <group
      name="authored-bay-city-landmarks"
      userData={{ cameraCollisionRoot: true }}
    >
      <EmberSpan powerState={powerState} quality={quality} shadows={shadows} />
      <AfterlightSpire
        powerState={powerState}
        quality={quality}
        shadows={shadows}
      />
      <AuroraVault
        powerState={powerState}
        quality={quality}
        shadows={shadows}
      />
      <PaintedRow shadows={shadows} />
      <CaliforniaCableCar shadows={shadows} />
      <SanFranciscoStreetSigns />
      <GridSeven powerState={powerState} quality={quality} shadows={shadows} />
      <BreakwaterTerminal
        powerState={powerState}
        quality={quality}
        shadows={shadows}
      />
      <CourierYard quality={quality} shadows={shadows} />
      <IndustrialWaterfront shadows={shadows} />
      <CityHills powerState={powerState} quality={quality} />
      {activeZone ? (
        <MissionZoneBeacon
          progress={missionProgress}
          reducedMotion={reducedMotion}
          zone={cityMissionZone(activeZone)}
        />
      ) : null}
    </group>
  );
});

const BRIDGE_CABLE_POINTS: readonly CityVec3[] = [
  [0, 3.2, -104],
  [0, 27.5, -132],
  [0, 8.2, -164],
  [0, 27.5, -196],
  [0, 3.2, -238],
];

function EmberSpan({
  powerState,
  quality,
  shadows,
}: {
  powerState: CityPowerState;
  quality: CityQuality;
  shadows: boolean;
}) {
  const steel = useMemo<BoxInstance[]>(() => {
    const values: BoxInstance[] = [];
    for (const z of [-132, -196]) {
      for (const x of [-7.2, 7.2]) {
        values.push(
          cityBox(
            `bridge-leg-${x}-${z}`,
            [x, 14, z],
            [1.5, 28, 2.2],
            "#c34b42",
          ),
        );
      }
      for (const y of [7, 16, 25]) {
        values.push(
          cityBox(
            `bridge-cross-${y}-${z}`,
            [0, y, z],
            [15.9, 1.05, 2],
            "#d45a48",
          ),
        );
      }
    }
    values.push(
      cityBox(
        "bridge-west-rail",
        [-8.1, 1.05, -171],
        [0.32, 1.65, 134],
        "#a83d38",
      ),
      cityBox(
        "bridge-east-rail",
        [8.1, 1.05, -171],
        [0.32, 1.65, 134],
        "#a83d38",
      ),
    );
    return values;
  }, []);

  const suspenders = useMemo<BoxInstance[]>(() => {
    const values: BoxInstance[] = [];
    for (let z = -108; z >= -234; z -= quality === "desktop" ? 7 : 14) {
      const top = cableHeightAt(z);
      for (const x of [-7.35, 7.35]) {
        values.push(
          cityBox(
            `suspender-${x}-${z}`,
            [x, 1.25 + (top - 1.25) / 2, z],
            [0.085, Math.max(0.4, top - 1.25), 0.085],
            "#dc6a55",
          ),
        );
      }
    }
    return values;
  }, [quality]);

  const towerLights = useMemo<BoxInstance[]>(
    () =>
      [-132, -196].flatMap((z) =>
        [-7.2, 7.2].map((x) =>
          cityBox(
            `bridge-light-${x}-${z}`,
            [x, 28.5, z],
            [0.42, 0.42, 0.42],
            "#ffb15e",
          ),
        ),
      ),
    [],
  );
  const poweredTowerLights = useMemo(
    () => filterPoweredCityFeatures(towerLights, powerState),
    [powerState, towerLights],
  );

  return (
    <group name="ember-span">
      <mesh castShadow={shadows} position={[0, -0.12, -171]} receiveShadow>
        <boxGeometry args={[17, 1.05, 134]} />
        <meshStandardMaterial
          color="#17242a"
          metalness={0.42}
          roughness={0.43}
        />
      </mesh>
      <mesh position={[0, 0.44, -171]}>
        <boxGeometry args={[0.16, 0.035, 132]} />
        <meshBasicMaterial color="#e8bf56" toneMapped={false} />
      </mesh>
      <InstancedPrimitives
        castShadow={shadows}
        instances={steel}
        metalness={0.38}
        roughness={0.54}
      />
      <InstancedPrimitives
        instances={suspenders}
        metalness={0.5}
        roughness={0.45}
      />
      {[-7.35, 7.35].map((x) => (
        <BridgeCable
          key={x}
          points={BRIDGE_CABLE_POINTS.map(([, y, z]) => [x, y, z])}
          quality={quality}
        />
      ))}
      <InstancedPrimitives
        depthWrite={false}
        instances={poweredTowerLights}
        material="basic"
        shape="sphere"
        toneMapped={false}
      />
    </group>
  );
}

function BridgeCable({
  points,
  quality,
}: {
  points: CityVec3[];
  quality: CityQuality;
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        points.map((point) => new THREE.Vector3(...point)),
      ),
    [points],
  );
  return (
    <mesh>
      <tubeGeometry
        args={[
          curve,
          quality === "desktop" ? 72 : 24,
          0.105,
          quality === "desktop" ? 6 : 4,
          false,
        ]}
      />
      <meshStandardMaterial color="#df6b55" metalness={0.52} roughness={0.42} />
    </mesh>
  );
}

function AfterlightSpire({
  powerState,
  quality,
  shadows,
}: {
  powerState: CityPowerState;
  quality: CityQuality;
  shadows: boolean;
}) {
  const windows = useMemo<BoxInstance[]>(
    () =>
      Array.from({ length: quality === "desktop" ? 18 : 10 }, (_, index) => {
        const y = 8 + index * 3.25;
        return cityBox(
          `spire-window-${index}`,
          [42, y, -35.83 + index * 0.018],
          [4.5 - index * 0.08, 0.24, 0.055],
          index % 4 === 0 ? "#ef8cff" : "#7ce5ec",
        );
      }),
    [quality],
  );
  const poweredWindows = useMemo(
    () => filterPoweredCityFeatures(windows, powerState),
    [powerState, windows],
  );
  const poweredBeacon = isCityLightPowered(
    "afterlight-spire-crown",
    [42, 60.5, -42],
    powerState,
  );

  return (
    <group name="afterlight-spire" position={[42, 0, -42]}>
      <mesh castShadow={shadows} position={[0, 20, 0]} receiveShadow>
        <cylinderGeometry args={[5.4, 8.4, 40, 8]} />
        <meshStandardMaterial
          color="#263a43"
          metalness={0.36}
          roughness={0.38}
        />
      </mesh>
      <mesh
        castShadow={shadows}
        position={[0, 48, 0]}
        rotation={[0, Math.PI / 8, 0]}
      >
        <cylinderGeometry args={[2.2, 5.35, 26, 8]} />
        <meshStandardMaterial
          color="#344c55"
          metalness={0.42}
          roughness={0.32}
        />
      </mesh>
      <mesh
        castShadow={shadows}
        position={[0, 65, 0]}
        rotation={[0, Math.PI / 8, 0]}
      >
        <coneGeometry args={[2.2, 12, 8]} />
        <meshStandardMaterial color="#b8c5bd" metalness={0.5} roughness={0.3} />
      </mesh>
      {poweredBeacon ? (
        <>
          <mesh position={[0, 60.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[2.7, 0.17, 8, 28]} />
            <meshBasicMaterial color="#f093ff" toneMapped={false} />
          </mesh>
          <mesh position={[0, 72.5, 0]}>
            <sphereGeometry args={[0.46, 10, 8]} />
            <meshBasicMaterial color="#ffb3f6" toneMapped={false} />
          </mesh>
        </>
      ) : null}
      {quality === "desktop" && poweredBeacon ? (
        <pointLight
          color="#ec8cff"
          distance={32}
          intensity={12}
          position={[0, 57, 0]}
        />
      ) : null}
      <group position={[-42, 0, 42]}>
        <InstancedPrimitives
          depthWrite={false}
          instances={poweredWindows}
          material="basic"
          toneMapped={false}
        />
      </group>
    </group>
  );
}

function AuroraVault({
  powerState,
  quality,
  shadows,
}: {
  powerState: CityPowerState;
  quality: CityQuality;
  shadows: boolean;
}) {
  const walls = useMemo<BoxInstance[]>(
    () => [
      cityBox("vault-west-wall", [4.85, 3.6, -42], [0.7, 7.2, 17], "#47585c"),
      cityBox("vault-east-wall", [23.15, 3.6, -42], [0.7, 7.2, 17], "#47585c"),
      cityBox(
        "vault-north-west",
        [8.1, 3.6, -33.85],
        [5.8, 7.2, 0.7],
        "#47585c",
      ),
      cityBox(
        "vault-north-east",
        [19.9, 3.6, -33.85],
        [5.8, 7.2, 0.7],
        "#47585c",
      ),
      cityBox(
        "vault-south-west",
        [8.1, 3.6, -50.15],
        [5.8, 7.2, 0.7],
        "#47585c",
      ),
      cityBox(
        "vault-south-east",
        [19.9, 3.6, -50.15],
        [5.8, 7.2, 0.7],
        "#47585c",
      ),
    ],
    [],
  );
  const fins = useMemo<BoxInstance[]>(
    () =>
      Array.from({ length: quality === "desktop" ? 9 : 5 }, (_, index) =>
        cityBox(
          `vault-fin-${index}`,
          [6.5 + index * (quality === "desktop" ? 1.85 : 3.7), 4.1, -50.2],
          [0.32, 7.4, 0.55],
          "#91a4a3",
        ),
      ),
    [quality],
  );
  const poweredPortal = isCityLightPowered(
    "aurora-vault-portal",
    [14, 3.35, -50.78],
    powerState,
  );
  return (
    <group name="aurora-exchange-vault">
      <mesh position={[14, 0.34, -42]} receiveShadow>
        <boxGeometry args={[18.3, 0.08, 16.3]} />
        <meshStandardMaterial
          color="#26373a"
          metalness={0.3}
          roughness={0.68}
        />
      </mesh>
      <InstancedPrimitives
        castShadow={shadows}
        instances={walls}
        metalness={0.18}
        receiveShadow
        roughness={0.62}
      />
      <mesh position={[14, 7.5, -42]}>
        <boxGeometry args={[16.5, 0.65, 14.5]} />
        <meshStandardMaterial
          color="#182d33"
          metalness={0.55}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[14, 2.25, -42]}>
        <cylinderGeometry args={[1.45, 1.7, 3.8, 12]} />
        <meshStandardMaterial
          color="#23383d"
          metalness={0.62}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[14, 4.2, -42]}>
        <cylinderGeometry args={[0.76, 1.2, 0.22, 24]} />
        <meshBasicMaterial color="#71e6f2" toneMapped={false} />
      </mesh>
      <InstancedPrimitives instances={fins} metalness={0.22} roughness={0.54} />
      <mesh position={[14, 3.35, -50.58]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.55, 2.55, 0.32, 24]} />
        <meshStandardMaterial
          color="#1b333b"
          metalness={0.84}
          roughness={0.22}
        />
      </mesh>
      {poweredPortal ? (
        <>
          <mesh position={[14, 3.35, -50.78]}>
            <torusGeometry args={[2.15, 0.18, 10, 36]} />
            <meshBasicMaterial color="#71e6f2" toneMapped={false} />
          </mesh>
          <mesh position={[14, 3.35, -33.48]}>
            <boxGeometry args={[4.7, 0.12, 0.08]} />
            <meshBasicMaterial color="#71e6f2" toneMapped={false} />
          </mesh>
        </>
      ) : null}
      {quality === "desktop" && poweredPortal ? (
        <pointLight
          color="#5de4ef"
          distance={20}
          intensity={8}
          position={[14, 3.4, -51]}
        />
      ) : null}
    </group>
  );
}

function PaintedRow({ shadows }: { shadows: boolean }) {
  const houses = useMemo<BoxInstance[]>(
    () =>
      ["#cf7281", "#59a2a2", "#d69a5f", "#8e7aaf", "#72a176"].map(
        (color, index) =>
          cityBox(
            `safehouse-${index}`,
            [-78 + index * 4, 4.4, 70],
            [3.65, 8.7, 8.5],
            color,
          ),
      ),
    [],
  );
  const roofs = useMemo<BoxInstance[]>(
    () =>
      houses.map((house) =>
        cityBox(
          `${house.id}-roof`,
          [house.position[0], 9.5, house.position[2]],
          [4.4, 3, 7.1],
          "#342f38",
          Math.PI / 4,
        ),
      ),
    [houses],
  );
  const fronts = useMemo<BoxInstance[]>(
    () =>
      houses.flatMap((house, index) => [
        cityBox(
          `${house.id}-window-low`,
          [house.position[0], 3.4, 74.27],
          [1.85, 1.15, 0.08],
          index === 2 ? "#ffcf70" : "#a7dfe0",
        ),
        cityBox(
          `${house.id}-window-high`,
          [house.position[0], 6.4, 74.27],
          [1.85, 1.15, 0.08],
          "#ffd486",
        ),
      ]),
    [houses],
  );
  const doors = useMemo<BoxInstance[]>(
    () =>
      houses.map((house, index) =>
        cityBox(
          `${house.id}-door`,
          [house.position[0], 1.55, 74.34],
          [1.05, 2.55, 0.12],
          index === 2 ? "#d95455" : "#23383b",
        ),
      ),
    [houses],
  );
  return (
    <group name="painted-row-safehouse">
      <InstancedPrimitives
        castShadow={shadows}
        instances={houses}
        receiveShadow
        roughness={0.76}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={roofs}
        roughness={0.82}
        shape="cone"
      />
      <InstancedPrimitives instances={fronts} material="basic" />
      <InstancedPrimitives instances={doors} roughness={0.68} />
      <mesh position={[-70, 0.36, 75.3]}>
        <boxGeometry args={[19, 0.5, 1.8]} />
        <meshStandardMaterial color="#526263" roughness={0.86} />
      </mesh>
    </group>
  );
}

function CaliforniaCableCar({ shadows }: { shadows: boolean }) {
  const body = useMemo<BoxInstance[]>(
    () => [
      cityBox("sf-cable-car-chassis", [0, 0.42, 0], [3.55, 0.42, 7], "#542d27"),
      cityBox(
        "sf-cable-car-lower",
        [0, 1.08, 0],
        [3.32, 0.95, 6.65],
        "#a53d35",
      ),
      cityBox("sf-cable-car-cabin", [0, 2.12, 0], [3.16, 1.25, 4.3], "#f0d7a7"),
      cityBox(
        "sf-cable-car-front",
        [0, 2.05, -2.72],
        [3.18, 1.35, 1.1],
        "#bd4d3e",
      ),
      cityBox(
        "sf-cable-car-rear",
        [0, 2.05, 2.72],
        [3.18, 1.35, 1.1],
        "#bd4d3e",
      ),
      cityBox("sf-cable-car-roof", [0, 3.05, 0], [3.72, 0.3, 6.9], "#eee0bb"),
    ],
    [],
  );
  const frames = useMemo<BoxInstance[]>(
    () =>
      [-2.05, -0.68, 0.68, 2.05].flatMap((z, index) => [
        cityBox(
          `sf-cable-car-window-west-${index}`,
          [-1.59, 2.2, z],
          [0.08, 0.86, 0.96],
          "#427485",
        ),
        cityBox(
          `sf-cable-car-window-east-${index}`,
          [1.59, 2.2, z],
          [0.08, 0.86, 0.96],
          "#427485",
        ),
      ]),
    [],
  );
  const trim = useMemo<BoxInstance[]>(
    () => [
      cityBox(
        "sf-cable-car-belt-west",
        [-1.67, 1.45, 0],
        [0.09, 0.16, 6.5],
        "#f3c96d",
      ),
      cityBox(
        "sf-cable-car-belt-east",
        [1.67, 1.45, 0],
        [0.09, 0.16, 6.5],
        "#f3c96d",
      ),
      cityBox(
        "sf-cable-car-board-front",
        [0, 2.64, -3.3],
        [2.22, 0.45, 0.08],
        "#263637",
      ),
      cityBox(
        "sf-cable-car-board-rear",
        [0, 2.64, 3.3],
        [2.22, 0.45, 0.08],
        "#263637",
      ),
    ],
    [],
  );

  return (
    <group
      name="san-francisco-cable-car"
      position={SF_CABLE_CAR_POSITION}
      userData={{ cameraCollision: false }}
    >
      <InstancedPrimitives
        castShadow={shadows}
        instances={body}
        metalness={0.08}
        receiveShadow
        roughness={0.68}
      />
      <InstancedPrimitives
        depthWrite={false}
        instances={frames}
        metalness={0.32}
        opacity={0.82}
        roughness={0.18}
        transparent
      />
      <InstancedPrimitives instances={trim} metalness={0.3} roughness={0.44} />
      {[-1.25, 1.25].flatMap((x) =>
        [-2.25, 2.25].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.08, z]}>
            <cylinderGeometry args={[0.46, 0.46, 0.32, 10]} />
            <meshStandardMaterial
              color="#202426"
              metalness={0.55}
              roughness={0.5}
            />
          </mesh>
        )),
      )}
      <mesh position={[0, 4.55, 0.15]} rotation={[0.14, 0, -0.18]}>
        <cylinderGeometry args={[0.07, 0.07, 3.1, 6]} />
        <meshStandardMaterial
          color="#343f3f"
          metalness={0.72}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, 3.43, -2.6]}>
        <sphereGeometry args={[0.25, 10, 8]} />
        <meshStandardMaterial
          color="#d9ae4d"
          metalness={0.78}
          roughness={0.24}
        />
      </mesh>
    </group>
  );
}

const SF_STREET_SIGNS = [
  {
    crossStreet: "BRANNAN ST",
    position: [61.2, 0.3, 61.2] as CityVec3,
    street: "3RD ST",
  },
  {
    crossStreet: "3RD ST",
    position: [5.4, 0.3, 5.4] as CityVec3,
    street: "MARKET ST",
  },
  {
    crossStreet: "POWELL ST",
    position: [-22.6, 0.3, 33.4] as CityVec3,
    street: "CALIFORNIA ST",
  },
  {
    crossStreet: "MISSION ST",
    position: [89.4, 0.3, 5.4] as CityVec3,
    street: "THE EMBARCADERO",
  },
  {
    crossStreet: "HAYES ST",
    position: [-78.6, 0.3, 61.4] as CityVec3,
    street: "STEINER ST",
  },
] as const;

function SanFranciscoStreetSigns() {
  return (
    <group
      name="san-francisco-street-signs"
      userData={{ cameraCollision: false }}
    >
      {SF_STREET_SIGNS.map((sign) => (
        <StreetSign
          crossStreet={sign.crossStreet}
          key={sign.street}
          position={sign.position}
          street={sign.street}
        />
      ))}
    </group>
  );
}

function StreetSign({
  crossStreet,
  position,
  street,
}: {
  readonly crossStreet: string;
  readonly position: CityVec3;
  readonly street: string;
}) {
  const streetTexture = useStreetSignTexture(street);
  const crossStreetTexture = useStreetSignTexture(crossStreet);

  return (
    <group position={position}>
      <mesh position={[0, 2.55, 0]}>
        <cylinderGeometry args={[0.1, 0.13, 5.1, 8]} />
        <meshStandardMaterial
          color="#66716d"
          metalness={0.55}
          roughness={0.44}
        />
      </mesh>
      {streetTexture ? (
        <mesh position={[0, 4.92, 0.04]}>
          <planeGeometry args={[2.45, 0.52]} />
          <meshBasicMaterial map={streetTexture} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {crossStreetTexture ? (
        <mesh position={[0.04, 4.58, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[2.45, 0.52]} />
          <meshBasicMaterial map={crossStreetTexture} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}

function useStreetSignTexture(label: string) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 112;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#176b54";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#f4f0dc";
    context.lineWidth = 8;
    context.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    context.fillStyle = "#ffffff";
    context.font = `700 ${label.length > 14 ? 47 : 58}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
    const result = new THREE.CanvasTexture(canvas);
    result.anisotropy = 8;
    result.colorSpace = THREE.SRGBColorSpace;
    result.needsUpdate = true;
    return result;
  }, [label]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function GridSeven({
  powerState,
  quality,
  shadows,
}: {
  powerState: CityPowerState;
  quality: CityQuality;
  shadows: boolean;
}) {
  const equipment = useMemo<BoxInstance[]>(
    () => [
      cityBox("grid-pad", [-70, 0.48, -42], [18, 0.62, 18], "#354547"),
      cityBox("grid-control", [-75, 2.3, -47], [6, 4.2, 5], "#596667"),
      cityBox("grid-transformer-a", [-66, 1.45, -46], [3.8, 2.5, 3], "#4f6764"),
      cityBox("grid-transformer-b", [-66, 1.45, -39], [3.8, 2.5, 3], "#4f6764"),
      cityBox("grid-transformer-c", [-74, 1.45, -37], [3.8, 2.5, 3], "#59625d"),
    ],
    [],
  );
  const frames = useMemo<BoxInstance[]>(() => {
    const values: BoxInstance[] = [];
    for (const x of [-76, -70, -64]) {
      values.push(
        cityBox(
          `grid-frame-l-${x}`,
          [x - 1.5, 4.1, -40],
          [0.18, 7, 0.18],
          "#778285",
        ),
        cityBox(
          `grid-frame-r-${x}`,
          [x + 1.5, 4.1, -40],
          [0.18, 7, 0.18],
          "#778285",
        ),
        cityBox(
          `grid-frame-t-${x}`,
          [x, 7.4, -40],
          [3.2, 0.18, 0.18],
          "#778285",
        ),
      );
    }
    return values;
  }, []);
  const insulators = useMemo<BoxInstance[]>(
    () =>
      Array.from({ length: quality === "desktop" ? 12 : 6 }, (_, index) =>
        cityBox(
          `grid-insulator-${index}`,
          [-77 + (index % 6) * 2.8, 3.4 + Math.floor(index / 6) * 2.3, -39.8],
          [0.42, 0.58, 0.42],
          index % 3 === 0 ? "#d8ff62" : "#8ccbd0",
        ),
      ),
    [quality],
  );
  const poweredInsulators = useMemo(
    () => filterPoweredCityFeatures(insulators, powerState),
    [insulators, powerState],
  );
  const poweredSubstation = isCityLightPowered(
    "grid-seven-substation-light",
    [-70, 6, -41],
    powerState,
  );
  return (
    <group name="grid-seven-substation">
      <InstancedPrimitives
        castShadow={shadows}
        instances={equipment}
        metalness={0.34}
        receiveShadow
        roughness={0.48}
      />
      <InstancedPrimitives
        instances={frames}
        metalness={0.74}
        roughness={0.3}
      />
      <InstancedPrimitives
        instances={poweredInsulators}
        material="basic"
        shape="cylinder"
        toneMapped={false}
      />
      {quality === "desktop" && poweredSubstation ? (
        <pointLight
          color="#c9ff5f"
          distance={18}
          intensity={6}
          position={[-70, 6, -41]}
        />
      ) : null}
    </group>
  );
}

function BreakwaterTerminal({
  powerState,
  quality,
  shadows,
}: {
  powerState: CityPowerState;
  quality: CityQuality;
  shadows: boolean;
}) {
  const dockLights = useMemo<BoxInstance[]>(
    () =>
      [-56, -18, 28, 72].flatMap((z, row) =>
        [109, 122, 136, 148].map((x, column) =>
          cityBox(
            `dock-light-${row}-${column}`,
            [x, 1.15, z],
            [0.28, 0.28, 0.28],
            row % 2 ? "#7ce0db" : "#ffd070",
          ),
        ),
      ),
    [],
  );
  const poweredDockLights = useMemo(
    () => filterPoweredCityFeatures(dockLights, powerState),
    [dockLights, powerState],
  );
  const poweredTerminalLight = isCityLightPowered(
    "breakwater-terminal-face",
    [103.02, 15, 14],
    powerState,
  );
  return (
    <group name="breakwater-terminal">
      <mesh castShadow={shadows} position={[98, 4, 14]} receiveShadow>
        <boxGeometry args={[10, 8, 18]} />
        <meshStandardMaterial color="#8c806e" roughness={0.73} />
      </mesh>
      <mesh castShadow={shadows} position={[98, 14, 14]}>
        <boxGeometry args={[5, 12, 5]} />
        <meshStandardMaterial color="#b6a783" roughness={0.69} />
      </mesh>
      <mesh
        castShadow={shadows}
        position={[98, 21.5, 14]}
        rotation={[0, Math.PI / 4, 0]}
      >
        <coneGeometry args={[3.8, 4.2, 4]} />
        <meshStandardMaterial
          color="#3b766e"
          metalness={0.24}
          roughness={0.62}
        />
      </mesh>
      <mesh position={[103.02, 15, 14]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[1.35, 24]} />
        <meshStandardMaterial color="#f3ead4" roughness={0.72} />
      </mesh>
      <mesh position={[103.08, 15, 14]} rotation={[0.55, 0, 0]}>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
        <meshBasicMaterial color="#293536" />
      </mesh>
      <mesh position={[103.1, 15, 14]} rotation={[-0.92, 0, 0]}>
        <boxGeometry args={[0.05, 0.62, 0.05]} />
        <meshBasicMaterial color="#293536" />
      </mesh>
      <InstancedPrimitives
        instances={
          quality === "desktop"
            ? poweredDockLights
            : poweredDockLights.slice(0, 8)
        }
        material="basic"
        shape="sphere"
        toneMapped={false}
      />
      {quality === "desktop" && poweredTerminalLight ? (
        <pointLight
          color="#ffd17b"
          distance={26}
          intensity={8}
          position={[100, 13, 14]}
        />
      ) : null}
    </group>
  );
}

function IndustrialWaterfront({ shadows }: { shadows: boolean }) {
  const cranes = useMemo<BoxInstance[]>(() => {
    const values: BoxInstance[] = [];
    [118, 142].forEach((x, index) => {
      const z = index === 0 ? 72 : -62;
      values.push(
        cityBox(`crane-mast-${index}`, [x, 10, z], [0.72, 20, 0.72], "#d09a45"),
        cityBox(
          `crane-boom-${index}`,
          [x + 7, 18.5, z],
          [14.5, 0.58, 0.58],
          "#d09a45",
        ),
        cityBox(
          `crane-cab-${index}`,
          [x + 1.4, 16.5, z],
          [2.8, 2, 2.6],
          "#526468",
        ),
        cityBox(
          `crane-line-${index}`,
          [x + 12.5, 12.5, z],
          [0.08, 11.5, 0.08],
          "#718083",
        ),
      );
    });
    return values;
  }, []);
  return (
    <group name="industrial-waterfront">
      <InstancedPrimitives
        castShadow={shadows}
        instances={cranes}
        metalness={0.52}
        roughness={0.43}
      />
      <mesh castShadow={shadows} position={[70, 4.1, 70]} receiveShadow>
        <boxGeometry args={[17, 7.8, 17]} />
        <meshStandardMaterial
          color="#4a5759"
          metalness={0.12}
          roughness={0.72}
        />
      </mesh>
      <mesh position={[70, 8.3, 70]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[12, 3.4, 4]} />
        <meshStandardMaterial
          color="#6b4e49"
          metalness={0.22}
          roughness={0.64}
        />
      </mesh>
    </group>
  );
}

function CityHills({
  powerState,
  quality,
}: {
  powerState: CityPowerState;
  quality: CityQuality;
}) {
  const backdrop = useMemo(
    () => createSanFranciscoBackdrop(quality),
    [quality],
  );
  const poweredAntenna = isCityLightPowered(
    "city-hills-antenna",
    [-118, 34, -78],
    powerState,
  );
  return (
    <group name="city-hills">
      <mesh position={[-162, -20, -25]} receiveShadow scale={[1.45, 0.68, 1.2]}>
        <sphereGeometry args={[70, quality === "desktop" ? 20 : 12, 10]} />
        <meshStandardMaterial color="#6f8b68" roughness={1} />
      </mesh>
      <mesh position={[205, -19, 12]} receiveShadow scale={[1.35, 0.42, 1]}>
        <sphereGeometry args={[82, quality === "desktop" ? 20 : 12, 10]} />
        <meshStandardMaterial color="#668564" roughness={1} />
      </mesh>
      <InstancedPrimitives
        instances={backdrop.houses}
        metalness={0.02}
        roughness={0.84}
      />
      <InstancedPrimitives
        instances={backdrop.roofs}
        roughness={0.88}
        shape="cone"
      />
      <mesh position={[-118, 15, -78]}>
        <cylinderGeometry args={[0.28, 0.5, 36, 6]} />
        <meshStandardMaterial
          color="#9b5351"
          metalness={0.56}
          roughness={0.48}
        />
      </mesh>
      {poweredAntenna ? (
        <mesh position={[-118, 34, -78]}>
          <sphereGeometry args={[0.45, 8, 6]} />
          <meshBasicMaterial color="#ff5e68" toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}

function MissionZoneBeacon({
  progress,
  reducedMotion,
  zone,
}: {
  progress: number;
  reducedMotion: boolean;
  zone: MissionZone;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const normalizedProgress = Math.max(0, Math.min(1, progress));

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const pulse = reducedMotion
      ? 1
      : 1 + Math.sin(clock.elapsedTime * 2.1) * 0.055;
    const progressScale = 0.92 + normalizedProgress * 0.13;
    groupRef.current.scale.setScalar(pulse * progressScale);
    groupRef.current.rotation.y = reducedMotion ? 0 : clock.elapsedTime * 0.1;
  });

  return (
    <group
      name={`mission-zone-${zone.id}`}
      position={zone.position}
      ref={groupRef}
      userData={{ cameraCollision: false }}
    >
      <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[zone.radius * 0.72, zone.radius * 0.78, 64]} />
        <meshBasicMaterial
          color={zone.accent}
          opacity={0.74}
          side={2}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.15, zone.radius * 0.56, 5, 32, 1, true]} />
        <meshBasicMaterial
          color={zone.accent}
          depthWrite={false}
          opacity={0.09}
          side={2}
          toneMapped={false}
          transparent
        />
      </mesh>
      <pointLight
        color={zone.accent}
        distance={zone.radius * 1.7}
        intensity={5}
        position={[0, 2, 0]}
      />
    </group>
  );
}

function cableHeightAt(z: number): number {
  const points = BRIDGE_CABLE_POINTS;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index] as CityVec3;
    const end = points[index + 1] as CityVec3;
    if (z <= start[2] && z >= end[2]) {
      const t = (z - start[2]) / (end[2] - start[2]);
      return start[1] + (end[1] - start[1]) * t;
    }
  }
  return 3.2;
}

function cityBox(
  id: string,
  position: CityVec3,
  scale: CityVec3,
  color: string,
  rotationY = 0,
): BoxInstance {
  return { color, id, position, rotationY, scale };
}
