"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { InstancedPrimitives } from "./InstancedPrimitives";
import { createCityRng } from "./seed";
import type { BoxInstance, CityLayout } from "./types";

type CitySurfaceProps = {
  layout: CityLayout;
  reducedMotion: boolean;
};

export const CitySurface = memo(function CitySurface({
  layout,
  reducedMotion,
}: CitySurfaceProps) {
  const glints = useMemo(
    () =>
      createWaterGlints(layout.seed, layout.quality === "desktop" ? 42 : 18),
    [layout.quality, layout.seed],
  );

  return (
    <group name="bay-city-surface">
      <BayWater glints={glints} reducedMotion={reducedMotion} />

      <mesh position={[0, -0.24, 0]} receiveShadow>
        <boxGeometry args={[208, 0.58, 208]} />
        <meshStandardMaterial
          color="#1e3134"
          metalness={0.05}
          roughness={0.96}
        />
      </mesh>
      <InstancedPrimitives
        instances={layout.roads}
        metalness={0.42}
        receiveShadow
        roughness={0.38}
      />
      <InstancedPrimitives
        instances={layout.sidewalks}
        metalness={0.04}
        receiveShadow
        roughness={0.84}
      />
      <InstancedPrimitives
        instances={layout.alleys}
        metalness={0.28}
        receiveShadow
        roughness={0.5}
      />
      <InstancedPrimitives
        instances={layout.laneMarks}
        material="basic"
        toneMapped={false}
      />
      <InstancedPrimitives
        instances={layout.crosswalks}
        material="basic"
        opacity={0.78}
        transparent
      />
      <InstancedPrimitives
        depthWrite={false}
        instances={layout.puddles}
        metalness={0.9}
        opacity={0.68}
        roughness={0.11}
        transparent
      />

      <TramRails />
      <WaterfrontEdge />
    </group>
  );
});

function BayWater({
  glints,
  reducedMotion,
}: {
  glints: BoxInstance[];
  reducedMotion: boolean;
}) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);

  useFrame(({ clock }) => {
    if (!materialRef.current || reducedMotion) return;
    materialRef.current.emissiveIntensity =
      0.17 + Math.sin(clock.elapsedTime * 0.32) * 0.035;
  });

  return (
    <group name="bay-water">
      <mesh position={[0, -0.68, -38]} receiveShadow>
        <boxGeometry args={[510, 0.5, 510]} />
        <meshPhysicalMaterial
          clearcoat={0.72}
          clearcoatRoughness={0.21}
          color="#0b4050"
          emissive="#0a3541"
          emissiveIntensity={0.17}
          metalness={0.56}
          ref={materialRef}
          roughness={0.25}
        />
      </mesh>
      <InstancedPrimitives
        depthWrite={false}
        instances={glints}
        material="basic"
        opacity={0.34}
        toneMapped={false}
        transparent
      />
    </group>
  );
}

function TramRails() {
  const rails = useMemo<BoxInstance[]>(
    () => [
      {
        color: "#829093",
        id: "tram-rail-west",
        position: [-29.1, 0.225, 0],
        rotationY: 0,
        scale: [0.075, 0.035, 204],
      },
      {
        color: "#829093",
        id: "tram-rail-east",
        position: [-26.9, 0.225, 0],
        rotationY: 0,
        scale: [0.075, 0.035, 204],
      },
    ],
    [],
  );
  return (
    <InstancedPrimitives instances={rails} metalness={0.92} roughness={0.2} />
  );
}

function WaterfrontEdge() {
  const piers = useMemo<BoxInstance[]>(() => {
    const instances: BoxInstance[] = [
      {
        color: "#526568",
        id: "east-seawall",
        position: [104.1, 0.1, 0],
        rotationY: 0,
        scale: [1.4, 1.25, 208],
      },
      {
        color: "#526568",
        id: "north-seawall",
        position: [0, 0.1, -104.1],
        rotationY: 0,
        scale: [208, 1.25, 1.4],
      },
    ];

    [-62, -18, 28, 72].forEach((z, index) => {
      instances.push({
        color: index % 2 === 0 ? "#58696a" : "#6b665b",
        id: `pier-${index}`,
        position: [126, -0.06, z],
        rotationY: 0,
        scale: [44, 0.72, 7.5],
      });
    });
    return instances;
  }, []);

  const pilings = useMemo<BoxInstance[]>(
    () =>
      [-62, -18, 28, 72].flatMap((z, pierIndex) =>
        [108, 120, 132, 144].flatMap((x, columnIndex) =>
          [-2.7, 2.7].map((offset, sideIndex) => ({
            color: "#28383a",
            id: `piling-${pierIndex}-${columnIndex}-${sideIndex}`,
            position: [x, -1.05, z + offset] as [number, number, number],
            rotationY: 0,
            scale: [0.55, 2.4, 0.55] as [number, number, number],
          })),
        ),
      ),
    [],
  );

  return (
    <group name="waterfront-edge">
      <InstancedPrimitives
        instances={piers}
        metalness={0.05}
        receiveShadow
        roughness={0.86}
      />
      <InstancedPrimitives instances={pilings} roughness={0.94} />
    </group>
  );
}

function createWaterGlints(seed: number, count: number): BoxInstance[] {
  const rng = createCityRng(seed, "water-glints");
  return Array.from({ length: count }, (_, index) => {
    const north = rng.bool(0.48);
    return {
      color: rng.bool(0.2) ? "#ffb073" : "#78c9ce",
      id: `water-glint-${index}`,
      position: north
        ? [rng.range(-160, 160), -0.38, rng.range(-236, -110)]
        : [rng.range(108, 218), -0.38, rng.range(-98, 98)],
      rotationY: rng.range(-0.2, 0.2),
      scale: [rng.range(2, 9), 0.012, rng.range(0.08, 0.22)],
    };
  });
}
