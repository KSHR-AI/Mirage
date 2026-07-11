"use client";

import { InstancedPrimitives } from "./InstancedPrimitives";
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
  { body: "#864942", trim: "#3c2826" },
  { body: "#286b6d", trim: "#183b3d" },
  { body: "#aa7335", trim: "#50391f" },
  { body: "#46575f", trim: "#273238" },
  { body: "#795064", trim: "#402d37" },
  { body: "#365e50", trim: "#203a32" },
] as const;

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
    index === 1 ? "#26363a" : "#303b3d",
  ),
);
const DEPOT_DOOR_DETAILS = createDepotDoorDetails();
const DEPOT_ROOF_DETAILS = [
  box("courier-depot-hvac-a", [65.5, 7.22, 33.2], [2.3, 0.76, 1.7], "#303a3c"),
  box("courier-depot-hvac-b", [73.5, 7.02, 33.9], [1.8, 0.56, 1.45], "#374245"),
  box("courier-depot-duct", [69.5, 7.02, 33.5], [4.2, 0.34, 0.5], "#222c2f"),
] as const satisfies readonly BoxInstance[];

export function CourierYard({ shadows }: { readonly shadows: boolean }) {
  return (
    <group name="courier-yard">
      <mesh castShadow={shadows} position={[70, 3.3, 33.5]} receiveShadow>
        <boxGeometry args={[18, 6.4, 6]} />
        <meshStandardMaterial
          color="#49585b"
          metalness={0.18}
          roughness={0.68}
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
        metalness={0.34}
        receiveShadow
        roughness={0.5}
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
        metalness={0.4}
        receiveShadow
        roughness={0.52}
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
      {DEPOT_DOOR_CENTERS.map((x) => (
        <mesh key={`courier-depot-light-${x}`} position={[x, 5.55, 36.72]}>
          <boxGeometry args={[1.1, 0.12, 0.16]} />
          <meshStandardMaterial
            color="#f6e7b8"
            emissive="#ffd17a"
            emissiveIntensity={1.8}
            metalness={0.18}
            roughness={0.28}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
