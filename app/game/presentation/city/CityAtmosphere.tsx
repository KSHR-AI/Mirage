"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { InstancedPrimitives } from "./InstancedPrimitives";
import { createCityRng } from "./seed";
import type { BoxInstance, CityQuality } from "./types";

const SUN_OFFSET = [-92, 106, 54] as const;
const SUN_SHADOW_HALF_EXTENT = 26;
const DESKTOP_SUN_SHADOW_MAP_SIZE = 1024;
const MOBILE_SUN_SHADOW_MAP_SIZE = 512;

export const CITY_NIGHT_ATMOSPHERE = Object.freeze({
  ambientIntensity: 0.34,
  directionalIntensity: 1.42,
  fogColor: "#0b202a",
  fogFar: 310,
  fogNearDesktop: 122,
  fogNearMobile: 106,
  hemisphereIntensity: 0.68,
  skyHorizon: "#17323c",
  skyTop: "#020711",
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
  const stars = useMemo(
    () => createStars(seed, quality === "desktop" ? 104 : 44),
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
  const nightSky = useMemo(() => createNightSkyTexture(), []);
  useEffect(() => () => nightSky.dispose(), [nightSky]);

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
    <group name="marine-afterlight-atmosphere">
      <color attach="background" args={["#030b12"]} />
      <fog
        attach="fog"
        args={[
          CITY_NIGHT_ATMOSPHERE.fogColor,
          quality === "desktop"
            ? CITY_NIGHT_ATMOSPHERE.fogNearDesktop
            : CITY_NIGHT_ATMOSPHERE.fogNearMobile,
          CITY_NIGHT_ATMOSPHERE.fogFar,
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
          map={nightSky}
          side={THREE.BackSide}
          toneMapped={false}
        />
      </mesh>

      <ambientLight
        color="#73939f"
        intensity={CITY_NIGHT_ATMOSPHERE.ambientIntensity}
      />
      <hemisphereLight
        color="#87afbd"
        groundColor="#08151b"
        intensity={CITY_NIGHT_ATMOSPHERE.hemisphereIntensity}
      />
      <primitive object={sunTarget} />
      <directionalLight
        castShadow={castSunShadow}
        color="#bdd8df"
        intensity={CITY_NIGHT_ATMOSPHERE.directionalIntensity}
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

      <mesh position={[-126, 92, -196]}>
        <sphereGeometry
          args={[
            8.5,
            quality === "desktop" ? 20 : 8,
            quality === "desktop" ? 14 : 6,
          ]}
        />
        <meshBasicMaterial color="#f7e7c3" fog={false} toneMapped={false} />
      </mesh>
      {quality === "desktop" ? (
        <>
          <mesh position={[-126, 92, -194.5]}>
            <ringGeometry args={[9.2, 13.5, 36]} />
            <meshBasicMaterial
              color="#e6b48a"
              fog={false}
              opacity={0.13}
              side={2}
              toneMapped={false}
              transparent
            />
          </mesh>
          <InstancedPrimitives
            depthWrite={false}
            fog={false}
            instances={stars}
            material="basic"
            shape="sphere"
            toneMapped={false}
          />
        </>
      ) : null}
    </group>
  );
});

function createNightSkyTexture() {
  const width = 2;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  const bottom = [6, 16, 25] as const;
  const horizon = [23, 50, 60] as const;
  const top = [2, 7, 17] as const;

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

function createStars(seed: number, count: number): BoxInstance[] {
  const rng = createCityRng(seed, "stars");
  return Array.from({ length: count }, (_, index) => {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(205, 292);
    const size = rng.range(0.18, 0.62);
    return {
      color: rng.bool(0.16) ? "#aee9f2" : "#fff2d6",
      id: `star-${index}`,
      position: [
        Math.cos(angle) * radius,
        rng.range(62, 172),
        Math.sin(angle) * radius,
      ],
      rotationY: 0,
      scale: [size, size, size],
    };
  });
}
