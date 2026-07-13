"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Group, Mesh, MathUtils, Object3D } from "three";

import {
  clampPresentationSignal,
  getModelGeometryDetail,
  getVehicleAppearance,
  type VehicleAppearance,
  type VehicleVisualKind,
} from "./appearance";
import { ProfiledVanBody } from "./profiled-van-body";
import type {
  ModelQuality,
  PoliceInterceptorModelProps,
  VehicleModelProps,
} from "./types";

export interface VehicleModelDimensions {
  readonly width: number;
  readonly length: number;
  readonly wheelBase: number;
  readonly wheelTrack: number;
  readonly wheelRadius: number;
  readonly wheelWidth: number;
  readonly bodyY: number;
  readonly bodyHeight: number;
  readonly cabinHeight: number;
  readonly cabinLength: number;
  readonly cabinZ: number;
}

export interface RoadVehicleModelProps extends VehicleModelProps {
  readonly kind: VehicleVisualKind;
  readonly emergencyLights?: boolean;
  readonly sirenPhase?: number;
}

const VEHICLE_DIMENSIONS: Readonly<
  Record<VehicleVisualKind, VehicleModelDimensions>
> = Object.freeze({
  "hero-coupe": Object.freeze({
    width: 1.92,
    length: 4.55,
    wheelBase: 2.82,
    wheelTrack: 1.72,
    wheelRadius: 0.37,
    wheelWidth: 0.25,
    bodyY: 0.62,
    bodyHeight: 0.62,
    cabinHeight: 0.67,
    cabinLength: 2.12,
    cabinZ: 0.2,
  }),
  "traffic-sedan": Object.freeze({
    width: 1.82,
    length: 4.5,
    wheelBase: 2.72,
    wheelTrack: 1.62,
    wheelRadius: 0.35,
    wheelWidth: 0.23,
    bodyY: 0.64,
    bodyHeight: 0.68,
    cabinHeight: 0.76,
    cabinLength: 2.34,
    cabinZ: 0.16,
  }),
  "traffic-van": Object.freeze({
    width: 2.04,
    length: 5.15,
    wheelBase: 3.25,
    wheelTrack: 1.78,
    wheelRadius: 0.39,
    wheelWidth: 0.27,
    bodyY: 0.74,
    bodyHeight: 0.82,
    cabinHeight: 1.3,
    cabinLength: 3.18,
    cabinZ: 0.06,
  }),
  "armored-courier": Object.freeze({
    width: 2.22,
    length: 5.72,
    wheelBase: 3.58,
    wheelTrack: 1.94,
    wheelRadius: 0.45,
    wheelWidth: 0.31,
    bodyY: 0.82,
    bodyHeight: 0.92,
    cabinHeight: 1.42,
    cabinLength: 3.68,
    cabinZ: 0.22,
  }),
  "police-interceptor": Object.freeze({
    width: 1.94,
    length: 4.82,
    wheelBase: 2.92,
    wheelTrack: 1.73,
    wheelRadius: 0.37,
    wheelWidth: 0.26,
    bodyY: 0.65,
    bodyHeight: 0.68,
    cabinHeight: 0.72,
    cabinLength: 2.25,
    cabinZ: 0.1,
  }),
});

const SMOKE_PUFFS = [
  { x: -0.09, phase: 0, scale: 0.22 },
  { x: 0.07, phase: 0.73, scale: 0.17 },
  { x: -0.03, phase: 1.41, scale: 0.13 },
] as const;

function Wheel({
  appearance,
  front,
  quality,
  radius,
  spin,
  steering,
  width,
  x,
  z,
}: {
  appearance: VehicleAppearance;
  front: boolean;
  quality: ModelQuality;
  radius: number;
  spin: number;
  steering: number;
  width: number;
  x: number;
  z: number;
}) {
  const detail = getModelGeometryDetail(quality);
  return (
    <group
      position={[x, radius, z]}
      rotation={[0, front ? steering * 0.48 : 0, 0]}
    >
      <group rotation={[spin, 0, 0]}>
        <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry
            args={[radius, radius, width, detail.radialSegments]}
          />
          <meshStandardMaterial
            color="#101416"
            roughness={0.82}
            metalness={0.04}
          />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry
            args={[
              radius * 0.58,
              radius * 0.58,
              width + 0.012,
              detail.radialSegments,
            ]}
          />
          <meshStandardMaterial
            color={appearance.rim}
            metalness={0.72}
            roughness={0.28}
          />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry
            args={[radius * 0.18, radius * 0.18, width + 0.025, 8]}
          />
          <meshStandardMaterial
            color="#1c262a"
            metalness={0.75}
            roughness={0.3}
          />
        </mesh>
      </group>
      {quality === "desktop" ? (
        <mesh
          position={[x > 0 ? -width * 0.52 : width * 0.52, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry
            args={[radius * 0.43, radius * 0.43, 0.025, detail.radialSegments]}
          />
          <meshStandardMaterial
            color="#7d8585"
            metalness={0.82}
            roughness={0.32}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function DisabledSmoke({
  enabled,
  hoodZ,
  quality,
}: {
  enabled: boolean;
  hoodZ: number;
  quality: ModelQuality;
}) {
  const rootRef = useRef<Group>(null);
  const puffsRef = useRef<Array<Mesh | null>>([]);
  useFrame(({ clock }) => {
    const root = rootRef.current;
    if (!root) return;
    root.visible = enabled;
    if (!enabled) return;
    for (let index = 0; index < SMOKE_PUFFS.length; index += 1) {
      const puff = puffsRef.current[index];
      if (!puff) continue;
      const definition = SMOKE_PUFFS[index];
      const cycle = (clock.elapsedTime * 0.27 + definition.phase) % 1;
      puff.position.y = cycle * 1.35;
      puff.position.x =
        definition.x + Math.sin(cycle * 4.8 + definition.phase) * 0.12;
      const scale = definition.scale * (0.55 + cycle * 1.4);
      puff.scale.setScalar(scale);
      const material = puff.material;
      if (!Array.isArray(material)) material.opacity = (1 - cycle) * 0.24;
    }
  });
  if (quality === "mobile") return null;
  return (
    <group ref={rootRef} position={[0, 1.15, hoodZ]} visible={enabled}>
      {SMOKE_PUFFS.map((puff, index) => (
        <mesh
          key={puff.phase}
          ref={(mesh) => {
            puffsRef.current[index] = mesh;
          }}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color="#374044"
            depthWrite={false}
            opacity={0.2}
            roughness={1}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

function Cabin({
  appearance,
  dimensions,
  kind,
  quality,
}: {
  appearance: VehicleAppearance;
  dimensions: VehicleModelDimensions;
  kind: VehicleVisualKind;
  quality: ModelQuality;
}) {
  const van = kind === "traffic-van" || kind === "armored-courier";
  const armored = kind === "armored-courier";
  const roofY = dimensions.bodyY + dimensions.cabinHeight * 0.62;
  const sideX = dimensions.width * 0.405;
  if (van) {
    return (
      <group>
        <mesh castShadow receiveShadow position={[0, roofY, dimensions.cabinZ]}>
          <boxGeometry
            args={[
              dimensions.width * 0.88,
              dimensions.cabinHeight,
              dimensions.cabinLength,
            ]}
          />
          <meshStandardMaterial
            color={appearance.body}
            metalness={armored ? 0.35 : 0.18}
            roughness={armored ? 0.72 : 0.53}
          />
        </mesh>
        <mesh
          position={[0, roofY + 0.12, -dimensions.cabinLength * 0.5 - 0.006]}
        >
          <boxGeometry
            args={[
              dimensions.width * 0.66,
              dimensions.cabinHeight * 0.46,
              0.035,
            ]}
          />
          <meshStandardMaterial
            color={appearance.cabin}
            emissive="#223c44"
            emissiveIntensity={0.08}
            metalness={0.48}
            roughness={0.21}
          />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[
              side * (dimensions.width * 0.445 + 0.006),
              roofY + 0.14,
              -0.82,
            ]}
          >
            <boxGeometry
              args={[
                0.025,
                dimensions.cabinHeight * 0.42,
                dimensions.cabinLength * 0.31,
              ]}
            />
            <meshStandardMaterial
              color={appearance.cabin}
              metalness={0.4}
              roughness={0.24}
            />
          </mesh>
        ))}
        <mesh
          castShadow
          position={[0, roofY + dimensions.cabinHeight * 0.52, 0.12]}
        >
          <boxGeometry
            args={[
              dimensions.width * 0.91,
              0.09,
              dimensions.cabinLength * 0.94,
            ]}
          />
          <meshStandardMaterial
            color={appearance.secondary}
            metalness={0.42}
            roughness={0.57}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh
        castShadow
        position={[0, roofY, dimensions.cabinZ]}
        scale={[1, 1, 0.96]}
      >
        <boxGeometry
          args={[
            dimensions.width * 0.76,
            dimensions.cabinHeight,
            dimensions.cabinLength,
          ]}
        />
        <meshStandardMaterial
          color={appearance.secondary}
          metalness={0.32}
          roughness={0.4}
        />
      </mesh>
      <mesh
        position={[
          0,
          roofY + 0.02,
          dimensions.cabinZ - dimensions.cabinLength * 0.49 - 0.01,
        ]}
      >
        <boxGeometry
          args={[dimensions.width * 0.64, dimensions.cabinHeight * 0.66, 0.035]}
        />
        <meshStandardMaterial
          color={appearance.cabin}
          emissive="#24414a"
          emissiveIntensity={0.1}
          metalness={0.58}
          roughness={0.18}
        />
      </mesh>
      <mesh
        position={[
          0,
          roofY + 0.01,
          dimensions.cabinZ + dimensions.cabinLength * 0.49 + 0.01,
        ]}
      >
        <boxGeometry
          args={[dimensions.width * 0.62, dimensions.cabinHeight * 0.62, 0.035]}
        />
        <meshStandardMaterial
          color={appearance.cabin}
          metalness={0.55}
          roughness={0.2}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * sideX, roofY + 0.02, dimensions.cabinZ]}
        >
          <mesh>
            <boxGeometry
              args={[
                0.035,
                dimensions.cabinHeight * 0.58,
                dimensions.cabinLength * 0.72,
              ]}
            />
            <meshStandardMaterial
              color={appearance.cabin}
              metalness={0.52}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[side * 0.012, 0, 0]}>
            <boxGeometry args={[0.025, dimensions.cabinHeight * 0.72, 0.055]} />
            <meshStandardMaterial
              color={appearance.trim}
              metalness={0.6}
              roughness={0.35}
            />
          </mesh>
        </group>
      ))}
      <mesh
        castShadow
        position={[0, roofY + dimensions.cabinHeight * 0.52, dimensions.cabinZ]}
      >
        <boxGeometry
          args={[dimensions.width * 0.72, 0.085, dimensions.cabinLength * 0.82]}
        />
        <meshStandardMaterial
          color={appearance.body}
          metalness={0.35}
          roughness={0.42}
        />
      </mesh>
      {quality === "desktop" ? (
        <>
          <mesh
            castShadow
            position={[
              -0.31,
              dimensions.bodyY + 0.43,
              dimensions.cabinZ + 0.12,
            ]}
          >
            <boxGeometry args={[0.35, 0.52, 0.48]} />
            <meshStandardMaterial color={appearance.interior} roughness={0.9} />
          </mesh>
          <mesh
            castShadow
            position={[0.31, dimensions.bodyY + 0.43, dimensions.cabinZ + 0.12]}
          >
            <boxGeometry args={[0.35, 0.52, 0.48]} />
            <meshStandardMaterial color={appearance.interior} roughness={0.9} />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

function Lamps({
  appearance,
  brakeLights,
  damage,
  dimensions,
  dynamicHeadlight,
  headlights,
  quality,
}: {
  appearance: VehicleAppearance;
  brakeLights: boolean;
  damage: number;
  dimensions: VehicleModelDimensions;
  dynamicHeadlight: boolean;
  headlights: boolean;
  quality: ModelQuality;
}) {
  const frontZ = -dimensions.length * 0.5 - 0.012;
  const rearZ = dimensions.length * 0.5 + 0.012;
  const lampX = dimensions.width * 0.31;
  const lampY = dimensions.bodyY + 0.08;
  const brokenRight = damage > 0.72;
  const headlightTarget = useMemo(() => new Object3D(), []);
  return (
    <>
      {[-1, 1].map((side) => {
        const broken = side === 1 && brokenRight;
        return (
          <mesh key={`head-${side}`} position={[side * lampX, lampY, frontZ]}>
            <boxGeometry args={[dimensions.width * 0.21, 0.19, 0.045]} />
            <meshStandardMaterial
              color={broken ? "#332d27" : "#fff0be"}
              emissive={broken || !headlights ? "#181713" : "#ffe19a"}
              emissiveIntensity={broken ? 0 : headlights ? 3.8 : 0.12}
              metalness={0.1}
              roughness={0.28}
            />
          </mesh>
        );
      })}
      {[-1, 1].map((side) => (
        <mesh key={`tail-${side}`} position={[side * lampX, lampY, rearZ]}>
          <boxGeometry args={[dimensions.width * 0.2, 0.18, 0.045]} />
          <meshStandardMaterial
            color="#a62f35"
            emissive="#e53f4e"
            emissiveIntensity={brakeLights ? 4.2 : 0.65}
            roughness={0.34}
          />
        </mesh>
      ))}
      <mesh position={[0, lampY - 0.12, frontZ]}>
        <boxGeometry args={[dimensions.width * 0.34, 0.13, 0.04]} />
        <meshStandardMaterial
          color={appearance.secondary}
          metalness={0.72}
          roughness={0.31}
        />
      </mesh>
      {headlights && dynamicHeadlight && quality === "desktop" ? (
        <>
          <primitive
            object={headlightTarget}
            position={[0, lampY - 0.34, frontZ - 15]}
          />
          <spotLight
            angle={0.38}
            castShadow={false}
            color="#ffe7b0"
            decay={2}
            distance={18}
            intensity={42}
            penumbra={0.72}
            position={[0, lampY + 0.08, frontZ - 0.2]}
            target={headlightTarget}
          />
        </>
      ) : null}
    </>
  );
}

function HeroDetails({
  appearance,
  dimensions,
}: {
  appearance: VehicleAppearance;
  dimensions: VehicleModelDimensions;
}) {
  return (
    <>
      <mesh
        castShadow
        position={[0, dimensions.bodyY - 0.22, -dimensions.length * 0.06]}
      >
        <boxGeometry
          args={[dimensions.width + 0.08, 0.1, dimensions.length * 0.73]}
        />
        <meshStandardMaterial
          color={appearance.secondary}
          metalness={0.58}
          roughness={0.35}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[
            side * (dimensions.width * 0.5 + 0.012),
            dimensions.bodyY - 0.1,
            0.12,
          ]}
        >
          <boxGeometry args={[0.035, 0.11, dimensions.length * 0.65]} />
          <meshStandardMaterial
            color={appearance.trim}
            emissive={appearance.trim}
            emissiveIntensity={0.13}
            roughness={0.46}
          />
        </mesh>
      ))}
      <group position={[0, dimensions.bodyY + 0.44, dimensions.length * 0.42]}>
        <mesh castShadow>
          <boxGeometry args={[dimensions.width * 0.7, 0.07, 0.3]} />
          <meshStandardMaterial
            color={appearance.secondary}
            metalness={0.68}
            roughness={0.28}
          />
        </mesh>
        <mesh castShadow position={[-dimensions.width * 0.29, -0.18, 0]}>
          <boxGeometry args={[0.06, 0.35, 0.06]} />
          <meshStandardMaterial
            color={appearance.secondary}
            metalness={0.67}
            roughness={0.3}
          />
        </mesh>
        <mesh castShadow position={[dimensions.width * 0.29, -0.18, 0]}>
          <boxGeometry args={[0.06, 0.35, 0.06]} />
          <meshStandardMaterial
            color={appearance.secondary}
            metalness={0.67}
            roughness={0.3}
          />
        </mesh>
      </group>
    </>
  );
}

function VanDetails({
  appearance,
  dimensions,
  kind,
  quality,
}: {
  appearance: VehicleAppearance;
  dimensions: VehicleModelDimensions;
  kind: VehicleVisualKind;
  quality: ModelQuality;
}) {
  const armored = kind === "armored-courier";
  const rearZ = dimensions.length * 0.5 + 0.025;
  const doorY = dimensions.bodyY + dimensions.cabinHeight * 0.42;
  return (
    <>
      <mesh position={[0, doorY, rearZ]}>
        <boxGeometry
          args={[dimensions.width * 0.76, dimensions.cabinHeight * 0.76, 0.06]}
        />
        <meshStandardMaterial
          color={appearance.secondary}
          metalness={0.45}
          roughness={0.66}
        />
      </mesh>
      <mesh position={[0, doorY, rearZ + 0.035]}>
        <boxGeometry args={[0.055, dimensions.cabinHeight * 0.68, 0.035]} />
        <meshStandardMaterial
          color={appearance.trim}
          metalness={0.62}
          roughness={0.4}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`rear-jamb-${side}`}
          position={[side * dimensions.width * 0.39, doorY, rearZ + 0.075]}
        >
          <boxGeometry args={[0.065, dimensions.cabinHeight * 0.82, 0.055]} />
          <meshStandardMaterial
            color={appearance.trim}
            metalness={0.62}
            roughness={0.4}
          />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`rear-rail-${side}`}
          position={[
            0,
            doorY + side * dimensions.cabinHeight * 0.4,
            rearZ + 0.075,
          ]}
        >
          <boxGeometry args={[dimensions.width * 0.8, 0.065, 0.055]} />
          <meshStandardMaterial
            color={appearance.trim}
            metalness={0.62}
            roughness={0.4}
          />
        </mesh>
      ))}
      <mesh position={[0, dimensions.bodyY - 0.03, rearZ + 0.09]}>
        <boxGeometry args={[0.58, 0.18, 0.045]} />
        <meshBasicMaterial color="#dbe4dd" toneMapped={false} />
      </mesh>
      {armored ? (
        <>
          <mesh
            castShadow
            position={[0, dimensions.bodyY - 0.03, -dimensions.length * 0.51]}
          >
            <boxGeometry args={[dimensions.width * 0.78, 0.3, 0.16]} />
            <meshStandardMaterial
              color="#171e1f"
              metalness={0.7}
              roughness={0.45}
            />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * dimensions.width * 0.33, doorY, rearZ + 0.045]}
            >
              <cylinderGeometry args={[0.065, 0.065, 0.045, 8]} />
              <meshStandardMaterial
                color={appearance.trim}
                metalness={0.72}
                roughness={0.3}
              />
            </mesh>
          ))}
          {quality === "desktop"
            ? [-0.65, -0.22, 0.22, 0.65].map((x) => (
                <mesh key={x} position={[x, doorY + 0.46, rearZ + 0.05]}>
                  <sphereGeometry args={[0.035, 6, 4]} />
                  <meshStandardMaterial
                    color="#1b2222"
                    metalness={0.75}
                    roughness={0.35}
                  />
                </mesh>
              ))
            : null}
          {[-0.56, -0.19, 0.19, 0.56].map((x, index) => (
            <mesh
              key={`reflector-${x}`}
              position={[x, doorY - 0.28, rearZ + 0.11]}
              rotation={[0, 0, index % 2 === 0 ? 0.48 : -0.48]}
            >
              <boxGeometry args={[0.38, 0.075, 0.04]} />
              <meshBasicMaterial
                color={index % 2 === 0 ? "#d9ed57" : "#e35d4e"}
                toneMapped={false}
              />
            </mesh>
          ))}
        </>
      ) : (
        <>
          <mesh position={[0, dimensions.bodyY + 0.2, dimensions.width * 0.02]}>
            <boxGeometry
              args={[dimensions.width * 0.8, 0.09, dimensions.length * 0.62]}
            />
            <meshStandardMaterial
              color={appearance.secondary}
              roughness={0.65}
            />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={`rear-window-${side}`}
              position={[
                side * dimensions.width * 0.21,
                doorY + dimensions.cabinHeight * 0.18,
                rearZ + 0.11,
              ]}
            >
              <boxGeometry
                args={[
                  dimensions.width * 0.32,
                  dimensions.cabinHeight * 0.32,
                  0.045,
                ]}
              />
              <meshPhysicalMaterial
                clearcoat={0.6}
                color={appearance.cabin}
                emissive="#1c343a"
                emissiveIntensity={0.12}
                metalness={0.28}
                opacity={0.82}
                roughness={0.17}
                transparent
              />
            </mesh>
          ))}
        </>
      )}
    </>
  );
}

function PoliceDetails({
  appearance,
  dimensions,
  emergencyLights,
  phase,
  quality,
}: {
  appearance: VehicleAppearance;
  dimensions: VehicleModelDimensions;
  emergencyLights: boolean;
  phase: number;
  quality: ModelQuality;
}) {
  const leftIntensity = emergencyLights ? 1.4 + phase * 4.4 : 0.08;
  const rightIntensity = emergencyLights ? 1.4 + (1 - phase) * 4.4 : 0.08;
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[
            side * (dimensions.width * 0.5 + 0.012),
            dimensions.bodyY + 0.02,
            0.04,
          ]}
        >
          <boxGeometry args={[0.035, 0.34, dimensions.length * 0.58]} />
          <meshStandardMaterial
            color={appearance.secondary}
            metalness={0.45}
            roughness={0.47}
          />
        </mesh>
      ))}
      <group position={[0, 1.52, dimensions.cabinZ]}>
        <mesh castShadow>
          <boxGeometry args={[1.24, 0.11, 0.25]} />
          <meshStandardMaterial
            color="#172126"
            metalness={0.62}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[-0.36, 0.08, 0]}>
          <boxGeometry args={[0.43, 0.13, 0.2]} />
          <meshStandardMaterial
            color="#ed5263"
            emissive="#ff2849"
            emissiveIntensity={leftIntensity}
            roughness={0.22}
          />
        </mesh>
        <mesh position={[0.36, 0.08, 0]}>
          <boxGeometry args={[0.43, 0.13, 0.2]} />
          <meshStandardMaterial
            color="#58c8dc"
            emissive="#32bce0"
            emissiveIntensity={rightIntensity}
            roughness={0.22}
          />
        </mesh>
        {emergencyLights && quality === "desktop" ? (
          <>
            <pointLight
              color="#ff3352"
              distance={9}
              intensity={leftIntensity * 0.58}
              position={[-0.4, 0.3, 0]}
            />
            <pointLight
              color="#31bfe1"
              distance={9}
              intensity={rightIntensity * 0.58}
              position={[0.4, 0.3, 0]}
            />
          </>
        ) : null}
      </group>
      <group
        position={[0, dimensions.bodyY - 0.03, -dimensions.length * 0.5 - 0.16]}
      >
        <mesh>
          <boxGeometry args={[dimensions.width * 0.63, 0.11, 0.13]} />
          <meshStandardMaterial
            color="#151e22"
            metalness={0.72}
            roughness={0.4}
          />
        </mesh>
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, 0.18, 0]}>
            <boxGeometry args={[0.07, 0.43, 0.08]} />
            <meshStandardMaterial
              color="#151e22"
              metalness={0.72}
              roughness={0.4}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}

function DamageTreatment({
  damage,
  dimensions,
}: {
  damage: number;
  dimensions: VehicleModelDimensions;
}) {
  if (damage <= 0.08) return null;
  return (
    <>
      <mesh
        position={[
          dimensions.width * 0.32,
          dimensions.bodyY + 0.33,
          -dimensions.length * 0.31,
        ]}
        rotation={[-Math.PI / 2, 0, 0.35]}
      >
        <circleGeometry args={[0.28 + damage * 0.24, 9]} />
        <meshStandardMaterial
          color="#17191a"
          depthWrite={false}
          opacity={0.22 + damage * 0.45}
          roughness={1}
          transparent
        />
      </mesh>
      <mesh
        position={[
          -dimensions.width * 0.5 - 0.018,
          dimensions.bodyY + 0.05,
          -dimensions.length * 0.05,
        ]}
        rotation={[0, Math.PI / 2, damage * 0.12]}
      >
        <circleGeometry args={[0.19 + damage * 0.18, 8]} />
        <meshStandardMaterial
          color="#292827"
          depthWrite={false}
          opacity={0.18 + damage * 0.38}
          roughness={1}
          transparent
        />
      </mesh>
      {damage > 0.58 ? (
        <mesh
          castShadow
          position={[
            0,
            dimensions.bodyY - 0.3,
            -dimensions.length * 0.5 - 0.09,
          ]}
          rotation={[0, damage * 0.11, damage * 0.08]}
        >
          <boxGeometry args={[dimensions.width * 0.82, 0.13, 0.15]} />
          <meshStandardMaterial
            color="#252a2b"
            metalness={0.55}
            roughness={0.5}
          />
        </mesh>
      ) : null}
    </>
  );
}

export function RoadVehicleModel({
  brakeLights = false,
  damage = 0,
  disabled = false,
  emergencyLights = false,
  entityId = 0,
  headlights = false,
  kind,
  quality = "desktop",
  sirenPhase = 0,
  steering = 0,
  wheelSpin = 0,
  ...groupProps
}: RoadVehicleModelProps) {
  const appearance = useMemo(
    () => getVehicleAppearance(entityId, kind),
    [entityId, kind],
  );
  const dimensions = VEHICLE_DIMENSIONS[kind];
  const normalizedDamage = clampPresentationSignal(damage);
  const normalizedSteering = MathUtils.clamp(
    Number.isFinite(steering) ? steering : 0,
    -1,
    1,
  );
  const normalizedPhase = clampPresentationSignal(sirenPhase);
  const spin = Number.isFinite(wheelSpin) ? wheelSpin : 0;
  const frontZ = -dimensions.wheelBase * 0.5;
  const rearZ = dimensions.wheelBase * 0.5;
  const wheelX = dimensions.wheelTrack * 0.5;
  const armored = kind === "armored-courier";
  const van = kind === "traffic-van" || armored;

  if (quality === "mobile") {
    const roofY =
      dimensions.bodyY +
      dimensions.bodyHeight * 0.25 +
      dimensions.cabinHeight * 0.5;
    const frontLampZ = -dimensions.length * 0.5 - 0.015;
    const rearLampZ = dimensions.length * 0.5 + 0.015;
    const emergencyPulse = emergencyLights
      ? 1.5 + Math.abs(normalizedPhase - 0.5) * 5
      : 0.08;

    return (
      <group {...groupProps}>
        <mesh position={[0, dimensions.bodyY, 0]} receiveShadow>
          <boxGeometry
            args={[dimensions.width, dimensions.bodyHeight, dimensions.length]}
          />
          <meshStandardMaterial
            color={appearance.body}
            metalness={armored ? 0.34 : 0.22}
            roughness={armored ? 0.68 : 0.48}
          />
        </mesh>
        <mesh position={[0, dimensions.bodyY - 0.27, 0]}>
          <boxGeometry
            args={[dimensions.width * 0.84, 0.18, dimensions.length * 0.88]}
          />
          <meshStandardMaterial
            color="#182024"
            metalness={0.42}
            roughness={0.58}
          />
        </mesh>
        <mesh position={[0, roofY, dimensions.cabinZ]}>
          <boxGeometry
            args={[
              dimensions.width * (van ? 0.88 : 0.74),
              dimensions.cabinHeight,
              dimensions.cabinLength,
            ]}
          />
          <meshStandardMaterial
            color={van ? appearance.secondary : appearance.cabin}
            emissive={van ? "#000000" : "#173038"}
            emissiveIntensity={van ? 0 : 0.1}
            metalness={van ? 0.24 : 0.45}
            roughness={van ? 0.58 : 0.25}
          />
        </mesh>

        {[
          [-wheelX, frontZ],
          [wheelX, frontZ],
          [-wheelX, rearZ],
          [wheelX, rearZ],
        ].map(([x, z], index) => (
          <mesh
            key={`${x}-${z}`}
            position={[x, dimensions.wheelRadius, z]}
            rotation={[spin, index < 2 ? normalizedSteering * 0.42 : 0, 0]}
          >
            <boxGeometry
              args={[
                dimensions.wheelWidth,
                dimensions.wheelRadius * 1.72,
                dimensions.wheelRadius * 1.72,
              ]}
            />
            <meshStandardMaterial color="#101416" roughness={0.84} />
          </mesh>
        ))}

        <mesh position={[0, dimensions.bodyY + 0.06, frontLampZ]}>
          <boxGeometry args={[dimensions.width * 0.68, 0.16, 0.045]} />
          <meshStandardMaterial
            color={headlights ? "#ffe7a8" : "#6d6858"}
            emissive={headlights ? "#ffd77a" : "#171713"}
            emissiveIntensity={headlights ? 2.8 : 0.08}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, dimensions.bodyY + 0.04, rearLampZ]}>
          <boxGeometry args={[dimensions.width * 0.66, 0.15, 0.045]} />
          <meshStandardMaterial
            color="#a62f35"
            emissive="#e53f4e"
            emissiveIntensity={brakeLights || disabled ? 3.8 : 0.58}
            roughness={0.36}
          />
        </mesh>

        {kind === "hero-coupe" ? (
          <mesh
            position={[0, dimensions.bodyY + 0.39, dimensions.length * 0.42]}
          >
            <boxGeometry args={[dimensions.width * 0.72, 0.1, 0.28]} />
            <meshStandardMaterial
              color={appearance.secondary}
              metalness={0.58}
              roughness={0.34}
            />
          </mesh>
        ) : null}
        {van ? (
          <mesh position={[0, roofY, rearLampZ + 0.035]}>
            <boxGeometry
              args={[
                dimensions.width * 0.7,
                dimensions.cabinHeight * 0.62,
                0.055,
              ]}
            />
            <meshStandardMaterial
              color={appearance.trim}
              metalness={0.42}
              roughness={0.58}
            />
          </mesh>
        ) : null}
        {kind === "police-interceptor" ? (
          <group position={[0, roofY + dimensions.cabinHeight * 0.56, 0]}>
            <mesh position={[-0.28, 0, 0]}>
              <boxGeometry args={[0.5, 0.15, 0.24]} />
              <meshStandardMaterial
                color="#ee5263"
                emissive="#ff2849"
                emissiveIntensity={emergencyPulse}
                roughness={0.25}
              />
            </mesh>
            <mesh position={[0.28, 0, 0]}>
              <boxGeometry args={[0.5, 0.15, 0.24]} />
              <meshStandardMaterial
                color="#58c8dc"
                emissive="#32bce0"
                emissiveIntensity={emergencyPulse}
                roughness={0.25}
              />
            </mesh>
          </group>
        ) : null}
        {normalizedDamage > 0.32 ? (
          <mesh
            position={[
              dimensions.width * 0.32,
              dimensions.bodyY + dimensions.bodyHeight * 0.52,
              -dimensions.length * 0.3,
            ]}
            rotation={[-Math.PI / 2, 0, 0.35]}
          >
            <circleGeometry args={[0.25 + normalizedDamage * 0.2, 6]} />
            <meshStandardMaterial color="#202223" roughness={1} />
          </mesh>
        ) : null}
      </group>
    );
  }

  return (
    <group {...groupProps}>
      <group>
        {van ? (
          <ProfiledVanBody
            appearance={appearance}
            dimensions={dimensions}
            kind={kind === "armored-courier" ? kind : "traffic-van"}
            quality={quality}
          />
        ) : (
          <mesh castShadow receiveShadow position={[0, dimensions.bodyY, 0]}>
            <boxGeometry
              args={[
                dimensions.width,
                dimensions.bodyHeight,
                dimensions.length,
              ]}
            />
            <meshStandardMaterial
              color={appearance.body}
              metalness={0.3}
              roughness={0.43}
            />
          </mesh>
        )}
        <mesh castShadow position={[0, dimensions.bodyY - 0.26, 0]}>
          <boxGeometry
            args={[dimensions.width * 0.84, 0.2, dimensions.length * 0.9]}
          />
          <meshStandardMaterial
            color="#1a2225"
            metalness={0.52}
            roughness={0.48}
          />
        </mesh>
        {!van ? (
          <>
            <mesh
              castShadow
              position={[0, dimensions.bodyY + 0.29, -dimensions.length * 0.34]}
            >
              <boxGeometry
                args={[dimensions.width * 0.92, 0.2, dimensions.length * 0.29]}
              />
              <meshStandardMaterial
                color={appearance.body}
                metalness={0.33}
                roughness={0.4}
              />
            </mesh>
            <mesh
              castShadow
              position={[0, dimensions.bodyY + 0.25, dimensions.length * 0.4]}
            >
              <boxGeometry
                args={[dimensions.width * 0.9, 0.16, dimensions.length * 0.18]}
              />
              <meshStandardMaterial
                color={appearance.body}
                metalness={0.33}
                roughness={0.42}
              />
            </mesh>
          </>
        ) : null}
        {!van ? (
          <Cabin
            appearance={appearance}
            dimensions={dimensions}
            kind={kind}
            quality={quality}
          />
        ) : null}
        <Wheel
          appearance={appearance}
          front
          quality={quality}
          radius={dimensions.wheelRadius}
          spin={spin}
          steering={normalizedSteering}
          width={dimensions.wheelWidth}
          x={-wheelX}
          z={frontZ}
        />
        <Wheel
          appearance={appearance}
          front
          quality={quality}
          radius={dimensions.wheelRadius}
          spin={spin}
          steering={normalizedSteering}
          width={dimensions.wheelWidth}
          x={wheelX}
          z={frontZ}
        />
        <Wheel
          appearance={appearance}
          front={false}
          quality={quality}
          radius={dimensions.wheelRadius}
          spin={spin}
          steering={0}
          width={dimensions.wheelWidth}
          x={-wheelX}
          z={rearZ}
        />
        <Wheel
          appearance={appearance}
          front={false}
          quality={quality}
          radius={dimensions.wheelRadius}
          spin={spin}
          steering={0}
          width={dimensions.wheelWidth}
          x={wheelX}
          z={rearZ}
        />
        <Lamps
          appearance={appearance}
          brakeLights={brakeLights || disabled}
          damage={normalizedDamage}
          dimensions={dimensions}
          dynamicHeadlight={kind === "hero-coupe"}
          headlights={headlights}
          quality={quality}
        />
        {kind === "hero-coupe" ? (
          <HeroDetails appearance={appearance} dimensions={dimensions} />
        ) : null}
        {van ? (
          <VanDetails
            appearance={appearance}
            dimensions={dimensions}
            kind={kind}
            quality={quality}
          />
        ) : null}
        {kind === "police-interceptor" ? (
          <PoliceDetails
            appearance={appearance}
            dimensions={dimensions}
            emergencyLights={emergencyLights}
            phase={normalizedPhase}
            quality={quality}
          />
        ) : null}
        <DamageTreatment damage={normalizedDamage} dimensions={dimensions} />
        <DisabledSmoke
          enabled={disabled}
          hoodZ={van ? -dimensions.length * 0.28 : -dimensions.length * 0.34}
          quality={quality}
        />
      </group>
    </group>
  );
}

export function HeroCoupeModel(props: VehicleModelProps) {
  return (
    <RoadVehicleModel
      {...props}
      entityId={props.entityId ?? "mirage-hero"}
      kind="hero-coupe"
    />
  );
}

export function TrafficSedanModel(props: VehicleModelProps) {
  return <RoadVehicleModel {...props} kind="traffic-sedan" />;
}

export function TrafficVanModel(props: VehicleModelProps) {
  return <RoadVehicleModel {...props} kind="traffic-van" />;
}

export function ArmoredCourierModel(props: VehicleModelProps) {
  return (
    <RoadVehicleModel
      {...props}
      entityId={props.entityId ?? "afterlight-courier"}
      kind="armored-courier"
    />
  );
}

export function PoliceInterceptorModel({
  emergencyLights = true,
  ...props
}: PoliceInterceptorModelProps) {
  return (
    <RoadVehicleModel
      {...props}
      emergencyLights={emergencyLights}
      kind="police-interceptor"
    />
  );
}

export function vehicleModelDimensions(
  kind: VehicleVisualKind,
): Readonly<VehicleModelDimensions> {
  return VEHICLE_DIMENSIONS[kind];
}
