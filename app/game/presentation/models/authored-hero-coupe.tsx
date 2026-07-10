"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { MathUtils, Mesh, Object3D } from "three";

import type { VehicleModelProps } from "./types";

export type AuthoredHeroCoupeModelProps = VehicleModelProps;

export const AUTHORED_HERO_COUPE_URL = "/game-assets/models/hero-coupe.glb";
export const AUTHORED_HERO_COUPE_SCALE = 0.78;
const MODEL_GROUND_OFFSET = -0.53;
const MAX_FRAME_DT = 0.1;

export function advanceAuthoredWheelSpin(
  current: number,
  angularSignal: number,
  dt: number,
): number {
  const safeSignal = Number.isFinite(angularSignal) ? angularSignal : 0;
  const safeDt = MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, MAX_FRAME_DT);
  return MathUtils.euclideanModulo(
    current + safeSignal * safeDt * 4.8,
    Math.PI * 2,
  );
}

function AuthoredCoupeLamps({
  brakeLights,
  damage,
  headlights,
}: {
  readonly brakeLights: boolean;
  readonly damage: number;
  readonly headlights: boolean;
}) {
  const target = useMemo(() => new Object3D(), []);
  const brokenRight = damage > 0.72;

  return (
    <group name="authored-hero-coupe-lamps">
      <primitive object={target} position={[0, -0.22, -15]} />
      {[-1, 1].map((side) => {
        const broken = side === 1 && brokenRight;
        return (
          <mesh key={`head-${side}`} position={[side * 0.61, 0.16, -2.24]}>
            <boxGeometry args={[0.39, 0.13, 0.035]} />
            <meshStandardMaterial
              color={broken ? "#332d27" : "#fff0be"}
              emissive={broken || !headlights ? "#181713" : "#ffe19a"}
              emissiveIntensity={broken ? 0 : headlights ? 3.8 : 0.12}
              roughness={0.25}
            />
          </mesh>
        );
      })}
      {[-1, 1].map((side) => (
        <mesh key={`tail-${side}`} position={[side * 0.63, 0.2, 2.28]}>
          <boxGeometry args={[0.36, 0.13, 0.035]} />
          <meshStandardMaterial
            color="#a62f35"
            emissive="#e53f4e"
            emissiveIntensity={brakeLights ? 4.2 : 0.7}
            roughness={0.3}
          />
        </mesh>
      ))}
      {headlights ? (
        <spotLight
          angle={0.38}
          castShadow={false}
          color="#ffe7b0"
          decay={2}
          distance={18}
          intensity={42}
          penumbra={0.72}
          position={[0, 0.22, -2.28]}
          target={target}
        />
      ) : null}
    </group>
  );
}

export function AuthoredHeroCoupeModel({
  brakeLights = false,
  damage = 0,
  disabled = false,
  headlights = false,
  quality = "desktop",
  steering = 0,
  wheelSpin = 0,
  ...groupProps
}: AuthoredHeroCoupeModelProps) {
  const { scene } = useGLTF(AUTHORED_HERO_COUPE_URL);
  const model = useMemo(() => scene.clone(true), [scene]);
  const frontLeft = useMemo(
    () => model.getObjectByName("FrontWheel_L"),
    [model],
  );
  const frontRight = useMemo(
    () => model.getObjectByName("FrontWheel_R"),
    [model],
  );
  const accumulatedSpin = useRef(0);

  useLayoutEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = quality === "desktop";
      object.receiveShadow = true;
    });
  }, [model, quality]);

  useFrame((_, dt) => {
    accumulatedSpin.current = advanceAuthoredWheelSpin(
      accumulatedSpin.current,
      wheelSpin,
      dt,
    );
    const steer = MathUtils.clamp(steering, -1, 1) * 0.48;
    for (const wheel of [frontLeft, frontRight]) {
      if (!wheel) continue;
      wheel.rotation.x = accumulatedSpin.current;
      wheel.rotation.y = steer;
    }
  });

  const normalizedDamage = MathUtils.clamp(
    Number.isFinite(damage) ? damage : 0,
    0,
    1,
  );

  return (
    <group {...groupProps}>
      <group position={[0, MODEL_GROUND_OFFSET, 0]}>
        <group rotation={[0, Math.PI, 0]} scale={AUTHORED_HERO_COUPE_SCALE}>
          <primitive dispose={null} object={model} />
        </group>
        <AuthoredCoupeLamps
          brakeLights={brakeLights || disabled}
          damage={normalizedDamage}
          headlights={headlights}
        />
        {disabled ? (
          <group position={[0, 1.28, -1.15]}>
            <mesh scale={[0.24, 0.34, 0.24]}>
              <dodecahedronGeometry args={[1, 0]} />
              <meshStandardMaterial
                color="#394247"
                depthWrite={false}
                opacity={0.24}
                transparent
              />
            </mesh>
          </group>
        ) : null}
      </group>
    </group>
  );
}
