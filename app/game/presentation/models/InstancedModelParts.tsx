"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { AuthoredModelPlacement } from "../city/authored-route-layout";

export type InstancedModelPart = {
  readonly geometry: THREE.BufferGeometry;
  readonly key: string;
  readonly material: THREE.Material | THREE.Material[];
  readonly normalizedMatrix: THREE.Matrix4;
};

export function prepareInstancedModelParts(
  source: THREE.Object3D,
): readonly InstancedModelPart[] {
  source.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(source);
  if (bounds.isEmpty()) return [];
  const center = bounds.getCenter(new THREE.Vector3());
  const normalize = new THREE.Matrix4().makeTranslation(
    -center.x,
    -bounds.min.y,
    -center.z,
  );
  const parts: InstancedModelPart[] = [];

  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    parts.push({
      geometry: object.geometry,
      key: `${object.name || "mesh"}-${parts.length}`,
      material: object.material,
      normalizedMatrix: normalize.clone().multiply(object.matrixWorld),
    });
  });
  return parts;
}

type InstancedModelPartsProps = {
  readonly castShadow?: boolean;
  readonly instances: readonly AuthoredModelPlacement[];
  readonly parts: readonly InstancedModelPart[];
  readonly receiveShadow?: boolean;
};

export const InstancedModelParts = memo(function InstancedModelParts({
  castShadow = false,
  instances,
  parts,
  receiveShadow = true,
}: InstancedModelPartsProps) {
  if (instances.length === 0 || parts.length === 0) return null;
  return (
    <>
      {parts.map((part) => (
        <InstancedModelPartMesh
          castShadow={castShadow}
          instances={instances}
          key={part.key}
          part={part}
          receiveShadow={receiveShadow}
        />
      ))}
    </>
  );
});

function InstancedModelPartMesh({
  castShadow,
  instances,
  part,
  receiveShadow,
}: {
  readonly castShadow: boolean;
  readonly instances: readonly AuthoredModelPlacement[];
  readonly part: InstancedModelPart;
  readonly receiveShadow: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    instances.forEach((instance, index) => {
      transform.position.set(...instance.position);
      transform.rotation.set(0, instance.rotationY, 0);
      transform.scale.set(...instance.scale);
      transform.updateMatrix();
      matrix.multiplyMatrices(transform.matrix, part.normalizedMatrix);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [instances, matrix, part.normalizedMatrix, transform]);

  return (
    <instancedMesh
      args={[part.geometry, part.material, instances.length]}
      castShadow={castShadow}
      dispose={null}
      frustumCulled
      receiveShadow={receiveShadow}
      ref={meshRef}
    />
  );
}
