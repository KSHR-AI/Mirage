"use client";

import { useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { InstancedPrimitives } from "./InstancedPrimitives";
import { createPbrTextureSet, disposePbrTextureSet } from "./surface-textures";
import type { BoxInstance, CityVec3 } from "./types";

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
    for (let row = 0; row < 7; row += 1) {
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
    [x, 2.42, 36.53],
    [4.35, 4.35, 0.12],
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
    [70, 6.02, 36.78],
    [8.7, 0.9, 0.16],
    "#13262c",
  ),
  box(
    "courier-depot-sign-coral",
    [67.35, 6.02, 36.89],
    [2.35, 0.12, 0.04],
    "#ff7161",
  ),
  box(
    "courier-depot-sign-teal",
    [70, 6.02, 36.89],
    [2.35, 0.12, 0.04],
    "#58d4cf",
  ),
  box(
    "courier-depot-sign-acid",
    [72.65, 6.02, 36.89],
    [2.35, 0.12, 0.04],
    "#d8ff5f",
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

export function CourierYard({ shadows }: { readonly shadows: boolean }) {
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
      <YardWear />
      {DEPOT_DOOR_CENTERS.map((x) => (
        <group key={`courier-depot-light-${x}`}>
          <mesh position={[x, 4.96, 37.5]}>
            <boxGeometry args={[1.2, 0.1, 0.18]} />
            <meshStandardMaterial
              color="#f6e7b8"
              emissive="#ffd17a"
              emissiveIntensity={2.4}
              metalness={0.18}
              roughness={0.28}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      {shadows ? (
        <pointLight
          color="#ffc77c"
          decay={2}
          distance={14}
          intensity={11}
          position={[70, 4.8, 39.8]}
        />
      ) : null}
    </group>
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
