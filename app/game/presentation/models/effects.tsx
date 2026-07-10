"use client";

import { useLayoutEffect, useRef } from "react";
import { Mesh, Quaternion, Vector3 } from "three";

import { clampPresentationSignal, getModelGeometryDetail } from "./appearance";
import type { ModelGroupProps, ModelQuality } from "./types";

const TRACER_UP = new Vector3(0, 1, 0);

export interface MuzzleFlashProps extends ModelGroupProps {
  readonly active: boolean;
  readonly quality?: ModelQuality;
  readonly intensity?: number;
  readonly color?: string;
}

export function MuzzleFlash({
  active,
  color = "#ffd46b",
  intensity = 1,
  quality = "desktop",
  ...groupProps
}: MuzzleFlashProps) {
  const detail = getModelGeometryDetail(quality);
  if (!active) return null;
  return (
    <group {...groupProps}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry
          args={[0.11 * intensity, 0.38 * intensity, detail.radialSegments]}
        />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]} scale={[1, 0.32, 1]}>
        <octahedronGeometry args={[0.18 * intensity, 0]} />
        <meshBasicMaterial color="#fff2c2" toneMapped={false} />
      </mesh>
      {quality === "desktop" ? (
        <pointLight
          color={color}
          decay={2}
          distance={3.2}
          intensity={2.4 * intensity}
        />
      ) : null}
    </group>
  );
}

export interface TracerModelProps extends Omit<
  ModelGroupProps,
  "position" | "rotation" | "scale"
> {
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  /** Remaining normalized lifetime; the parent owns expiry. */
  readonly life?: number;
  readonly width?: number;
  readonly color?: string;
  readonly quality?: ModelQuality;
}

export function TracerModel({
  color = "#ffe58b",
  end,
  life = 1,
  quality = "desktop",
  start,
  width = 0.018,
  ...groupProps
}: TracerModelProps) {
  const meshRef = useRef<Mesh>(null);
  const startVector = useRef(new Vector3());
  const endVector = useRef(new Vector3());
  const direction = useRef(new Vector3());
  const midpoint = useRef(new Vector3());
  const orientation = useRef(new Quaternion());
  const alpha = clampPresentationSignal(life);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    startVector.current.set(start[0], start[1], start[2]);
    endVector.current.set(end[0], end[1], end[2]);
    direction.current.subVectors(endVector.current, startVector.current);
    const length = direction.current.length();
    midpoint.current
      .copy(startVector.current)
      .addScaledVector(direction.current, 0.5);
    mesh.position.copy(midpoint.current);
    mesh.scale.set(width, Math.max(0.001, length), width);
    if (length > Number.EPSILON) {
      direction.current.multiplyScalar(1 / length);
      orientation.current.setFromUnitVectors(TRACER_UP, direction.current);
      mesh.quaternion.copy(orientation.current);
    }
    mesh.visible = length > Number.EPSILON;
  }, [end, start, width]);

  return (
    <group {...groupProps}>
      <mesh ref={meshRef} renderOrder={4}>
        <cylinderGeometry args={[1, 1, 1, quality === "desktop" ? 6 : 3]} />
        <meshBasicMaterial
          color={color}
          depthWrite={false}
          opacity={alpha * 0.9}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  );
}

export type ImpactKind = "world" | "vehicle" | "actor";

export interface HitMarkerModelProps extends ModelGroupProps {
  readonly kind?: ImpactKind;
  /** Remaining normalized lifetime; the parent owns expiry. */
  readonly life?: number;
  readonly quality?: ModelQuality;
  readonly size?: number;
}

const IMPACT_COLORS: Readonly<Record<ImpactKind, string>> = Object.freeze({
  world: "#f2c36b",
  vehicle: "#8fd6de",
  actor: "#ee7868",
});

export function HitMarkerModel({
  kind = "world",
  life = 1,
  quality = "desktop",
  size = 1,
  ...groupProps
}: HitMarkerModelProps) {
  const alpha = clampPresentationSignal(life);
  const color = IMPACT_COLORS[kind];
  return (
    <group {...groupProps} scale={size * (0.65 + (1 - alpha) * 0.45)}>
      <mesh renderOrder={5} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry
          args={[0.13, 0.018, quality === "desktop" ? 8 : 4, 16]}
        />
        <meshBasicMaterial
          color={color}
          depthWrite={false}
          opacity={alpha}
          toneMapped={false}
          transparent
        />
      </mesh>
      {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((rotation) => (
        <mesh
          key={rotation}
          position={[Math.sin(rotation) * 0.22, Math.cos(rotation) * 0.22, 0]}
          rotation={[0, 0, -rotation]}
          scale={[1, 0.45 + alpha * 0.55, 1]}
        >
          <boxGeometry args={[0.025, 0.18, 0.025]} />
          <meshBasicMaterial
            color={color}
            depthWrite={false}
            opacity={alpha * 0.85}
            toneMapped={false}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}
