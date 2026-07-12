"use client";

import { memo, useEffect, useMemo } from "react";
import { ExtrudeGeometry, Shape } from "three";

import type { VehicleAppearance, VehicleVisualKind } from "./appearance";
import type { ModelQuality } from "./types";

export type ProfiledVanKind = Extract<
  VehicleVisualKind,
  "armored-courier" | "traffic-van"
>;

export interface ProfiledVanDimensions {
  readonly bodyHeight: number;
  readonly bodyY: number;
  readonly cabinHeight: number;
  readonly length: number;
  readonly wheelBase: number;
  readonly wheelRadius: number;
  readonly width: number;
}

export interface VanProfilePoint {
  readonly y: number;
  readonly z: number;
}

type ProfiledVanBodyProps = {
  readonly appearance: VehicleAppearance;
  readonly dimensions: ProfiledVanDimensions;
  readonly kind: ProfiledVanKind;
  readonly quality: ModelQuality;
};

export function createVanSideProfile(
  dimensions: ProfiledVanDimensions,
  kind: ProfiledVanKind,
): readonly VanProfilePoint[] {
  const armored = kind === "armored-courier";
  const front = -dimensions.length / 2;
  const rear = dimensions.length / 2;
  const sill = Math.max(0.2, dimensions.wheelRadius * 0.54);
  const hood = dimensions.bodyY + dimensions.bodyHeight * 0.43;
  const shoulder = dimensions.bodyY + dimensions.bodyHeight * 0.72;
  const roof =
    dimensions.bodyY + dimensions.cabinHeight * (armored ? 1.12 : 1.1);

  return Object.freeze([
    Object.freeze({ y: sill, z: rear - 0.08 }),
    Object.freeze({ y: sill, z: front + 0.08 }),
    Object.freeze({ y: hood * 0.74, z: front }),
    Object.freeze({ y: hood, z: front + 0.22 }),
    Object.freeze({ y: shoulder, z: front + dimensions.length * 0.12 }),
    Object.freeze({ y: roof - 0.1, z: front + dimensions.length * 0.28 }),
    Object.freeze({ y: roof, z: front + dimensions.length * 0.34 }),
    Object.freeze({ y: roof, z: rear - 0.14 }),
    Object.freeze({ y: roof - 0.14, z: rear }),
  ]);
}

export function createProfiledVanGeometry(
  dimensions: ProfiledVanDimensions,
  kind: ProfiledVanKind,
): ExtrudeGeometry {
  const profile = createVanSideProfile(dimensions, kind);
  const shape = new Shape();
  profile.forEach((point, index) => {
    const x = -point.z;
    if (index === 0) shape.moveTo(x, point.y);
    else shape.lineTo(x, point.y);
  });
  shape.closePath();

  const bevel = kind === "armored-courier" ? 0.045 : 0.07;
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
    depth: dimensions.width - bevel * 2,
    steps: 1,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-dimensions.width / 2 + bevel, 0, 0);
  geometry.computeBoundingBox();
  const initialBounds = geometry.boundingBox;
  if (initialBounds) {
    const currentWidth = initialBounds.max.x - initialBounds.min.x;
    const currentLength = initialBounds.max.z - initialBounds.min.z;
    geometry.translate(
      -(initialBounds.min.x + initialBounds.max.x) / 2,
      0,
      -(initialBounds.min.z + initialBounds.max.z) / 2,
    );
    geometry.scale(
      dimensions.width / currentWidth,
      1,
      dimensions.length / currentLength,
    );
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export const ProfiledVanBody = memo(function ProfiledVanBody({
  appearance,
  dimensions,
  kind,
  quality,
}: ProfiledVanBodyProps) {
  const armored = kind === "armored-courier";
  const geometry = useMemo(
    () => createProfiledVanGeometry(dimensions, kind),
    [dimensions, kind],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const front = -dimensions.length / 2;
  const rear = dimensions.length / 2;
  const roofY =
    dimensions.bodyY + dimensions.cabinHeight * (armored ? 1.12 : 1.1);
  const windshieldY = dimensions.bodyY + dimensions.cabinHeight * 0.62;
  const windshieldZ = front + dimensions.length * 0.2;
  const sideX = dimensions.width / 2 + 0.018;
  const cargoCenterZ = dimensions.length * 0.2;
  const cargoSpan = dimensions.length * 0.48;

  return (
    <group name={`${kind}-profiled-body`}>
      <mesh castShadow geometry={geometry} receiveShadow>
        <meshPhysicalMaterial
          clearcoat={armored ? 0.12 : 0.48}
          clearcoatRoughness={armored ? 0.5 : 0.2}
          color={appearance.body}
          metalness={armored ? 0.46 : 0.31}
          roughness={armored ? 0.68 : 0.4}
        />
      </mesh>

      <mesh position={[0, windshieldY, windshieldZ]} rotation={[0.47, 0, 0]}>
        <boxGeometry
          args={[dimensions.width * 0.72, dimensions.cabinHeight * 0.52, 0.045]}
        />
        <meshPhysicalMaterial
          clearcoat={0.7}
          clearcoatRoughness={0.16}
          color={appearance.cabin}
          emissive="#1c343a"
          emissiveIntensity={0.16}
          metalness={0.28}
          opacity={0.82}
          roughness={0.16}
          transparent
        />
      </mesh>
      <mesh
        position={[0, windshieldY, windshieldZ - 0.022]}
        rotation={[0.47, 0, 0]}
      >
        <boxGeometry args={[0.055, dimensions.cabinHeight * 0.54, 0.065]} />
        <meshStandardMaterial
          color={appearance.trim}
          metalness={0.68}
          roughness={0.34}
        />
      </mesh>

      {[-1, 1].map((side) => (
        <group key={side} position={[side * sideX, 0, 0]}>
          <mesh
            position={[0, windshieldY + 0.02, front + dimensions.length * 0.29]}
          >
            <boxGeometry
              args={[
                0.045,
                dimensions.cabinHeight * 0.48,
                dimensions.length * 0.2,
              ]}
            />
            <meshPhysicalMaterial
              clearcoat={0.62}
              clearcoatRoughness={0.18}
              color={appearance.cabin}
              emissive="#1c343a"
              emissiveIntensity={0.12}
              metalness={0.28}
              opacity={0.8}
              roughness={0.17}
              transparent
            />
          </mesh>
          <mesh
            position={[
              0,
              dimensions.bodyY + 0.28,
              front + dimensions.length * 0.31,
            ]}
          >
            <boxGeometry
              args={[
                0.055,
                dimensions.bodyHeight * 0.72,
                dimensions.length * 0.24,
              ]}
            />
            <meshStandardMaterial
              color={appearance.secondary}
              metalness={armored ? 0.52 : 0.34}
              roughness={armored ? 0.62 : 0.48}
            />
          </mesh>
          <mesh position={[0, dimensions.bodyY + 0.22, cargoCenterZ]}>
            <boxGeometry args={[0.055, 0.065, cargoSpan]} />
            <meshStandardMaterial
              color={appearance.trim}
              metalness={0.62}
              roughness={0.4}
            />
          </mesh>
          <mesh
            position={[
              0,
              dimensions.bodyY + 0.56,
              cargoCenterZ - cargoSpan * 0.48,
            ]}
          >
            <boxGeometry args={[0.07, 0.08, 0.34]} />
            <meshStandardMaterial
              color={appearance.trim}
              metalness={0.7}
              roughness={0.32}
            />
          </mesh>
          <mesh position={[0, roofY + 0.09, cargoCenterZ]}>
            <boxGeometry args={[0.08, 0.14, cargoSpan * 0.86]} />
            <meshStandardMaterial
              color={appearance.secondary}
              metalness={0.6}
              roughness={0.38}
            />
          </mesh>
          {!armored && quality === "desktop" ? (
            <>
              {[-1, 1].map((edge) => (
                <mesh
                  key={`cargo-seam-${edge}`}
                  position={[
                    0,
                    dimensions.bodyY + dimensions.cabinHeight * 0.42,
                    cargoCenterZ + edge * cargoSpan * 0.4,
                  ]}
                >
                  <boxGeometry
                    args={[0.07, dimensions.cabinHeight * 0.72, 0.055]}
                  />
                  <meshStandardMaterial
                    color={appearance.secondary}
                    metalness={0.42}
                    roughness={0.52}
                  />
                </mesh>
              ))}
              <mesh
                position={[
                  side * 0.012,
                  dimensions.bodyY + dimensions.cabinHeight * 0.62,
                  cargoCenterZ,
                ]}
              >
                <boxGeometry args={[0.055, 0.14, cargoSpan * 0.46]} />
                <meshBasicMaterial
                  color={side > 0 ? "#d7e45b" : "#6ed6cf"}
                  toneMapped={false}
                />
              </mesh>
              {[-0.22, 0, 0.22].map((offset) => (
                <mesh
                  key={`cargo-mark-${offset}`}
                  position={[
                    side * 0.018,
                    dimensions.bodyY + dimensions.cabinHeight * 0.42,
                    cargoCenterZ + offset * cargoSpan,
                  ]}
                >
                  <boxGeometry args={[0.06, 0.22, 0.13]} />
                  <meshStandardMaterial
                    color={appearance.secondary}
                    metalness={0.5}
                    roughness={0.42}
                  />
                </mesh>
              ))}
            </>
          ) : null}
          <group
            position={[
              side * 0.16,
              windshieldY + 0.04,
              front + dimensions.length * 0.27,
            ]}
          >
            <mesh>
              <boxGeometry args={[0.28, 0.18, 0.38]} />
              <meshStandardMaterial
                color={appearance.secondary}
                metalness={0.48}
                roughness={0.38}
              />
            </mesh>
            <mesh position={[side * 0.08, 0, -0.04]}>
              <boxGeometry args={[0.06, 0.09, 0.25]} />
              <meshStandardMaterial
                color="#9fb4b7"
                metalness={0.8}
                roughness={0.12}
              />
            </mesh>
          </group>
        </group>
      ))}

      <mesh position={[0, dimensions.bodyY - 0.19, front - 0.065]}>
        <boxGeometry args={[dimensions.width * 0.86, 0.19, 0.16]} />
        <meshStandardMaterial
          color="#182124"
          metalness={0.64}
          roughness={0.42}
        />
      </mesh>
      <mesh position={[0, dimensions.bodyY - 0.16, rear + 0.065]}>
        <boxGeometry args={[dimensions.width * 0.9, 0.17, 0.16]} />
        <meshStandardMaterial
          color="#182124"
          metalness={0.6}
          roughness={0.46}
        />
      </mesh>

      {armored && quality === "desktop" ? (
        <>
          {[-1, 1].map((side) => (
            <group
              key={`armor-${side}`}
              position={[side * (sideX + 0.025), roofY - 0.52, cargoCenterZ]}
            >
              {[-0.48, -0.16, 0.16, 0.48].map((offset) => (
                <mesh key={offset} position={[0, 0, offset * cargoSpan]}>
                  <boxGeometry args={[0.075, 0.62, 0.07]} />
                  <meshStandardMaterial
                    color="#273438"
                    metalness={0.58}
                    roughness={0.56}
                  />
                </mesh>
              ))}
            </group>
          ))}
          <mesh position={[0, roofY + 0.12, -0.05]}>
            <boxGeometry
              args={[dimensions.width * 0.72, 0.14, dimensions.length * 0.5]}
            />
            <meshStandardMaterial
              color="#263438"
              metalness={0.62}
              roughness={0.52}
            />
          </mesh>
        </>
      ) : null}
    </group>
  );
});
