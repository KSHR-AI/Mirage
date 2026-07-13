"use client";

import { Clone, useGLTF, useTexture } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { InstancedPrimitives } from "./InstancedPrimitives";
import {
  COURIER_YARD_SECURITY_LIGHTS,
  createCourierYardDetailPlan,
  type CourierYardSecurityLight,
  type CourierYardModelPlacement,
} from "./courier-yard-layout";
import { createPbrTextureSet, disposePbrTextureSet } from "./surface-textures";
import type { BoxInstance, CityQuality, CityVec3 } from "./types";

interface CourierContainerDefinition {
  readonly body: string;
  readonly id: string;
  readonly position: CityVec3;
  readonly trim: string;
}

const CONTAINER_SIZE = [5.2, 2.6, 2.4] as const satisfies CityVec3;
const DEPOT_DOOR_CENTERS = [64.6, 70, 75.4] as const;
const CONTAINER_PALETTE = [
  { body: "#b96559", trim: "#3c2826" },
  { body: "#3f8b8c", trim: "#183b3d" },
  { body: "#c58b46", trim: "#50391f" },
  { body: "#718087", trim: "#273238" },
  { body: "#986b82", trim: "#402d37" },
  { body: "#4d7d68", trim: "#203a32" },
] as const;

const CONCRETE_TEXTURE_ROOT = "/game-assets/textures/concrete-wall-007";
const CORRUGATED_TEXTURE_ROOT = "/game-assets/textures/corrugated-iron-02";
const BARREL_MODEL_URL = "/game-assets/models/barrel_03.glb";

function box(
  id: string,
  position: CityVec3,
  scale: CityVec3,
  color: string,
): BoxInstance {
  return { color, id, position, rotationY: 0, scale };
}

function createContainerDefinitions(): CourierContainerDefinition[] {
  return CONTAINER_PALETTE.flatMap(({ body, trim }, index) => {
    const x = 79.5;
    const z = 38.5 + index * 2.8;
    const base: CourierContainerDefinition = {
      body,
      id: `container-${index}`,
      position: [x, 1.5, z],
      trim,
    };
    if (index !== 1 && index !== 4) return [base];
    return [
      base,
      {
        body,
        id: `container-${index}-top`,
        position: [x + (index === 1 ? -0.16 : 0.14), 4.15, z],
        trim,
      },
    ];
  });
}

function createContainerTrim(
  definitions: readonly CourierContainerDefinition[],
): BoxInstance[] {
  const values: BoxInstance[] = [];
  for (const container of definitions) {
    const [x, y, z] = container.position;
    for (const dx of [-2.5, 2.5]) {
      for (const dz of [-1.1, 1.1]) {
        values.push(
          box(
            `${container.id}-corner-${dx}-${dz}`,
            [x + dx, y, z + dz],
            [0.16, 2.5, 0.16],
            container.trim,
          ),
        );
      }
    }
    for (const dy of [-1.2, 1.2]) {
      for (const dz of [-1.1, 1.1]) {
        values.push(
          box(
            `${container.id}-rail-x-${dy}-${dz}`,
            [x, y + dy, z + dz],
            [5.08, 0.14, 0.14],
            container.trim,
          ),
        );
      }
      values.push(
        box(
          `${container.id}-door-rail-${dy}`,
          [x - 2.51, y + dy, z],
          [0.14, 0.14, 2.08],
          container.trim,
        ),
      );
    }
  }
  return values;
}

function createContainerRibs(
  definitions: readonly CourierContainerDefinition[],
): BoxInstance[] {
  const values: BoxInstance[] = [];
  for (const container of definitions) {
    const [x, y, z] = container.position;
    for (let rib = -2.16; rib <= 2.17; rib += 0.54) {
      for (const side of [-1, 1]) {
        values.push(
          box(
            `${container.id}-rib-${rib.toFixed(2)}-${side}`,
            [x + rib, y, z + side * 1.205],
            [0.055, 2.2, 0.055],
            container.trim,
          ),
        );
      }
    }
    for (const dz of [-0.62, 0, 0.62]) {
      values.push(
        box(
          `${container.id}-door-bar-${dz}`,
          [x - 2.605, y, z + dz],
          [0.055, 2.08, 0.07],
          container.trim,
        ),
      );
    }
  }
  return values;
}

function createDepotDoorDetails(): BoxInstance[] {
  const values: BoxInstance[] = [];
  DEPOT_DOOR_CENTERS.forEach((x, doorIndex) => {
    const rows = doorIndex === 1 ? [6] : [0, 1, 2, 3, 4, 5, 6];
    for (const row of rows) {
      values.push(
        box(
          `courier-depot-door-${doorIndex}-slat-${row}`,
          [x, 0.72 + row * 0.57, 36.615],
          [4.02, 0.055, 0.055],
          "#687274",
        ),
      );
    }
    for (const dx of [-2.16, 2.16]) {
      values.push(
        box(
          `courier-depot-door-${doorIndex}-frame-${dx}`,
          [x + dx, 2.42, 36.62],
          [0.14, 4.6, 0.14],
          "#202a2d",
        ),
      );
    }
  });
  return values;
}

const CONTAINER_DEFINITIONS = createContainerDefinitions();
const CONTAINERS = CONTAINER_DEFINITIONS.map((container) =>
  box(container.id, container.position, [...CONTAINER_SIZE], container.body),
);
const CONTAINER_TRIM = createContainerTrim(CONTAINER_DEFINITIONS);
const CONTAINER_RIBS = createContainerRibs(CONTAINER_DEFINITIONS);
const CONTAINER_PLATES = CONTAINER_DEFINITIONS.map((container) => {
  const [x, y, z] = container.position;
  return box(
    `${container.id}-plate`,
    [x - 2.64, y + 0.65, z + 0.58],
    [0.045, 0.28, 0.62],
    "#d7d5c7",
  );
});
const DEPOT_DOOR_PANELS = DEPOT_DOOR_CENTERS.map((x, index) =>
  box(
    `courier-depot-door-${index}`,
    [x, index === 1 ? 4.72 : 2.42, 36.53],
    [4.35, index === 1 ? 0.48 : 4.35, 0.12],
    index === 1 ? "#536366" : "#647173",
  ),
);
const DEPOT_DOOR_DETAILS = createDepotDoorDetails();
const DEPOT_ROOF_DETAILS = [
  box("courier-depot-hvac-a", [65.5, 7.22, 33.2], [2.3, 0.76, 1.7], "#303a3c"),
  box("courier-depot-hvac-b", [73.5, 7.02, 33.9], [1.8, 0.56, 1.45], "#374245"),
  box("courier-depot-duct", [69.5, 7.02, 33.5], [4.2, 0.34, 0.5], "#222c2f"),
] as const satisfies readonly BoxInstance[];

const DEPOT_STRUCTURE = [
  box(
    "courier-depot-west-pier",
    [60.9, 3.3, 36.55],
    [0.48, 6.5, 0.58],
    "#7e8987",
  ),
  box(
    "courier-depot-east-pier",
    [79.1, 3.3, 36.55],
    [0.48, 6.5, 0.58],
    "#7e8987",
  ),
  box("courier-depot-gutter", [70, 6.25, 36.68], [18.3, 0.18, 0.24], "#17262a"),
  box(
    "courier-depot-west-downpipe",
    [61.15, 3.15, 36.82],
    [0.16, 5.8, 0.18],
    "#26373a",
  ),
  box(
    "courier-depot-east-downpipe",
    [78.85, 3.15, 36.82],
    [0.16, 5.8, 0.18],
    "#26373a",
  ),
  box(
    "courier-depot-sign-back",
    [71.35, 6.02, 36.78],
    [8.7, 0.9, 0.16],
    "#13262c",
  ),
] as const satisfies readonly BoxInstance[];

const DEPOT_AWNINGS = DEPOT_DOOR_CENTERS.map((x, index) =>
  box(
    `courier-depot-awning-${index}`,
    [x, 5.15, 37.03],
    [4.75, 0.16, 1.02],
    "#26383c",
  ),
);

const DEPOT_BUMPERS = DEPOT_DOOR_CENTERS.flatMap((x, doorIndex) =>
  [-1.72, 1.72].map((offset, bumperIndex) =>
    box(
      `courier-depot-bumper-${doorIndex}-${bumperIndex}`,
      [x + offset, 0.72, 36.86],
      [0.22, 1.15, 0.32],
      "#11191b",
    ),
  ),
);

const YARD_HAZARD_STRIPES = Array.from({ length: 13 }, (_, index) =>
  box(
    `courier-yard-hazard-${index}`,
    [61.5 + index * 1.4, 0.315, 38.3],
    [0.72, 0.025, 0.26],
    index % 2 === 0 ? "#e9ce45" : "#242b2d",
  ),
);

const YARD_EDGE_DETAILS = [
  box(
    "courier-yard-west-curb",
    [59.85, 0.26, 46.2],
    [0.32, 0.42, 19],
    "#697474",
  ),
  box(
    "courier-yard-east-curb",
    [80.15, 0.26, 46.2],
    [0.32, 0.42, 19],
    "#697474",
  ),
  box(
    "courier-yard-west-rail",
    [60.05, 1.1, 44.4],
    [0.14, 1.72, 12.8],
    "#243438",
  ),
  box(
    "courier-yard-east-rail",
    [79.95, 1.1, 44.4],
    [0.14, 1.72, 12.8],
    "#243438",
  ),
] as const satisfies readonly BoxInstance[];

export function CourierYard({
  quality,
  shadows,
}: {
  readonly quality: CityQuality;
  readonly shadows: boolean;
}) {
  const concrete = useTexture({
    arm: `${CONCRETE_TEXTURE_ROOT}/arm.jpg`,
    color: `${CONCRETE_TEXTURE_ROOT}/base-color.jpg`,
    normal: `${CONCRETE_TEXTURE_ROOT}/normal-gl.jpg`,
  });
  const corrugated = useTexture({
    arm: `${CORRUGATED_TEXTURE_ROOT}/arm.jpg`,
    color: `${CORRUGATED_TEXTURE_ROOT}/base-color.jpg`,
    normal: `${CORRUGATED_TEXTURE_ROOT}/normal-gl.jpg`,
  });
  const textures = useMemo(() => {
    const concreteSources = [
      concrete.color,
      concrete.normal,
      concrete.arm,
    ] as const;
    const corrugatedSources = [
      corrugated.color,
      corrugated.normal,
      corrugated.arm,
    ] as const;
    return {
      concreteFacade: createPbrTextureSet(concreteSources, [4, 2]),
      concreteYard: createPbrTextureSet(concreteSources, [6, 6]),
      container: createPbrTextureSet(corrugatedSources, [3, 2]),
      door: createPbrTextureSet(corrugatedSources, [2, 2]),
    };
  }, [
    concrete.arm,
    concrete.color,
    concrete.normal,
    corrugated.arm,
    corrugated.color,
    corrugated.normal,
  ]);
  useEffect(
    () => () => Object.values(textures).forEach(disposePbrTextureSet),
    [textures],
  );
  const detailPlan = useMemo(
    () => createCourierYardDetailPlan(quality),
    [quality],
  );

  return (
    <group name="courier-yard">
      <mesh position={[70, 0.289, 46.2]} receiveShadow>
        <boxGeometry args={[20, 0.028, 18.4]} />
        <meshStandardMaterial
          color="#939b96"
          emissive="#35413f"
          emissiveIntensity={0.28}
          emissiveMap={shadows ? textures.concreteYard.map : undefined}
          map={shadows ? textures.concreteYard.map : undefined}
          metalness={0.04}
          normalMap={shadows ? textures.concreteYard.normalMap : undefined}
          normalScale={[0.32, 0.32]}
          roughness={0.93}
          roughnessMap={shadows ? textures.concreteYard.armMap : undefined}
        />
      </mesh>
      <mesh castShadow={shadows} position={[70, 3.3, 33.5]} receiveShadow>
        <boxGeometry args={[18, 6.4, 6]} />
        <meshStandardMaterial
          color="#9ba6a3"
          map={shadows ? textures.concreteFacade.map : undefined}
          metalness={0.08}
          normalMap={shadows ? textures.concreteFacade.normalMap : undefined}
          normalScale={[0.38, 0.38]}
          roughness={0.9}
          roughnessMap={shadows ? textures.concreteFacade.armMap : undefined}
        />
      </mesh>
      <mesh position={[70, 6.65, 33.5]}>
        <boxGeometry args={[18.8, 0.4, 6.8]} />
        <meshStandardMaterial
          color="#252f32"
          metalness={0.52}
          roughness={0.43}
        />
      </mesh>
      <InstancedPrimitives
        castShadow={shadows}
        emissive="#172b2f"
        emissiveIntensity={0.2}
        instances={detailPlan.depotRoofline}
        metalness={0.42}
        receiveShadow
        roughness={0.5}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={detailPlan.depotRelief}
        metalness={0.24}
        receiveShadow
        roughness={0.68}
      />
      <InstancedPrimitives
        depthWrite={false}
        emissive="#183337"
        emissiveIntensity={0.34}
        instances={detailPlan.depotGlazing}
        metalness={0.12}
        opacity={0.76}
        roughness={0.22}
        transparent
      />
      <InstancedPrimitives
        depthWrite={false}
        instances={detailPlan.depotLightPanels}
        material="basic"
        toneMapped={false}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={CONTAINERS}
        map={shadows ? textures.container.map : undefined}
        metalness={0.82}
        metalnessMap={shadows ? textures.container.armMap : undefined}
        normalMap={shadows ? textures.container.normalMap : undefined}
        normalScale={[0.55, 0.55]}
        receiveShadow
        roughness={0.62}
        roughnessMap={shadows ? textures.container.armMap : undefined}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={CONTAINER_TRIM}
        metalness={0.58}
        receiveShadow
        roughness={0.36}
      />
      <InstancedPrimitives
        instances={CONTAINER_RIBS}
        metalness={0.46}
        receiveShadow
        roughness={0.43}
      />
      <InstancedPrimitives
        instances={CONTAINER_PLATES}
        metalness={0.18}
        receiveShadow
        roughness={0.68}
      />
      <InstancedPrimitives
        instances={DEPOT_DOOR_PANELS}
        map={shadows ? textures.door.map : undefined}
        metalness={0.86}
        metalnessMap={shadows ? textures.door.armMap : undefined}
        normalMap={shadows ? textures.door.normalMap : undefined}
        normalScale={[0.62, 0.62]}
        receiveShadow
        roughness={0.58}
        roughnessMap={shadows ? textures.door.armMap : undefined}
      />
      <InstancedPrimitives
        instances={DEPOT_DOOR_DETAILS}
        metalness={0.5}
        receiveShadow
        roughness={0.4}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={DEPOT_ROOF_DETAILS}
        metalness={0.44}
        receiveShadow
        roughness={0.48}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={DEPOT_STRUCTURE}
        metalness={0.34}
        receiveShadow
        roughness={0.48}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={detailPlan.dockStructure}
        metalness={0.34}
        receiveShadow
        roughness={0.52}
      />
      <InstancedPrimitives
        castShadow={shadows}
        emissive="#6c3f20"
        emissiveIntensity={0.18}
        instances={detailPlan.interior}
        metalness={0.38}
        receiveShadow
        roughness={0.5}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={detailPlan.palletBoards}
        receiveShadow
        roughness={0.88}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={detailPlan.crateBodies}
        receiveShadow
        roughness={0.82}
      />
      <InstancedPrimitives
        instances={detailPlan.crateTrim}
        metalness={0.08}
        receiveShadow
        roughness={0.76}
      />
      <InstancedPrimitives
        instances={detailPlan.drains}
        metalness={0.72}
        receiveShadow
        roughness={0.28}
      />
      <InstancedPrimitives
        instances={detailPlan.drainSlats}
        metalness={0.86}
        receiveShadow
        roughness={0.24}
      />
      <InstancedPrimitives
        instances={detailPlan.tireMarks}
        material="basic"
        opacity={0.38}
        transparent
      />
      <YardWetPatches patches={detailPlan.wetPatches} />
      <InstancedPrimitives
        instances={detailPlan.safetyMarkings}
        material="basic"
        toneMapped={false}
      />
      <YardBarrels placements={detailPlan.barrels} shadows={shadows} />
      <YardSignage />
      <InstancedPrimitives
        castShadow={shadows}
        instances={DEPOT_AWNINGS}
        metalness={0.62}
        receiveShadow
        roughness={0.38}
      />
      <InstancedPrimitives
        instances={DEPOT_BUMPERS}
        metalness={0.18}
        roughness={0.76}
      />
      <InstancedPrimitives
        instances={YARD_HAZARD_STRIPES}
        metalness={0.08}
        roughness={0.58}
      />
      <InstancedPrimitives
        castShadow={shadows}
        instances={YARD_EDGE_DETAILS}
        metalness={0.48}
        receiveShadow
        roughness={0.5}
      />
      <InstancedPrimitives
        castShadow={shadows}
        emissive="#13272b"
        emissiveIntensity={0.36}
        instances={detailPlan.perimeterStructure}
        metalness={0.56}
        receiveShadow
        roughness={0.42}
      />
      <YardGantryTruss shadows={shadows} />
      <InstancedPrimitives
        castShadow={shadows}
        instances={detailPlan.perimeterDetails}
        metalness={0.46}
        receiveShadow
        roughness={0.5}
      />
      <InstancedPrimitives
        instances={detailPlan.perimeterLights}
        material="basic"
        toneMapped={false}
      />
      <YardGantrySignage />
      <YardSecurityLighting enabled={shadows} />
      <YardWear />
    </group>
  );
}

function YardGantryTruss({ shadows }: { readonly shadows: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const braces = useMemo(
    () =>
      [
        [60, 63.2, 5.64, 6.68],
        [63.2, 66.4, 6.68, 5.64],
        [73.6, 76.8, 5.64, 6.68],
        [76.8, 80, 6.68, 5.64],
      ] as const,
    [],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    braces.forEach(([startX, endX, startY, endY], index) => {
      const dx = endX - startX;
      const dy = endY - startY;
      transform.position.set((startX + endX) / 2, (startY + endY) / 2, 48.72);
      transform.rotation.set(0, 0, Math.atan2(dy, dx));
      transform.scale.set(Math.hypot(dx, dy), 0.12, 0.2);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [braces, transform]);

  return (
    <instancedMesh
      args={[undefined, undefined, braces.length]}
      castShadow={shadows}
      ref={meshRef}
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial
        color="#657577"
        emissive="#183034"
        emissiveIntensity={0.42}
        metalness={0.48}
        roughness={0.42}
      />
    </instancedMesh>
  );
}

function YardWetPatches({
  patches,
}: {
  readonly patches: readonly BoxInstance[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const geometry = useMemo(() => createYardWetPatchGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    patches.forEach((patch, index) => {
      transform.position.set(...patch.position);
      transform.rotation.set(0, patch.rotationY, 0);
      transform.scale.set(patch.scale[0], 1, patch.scale[2]);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, color.set(patch.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [color, patches, transform]);

  if (patches.length === 0) return null;
  return (
    <instancedMesh
      args={[geometry, undefined, patches.length]}
      frustumCulled
      ref={meshRef}
      renderOrder={1}
    >
      <meshBasicMaterial
        depthWrite={false}
        opacity={0.12}
        polygonOffset
        polygonOffsetFactor={-1}
        toneMapped
        transparent
        vertexColors
      />
    </instancedMesh>
  );
}

function createYardWetPatchGeometry() {
  const shape = new THREE.Shape();
  for (let index = 0; index < 32; index += 1) {
    const angle = (index / 32) * Math.PI * 2;
    const radius =
      1 + Math.sin(angle * 3 + 0.4) * 0.11 + Math.sin(angle * 7) * 0.055;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

function YardSecurityLighting({ enabled }: { readonly enabled: boolean }) {
  if (!enabled) return null;
  return (
    <group name="courier-yard-security-lighting">
      {COURIER_YARD_SECURITY_LIGHTS.map((light) => (
        <YardSecurityLight key={light.id} light={light} />
      ))}
    </group>
  );
}

function YardSecurityLight({
  light,
}: {
  readonly light: CourierYardSecurityLight;
}) {
  return (
    <pointLight
      color={light.color}
      decay={2}
      distance={13}
      intensity={light.intensity}
      position={light.position}
    />
  );
}

function YardGantrySignage() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 144;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#0c1b20";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#d8ff62";
    context.fillRect(0, 0, 14, canvas.height);
    context.fillStyle = "#f0f4ec";
    context.font = "700 52px Arial, sans-serif";
    context.textBaseline = "middle";
    context.fillText("SOMA FREIGHT", 44, 58);
    context.fillStyle = "#88a4a5";
    context.font = "600 25px Arial, sans-serif";
    context.fillText("GATE 01  /  AUTHORIZED VEHICLES", 46, 108);
    const result = new THREE.CanvasTexture(canvas);
    result.anisotropy = 8;
    result.colorSpace = THREE.SRGBColorSpace;
    result.needsUpdate = true;
    return result;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <mesh position={[70, 6.18, 48.76]}>
      <planeGeometry args={[4.6, 0.84]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function YardBarrels({
  placements,
  shadows,
}: {
  readonly placements: readonly CourierYardModelPlacement[];
  readonly shadows: boolean;
}) {
  const { scene } = useGLTF(BARREL_MODEL_URL);
  const model = useMemo(() => {
    const prepared = scene.clone(true);
    prepared.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = shadows;
      object.receiveShadow = true;
    });
    return prepared;
  }, [scene, shadows]);

  return (
    <group name="licensed-cc0-yard-barrels">
      {placements.map((placement) => (
        <Clone
          key={placement.id}
          object={model}
          position={placement.position}
          rotation={[0, placement.rotationY, 0]}
          scale={placement.scale}
        />
      ))}
    </group>
  );
}

function YardSignage() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 144;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#102127";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ff7766";
    context.fillRect(0, 0, 20, canvas.height);
    context.fillStyle = "#58d4cf";
    context.fillRect(20, 0, 10, canvas.height);
    context.fillStyle = "#eef4e8";
    context.font = "700 54px Arial, sans-serif";
    context.textBaseline = "middle";
    context.fillText("AFTERLIGHT FREIGHT", 68, 57);
    context.fillStyle = "#b6c9c8";
    context.font = "600 26px Arial, sans-serif";
    context.fillText("SOMA TERMINAL  /  BAYS 01-03", 70, 108);
    const result = new THREE.CanvasTexture(canvas);
    result.anisotropy = 8;
    result.colorSpace = THREE.SRGBColorSpace;
    result.needsUpdate = true;
    return result;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <mesh position={[71.35, 6.02, 36.93]}>
      <planeGeometry args={[8.5, 0.86]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function YardWear() {
  const stains = [
    {
      position: [63.2, 0.31, 49.6] as CityVec3,
      scale: [1.5, 0.72, 1] as CityVec3,
    },
    {
      position: [69.1, 0.31, 44.5] as CityVec3,
      scale: [0.9, 0.48, 1] as CityVec3,
    },
    {
      position: [75.8, 0.31, 52.3] as CityVec3,
      scale: [1.2, 0.62, 1] as CityVec3,
    },
  ];
  return (
    <group name="courier-yard-ground-wear">
      {stains.map((stain, index) => (
        <mesh
          key={`courier-yard-stain-${index}`}
          position={stain.position}
          rotation={[-Math.PI / 2, 0, index * 0.71]}
          scale={stain.scale}
        >
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial
            color="#152326"
            depthWrite={false}
            opacity={0.24}
            polygonOffset
            polygonOffsetFactor={-1}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}
