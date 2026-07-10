"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { BoxInstance } from "./types";

type PrimitiveShape = "box" | "cone" | "cylinder" | "icosahedron" | "sphere";
type PrimitiveMaterial = "basic" | "standard";

type InstancedPrimitivesProps = {
  castShadow?: boolean;
  depthWrite?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  fog?: boolean;
  instances: readonly BoxInstance[];
  material?: PrimitiveMaterial;
  metalness?: number;
  opacity?: number;
  receiveShadow?: boolean;
  roughness?: number;
  shape?: PrimitiveShape;
  toneMapped?: boolean;
  transparent?: boolean;
};

export const InstancedPrimitives = memo(function InstancedPrimitives({
  castShadow = false,
  depthWrite = true,
  emissive = "#000000",
  emissiveIntensity = 0,
  fog = true,
  instances,
  material = "standard",
  metalness = 0,
  opacity = 1,
  receiveShadow = false,
  roughness = 0.75,
  shape = "box",
  toneMapped = true,
  transparent = false,
}: InstancedPrimitivesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    instances.forEach((instance, index) => {
      transform.position.set(...instance.position);
      transform.rotation.set(0, instance.rotationY, 0);
      transform.scale.set(...instance.scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, color.set(instance.color));
    });
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [color, instances, transform]);

  if (instances.length === 0) return null;

  return (
    <instancedMesh
      castShadow={castShadow}
      frustumCulled
      ref={meshRef}
      receiveShadow={receiveShadow}
      args={[undefined, undefined, instances.length]}
    >
      {shape === "box" ? <boxGeometry /> : null}
      {shape === "cone" ? <coneGeometry args={[0.5, 1, 7]} /> : null}
      {shape === "cylinder" ? (
        <cylinderGeometry args={[0.5, 0.5, 1, 7]} />
      ) : null}
      {shape === "icosahedron" ? <icosahedronGeometry args={[0.5, 1]} /> : null}
      {shape === "sphere" ? <sphereGeometry args={[0.5, 10, 7]} /> : null}
      {material === "basic" ? (
        <meshBasicMaterial
          depthWrite={depthWrite}
          fog={fog}
          opacity={opacity}
          toneMapped={toneMapped}
          transparent={transparent || opacity < 1}
        />
      ) : (
        <meshStandardMaterial
          depthWrite={depthWrite}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          fog={fog}
          metalness={metalness}
          opacity={opacity}
          roughness={roughness}
          transparent={transparent || opacity < 1}
        />
      )}
    </instancedMesh>
  );
});

export function deriveInstances(
  instances: readonly BoxInstance[],
  suffix: string,
  map: (instance: BoxInstance) => Omit<BoxInstance, "id">,
): BoxInstance[] {
  return instances.map((instance) => ({
    id: `${instance.id}-${suffix}`,
    ...map(instance),
  }));
}
