"use client";

import { Sky } from "@react-three/drei";
import { memo, useMemo } from "react";
import { InstancedPrimitives } from "./InstancedPrimitives";
import { createCityRng } from "./seed";
import type { BoxInstance, CityQuality } from "./types";

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
  const castSunShadow = shadows && quality === "desktop";

  return (
    <group name="marine-afterlight-atmosphere">
      <color attach="background" args={["#07151e"]} />
      <fog
        attach="fog"
        args={["#17333b", quality === "desktop" ? 128 : 112, 330]}
      />
      <Sky
        azimuth={0.18}
        distance={450_000}
        inclination={0.485}
        mieCoefficient={0.009}
        mieDirectionalG={0.88}
        rayleigh={0.48}
        turbidity={9.2}
      />

      <ambientLight color="#8ba9af" intensity={0.52} />
      <hemisphereLight color="#8fc8d1" groundColor="#132428" intensity={1.1} />
      <directionalLight
        castShadow={castSunShadow}
        color="#ffd2aa"
        intensity={2.35}
        position={[-92, 106, 54]}
        shadow-bias={-0.00035}
        shadow-camera-bottom={-122}
        shadow-camera-far={330}
        shadow-camera-left={-122}
        shadow-camera-near={18}
        shadow-camera-right={122}
        shadow-camera-top={122}
        shadow-mapSize={[1024, 1024]}
      />

      <mesh position={[-126, 92, -196]}>
        <sphereGeometry args={[8.5, 20, 14]} />
        <meshBasicMaterial color="#f7e7c3" fog={false} toneMapped={false} />
      </mesh>
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
    </group>
  );
});

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
