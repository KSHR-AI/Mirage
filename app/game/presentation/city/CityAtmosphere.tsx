"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { InstancedPrimitives } from "./InstancedPrimitives";
import { createCityRng } from "./seed";
import type { BoxInstance, CityQuality } from "./types";

const SUN_OFFSET = [-88, 128, 72] as const;
const SUN_SHADOW_HALF_EXTENT = 26;
const DESKTOP_SUN_SHADOW_MAP_SIZE = 1024;
const MOBILE_SUN_SHADOW_MAP_SIZE = 512;

export const CITY_DAY_ATMOSPHERE = Object.freeze({
  ambientIntensity: 0.72,
  directionalIntensity: 3.25,
  fogColor: "#b8d4da",
  fogFar: 410,
  fogNearDesktop: 178,
  fogNearMobile: 148,
  hemisphereIntensity: 1.28,
  skyHorizon: "#d9edf0",
  skyTop: "#4e9fd2",
});

type CityAtmosphereProps = {
  quality: CityQuality;
  seed: number;
  shadows: boolean;
};

export const CityAtmosphere = memo(function CityAtmosphere({
  quality,
  seed,
  shadows,
}: CityAtmosphereProps) {
  const clouds = useMemo(
    () => createMarineClouds(seed, quality === "desktop" ? 16 : 12),
    [quality, seed],
  );
  const castSunShadow = shadows;
  const shadowMapSize =
    quality === "desktop"
      ? DESKTOP_SUN_SHADOW_MAP_SIZE
      : MOBILE_SUN_SHADOW_MAP_SIZE;
  const shadowTexelSize = (SUN_SHADOW_HALF_EXTENT * 2) / shadowMapSize;
  const sun = useRef<THREE.DirectionalLight>(null);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const daySky = useMemo(() => createDaySkyTexture(), []);
  useEffect(() => () => daySky.dispose(), [daySky]);

  useFrame(({ camera }) => {
    if (!castSunShadow || !sun.current) return;
    const centerX =
      Math.round(camera.position.x / shadowTexelSize) * shadowTexelSize;
    const centerZ =
      Math.round(camera.position.z / shadowTexelSize) * shadowTexelSize;
    sunTarget.position.set(centerX, 0, centerZ);
    sunTarget.updateMatrixWorld();
    sun.current.position.set(
      centerX + SUN_OFFSET[0],
      SUN_OFFSET[1],
      centerZ + SUN_OFFSET[2],
    );
  });

  return (
    <group name="sunlit-san-francisco-atmosphere">
      <color attach="background" args={[CITY_DAY_ATMOSPHERE.skyTop]} />
      <fog
        attach="fog"
        args={[
          CITY_DAY_ATMOSPHERE.fogColor,
          quality === "desktop"
            ? CITY_DAY_ATMOSPHERE.fogNearDesktop
            : CITY_DAY_ATMOSPHERE.fogNearMobile,
          CITY_DAY_ATMOSPHERE.fogFar,
        ]}
      />
      <mesh scale={500}>
        <sphereGeometry
          args={[
            1,
            quality === "desktop" ? 32 : 12,
            quality === "desktop" ? 16 : 6,
          ]}
        />
        <meshBasicMaterial
          depthWrite={false}
          fog={false}
          map={daySky}
          side={THREE.BackSide}
          toneMapped={false}
        />
      </mesh>

      <ambientLight
        color="#dbe9e7"
        intensity={CITY_DAY_ATMOSPHERE.ambientIntensity}
      />
      <hemisphereLight
        color="#bfe4f5"
        groundColor="#7b7768"
        intensity={CITY_DAY_ATMOSPHERE.hemisphereIntensity}
      />
      <primitive object={sunTarget} />
      <directionalLight
        castShadow={castSunShadow}
        color="#fff0ce"
        intensity={CITY_DAY_ATMOSPHERE.directionalIntensity}
        position={SUN_OFFSET}
        ref={sun}
        shadow-bias={-0.00035}
        shadow-normalBias={0.025}
        shadow-radius={quality === "desktop" ? 2 : 1.25}
        shadow-camera-bottom={-SUN_SHADOW_HALF_EXTENT}
        shadow-camera-far={230}
        shadow-camera-left={-SUN_SHADOW_HALF_EXTENT}
        shadow-camera-near={24}
        shadow-camera-right={SUN_SHADOW_HALF_EXTENT}
        shadow-camera-top={SUN_SHADOW_HALF_EXTENT}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        target={sunTarget}
      />

      <mesh position={[-142, 126, -214]}>
        <sphereGeometry
          args={[
            10.5,
            quality === "desktop" ? 20 : 8,
            quality === "desktop" ? 14 : 6,
          ]}
        />
        <meshBasicMaterial color="#fff4c7" fog={false} toneMapped={false} />
      </mesh>
      <mesh position={[-142, 126, -212.5]}>
        <ringGeometry args={[11.5, 17.5, 36]} />
        <meshBasicMaterial
          color="#fff1ba"
          fog={false}
          opacity={0.18}
          side={2}
          toneMapped={false}
          transparent
        />
      </mesh>
      <InstancedPrimitives
        depthWrite={false}
        fog={false}
        instances={clouds}
        material="basic"
        opacity={0.34}
        shape="box"
        toneMapped={false}
        transparent
      />
    </group>
  );
});

function createDaySkyTexture() {
  const width = 2;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  const bottom = [222, 239, 240] as const;
  const horizon = [171, 215, 231] as const;
  const top = [67, 145, 202] as const;

  for (let row = 0; row < height; row += 1) {
    const vertical = row / (height - 1);
    const lower = vertical < 0.5;
    const mix = lower ? vertical * 2 : (vertical - 0.5) * 2;
    const eased = mix * mix * (3 - 2 * mix);
    const from = lower ? bottom : horizon;
    const to = lower ? horizon : top;
    for (let column = 0; column < width; column += 1) {
      const offset = (row * width + column) * 4;
      data[offset] = Math.round(from[0] + (to[0] - from[0]) * eased);
      data[offset + 1] = Math.round(from[1] + (to[1] - from[1]) * eased);
      data[offset + 2] = Math.round(from[2] + (to[2] - from[2]) * eased);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createMarineClouds(seed: number, count: number): BoxInstance[] {
  const rng = createCityRng(seed, "day-clouds");
  return Array.from({ length: count }, (_, index) => {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(175, 265);
    return {
      color: rng.bool(0.24) ? "#d7e7e9" : "#f5f7f4",
      id: `marine-cloud-${index}`,
      position: [
        Math.cos(angle) * radius,
        rng.range(64, 108),
        Math.sin(angle) * radius,
      ],
      rotationY: rng.range(-0.3, 0.3),
      scale: [rng.range(16, 32), rng.range(1.8, 4.2), rng.range(7, 15)],
    };
  });
}
