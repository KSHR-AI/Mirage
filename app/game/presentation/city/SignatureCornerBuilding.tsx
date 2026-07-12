"use client";

import { useTexture } from "@react-three/drei";
import { memo, useEffect, useMemo } from "react";
import { ExtrudeGeometry, Shape } from "three";

import { InstancedPrimitives } from "./InstancedPrimitives";
import { createColorTexture } from "./surface-textures";
import {
  createSignatureCornerPlan,
  type SignatureCornerMass,
} from "./signature-corner-layout";
import type { BuildingInstance, CityQuality } from "./types";

type SignatureCornerBuildingProps = {
  readonly building: BuildingInstance;
  readonly quality: CityQuality;
  readonly shadows: boolean;
};

const CONCRETE_COLOR_URL =
  "/game-assets/textures/concrete-wall-007/base-color.jpg";

export const SignatureCornerBuilding = memo(function SignatureCornerBuilding({
  building,
  quality,
  shadows,
}: SignatureCornerBuildingProps) {
  const concreteSource = useTexture(CONCRETE_COLOR_URL);
  const concrete = useMemo(
    () => createColorTexture(concreteSource, [2.4, 5.5]),
    [concreteSource],
  );
  const plan = useMemo(
    () => createSignatureCornerPlan(building, quality),
    [building, quality],
  );
  const massGeometry = useMemo(
    () => createChamferedMassGeometry(plan.mass),
    [plan.mass],
  );

  useEffect(
    () => () => {
      concrete.dispose();
      massGeometry.dispose();
    },
    [concrete, massGeometry],
  );

  return (
    <group name="signature-corner-building">
      <group
        name="signature-corner-camera-collision"
        userData={{ cameraCollisionRoot: true }}
      >
        <mesh
          castShadow={shadows}
          geometry={massGeometry}
          position={plan.mass.position}
          receiveShadow
        >
          <meshStandardMaterial
            color="#879195"
            emissive="#182326"
            emissiveIntensity={0.24}
            map={concrete}
            metalness={0.04}
            roughness={0.88}
          />
        </mesh>
        <InstancedPrimitives
          castShadow={shadows}
          instances={plan.groundStructure}
          receiveShadow
          roughness={0.82}
        />
      </group>
      <group
        name="signature-corner-facade-detail"
        userData={{ cameraCollision: false }}
      >
        <InstancedPrimitives
          castShadow={shadows}
          instances={plan.trim}
          metalness={0.34}
          receiveShadow
          roughness={0.54}
        />
        <InstancedPrimitives
          instances={plan.frames}
          metalness={0.46}
          roughness={0.38}
        />
        <InstancedPrimitives
          clearcoat={0.62}
          clearcoatRoughness={0.2}
          depthWrite={false}
          instances={plan.glass}
          material="physical"
          emissive="#19393c"
          emissiveIntensity={0.42}
          metalness={0.08}
          opacity={0.72}
          roughness={0.18}
          transparent
        />
        <InstancedPrimitives
          instances={plan.lightPanels}
          material="basic"
          toneMapped={false}
        />
        <InstancedPrimitives
          castShadow={shadows}
          instances={plan.roof}
          metalness={0.34}
          receiveShadow
          roughness={0.58}
        />
      </group>
    </group>
  );
});

function createChamferedMassGeometry(mass: SignatureCornerMass) {
  const [width, height, depth] = mass.scale;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const shape = new Shape();
  shape.moveTo(-halfWidth, -halfDepth);
  shape.lineTo(halfWidth, -halfDepth);
  shape.lineTo(halfWidth, halfDepth - mass.chamfer);
  shape.lineTo(halfWidth - mass.chamfer, halfDepth);
  shape.lineTo(-halfWidth, halfDepth);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: false,
    depth: height,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return geometry;
}
