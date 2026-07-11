"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Material,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";

import type { VehicleModelProps } from "./types";

export type AuthoredHeroCoupeModelProps = VehicleModelProps;

export interface AuthoredHeroCoupeMaterialTreatment {
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly color: string;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly envMapIntensity?: number;
  readonly metalness: number;
  readonly opacity?: number;
  readonly roughness: number;
  readonly transparent?: boolean;
}

interface PreparedCoupeModel {
  readonly materials: readonly MeshStandardMaterial[];
  readonly model: Object3D;
}

interface WheelBinding {
  readonly baseQuaternion: Quaternion;
  readonly front: boolean;
  readonly object: Object3D;
}

export const AUTHORED_HERO_COUPE_URL =
  "/game-assets/models/hero-coupe.glb?v=20260711-car-concept-2";
export const AUTHORED_HERO_COUPE_SCALE = Object.freeze([
  0.76, 1.08, 1.04,
] as const);
export const AUTHORED_HERO_COUPE_REQUIRED_NODES = Object.freeze([
  "BodyUnderside",
  "WheelFrontL",
  "WheelFrontR",
  "WheelRearL",
  "WheelRearR",
] as const);

const MODEL_GROUND_OFFSET = 0.012;
const MAX_FRAME_DT = 0.1;
const SPIN_AXIS = new Vector3(1, 0, 0);
const STEERING_AXIS = new Vector3(0, 0, 1);

function materialTreatment(
  color: string,
  roughness: number,
  metalness: number,
  options: Omit<
    AuthoredHeroCoupeMaterialTreatment,
    "color" | "roughness" | "metalness"
  > = {},
): AuthoredHeroCoupeMaterialTreatment {
  return Object.freeze({ color, metalness, roughness, ...options });
}

export function getAuthoredHeroCoupeMaterialTreatment(
  materialName: string,
  brakeLights: boolean,
  headlights: boolean,
  damage: number,
): AuthoredHeroCoupeMaterialTreatment | null {
  const normalizedDamage = MathUtils.clamp(
    Number.isFinite(damage) ? damage : 0,
    0,
    1,
  );

  switch (materialName) {
    case "Paint 1 Carmine":
      return materialTreatment("#cf5548", 0.22 + normalizedDamage * 0.3, 0.58, {
        clearcoat: 1 - normalizedDamage * 0.52,
        clearcoatRoughness: 0.11 + normalizedDamage * 0.34,
        envMapIntensity: 1.32,
      });
    case "Paint 2 Carmine":
      return materialTreatment(
        "#123f47",
        0.27 + normalizedDamage * 0.24,
        0.54,
        {
          clearcoat: 0.9 - normalizedDamage * 0.42,
          clearcoatRoughness: 0.15 + normalizedDamage * 0.3,
          envMapIntensity: 1.18,
        },
      );
    case "Glass":
      return materialTreatment("#15363e", 0.16, 0.18, {
        envMapIntensity: 1.4,
        opacity: 0.62,
        transparent: true,
      });
    case "Mechanical":
      return materialTreatment("#20282b", 0.46, 0.56);
    case "":
    case "Panel Sides":
      return materialTreatment("#273033", 0.42, 0.44);
    case "Interior 1":
      return materialTreatment("#171d20", 0.72, 0.08);
    case "Interior 2":
      return materialTreatment("#303538", 0.58, 0.16);
    case "Interior 3 Carmine":
      return materialTreatment("#742f2f", 0.57, 0.12);
    case "Dashboard":
      return materialTreatment("#10191c", 0.48, 0.2, {
        emissive: "#4bc4c1",
        emissiveIntensity: 0.26,
      });
    case "Signallight":
      return materialTreatment("#ef9c3d", 0.24, 0.08, {
        emissive: "#ff9a32",
        emissiveIntensity: 0.72,
      });
    case "Brakelight":
      return materialTreatment("#a91f33", 0.2, 0.08, {
        emissive: brakeLights ? "#ff3855" : "#a4162b",
        emissiveIntensity: brakeLights ? 6.2 : 1.05,
      });
    case "Headlight":
      return materialTreatment("#fff1c9", 0.18, 0.06, {
        emissive: headlights ? "#ffe0a0" : "#2c2921",
        emissiveIntensity: headlights ? 4.4 : 0.16,
      });
    case "Mirror":
      return materialTreatment("#a9c2c5", 0.08, 0.82, {
        envMapIntensity: 1.75,
      });
    case "Brake":
      return materialTreatment("#d8ed55", 0.34, 0.46, {
        emissive: "#67751f",
        emissiveIntensity: 0.14,
      });
    case "Disc":
      return materialTreatment("#879092", 0.31, 0.78);
    case "Tireside":
    case "Tiretread":
      return materialTreatment("#101416", 0.84, 0.02);
    case "Rim1":
      return materialTreatment("#b9c4c4", 0.22, 0.82, {
        envMapIntensity: 1.2,
      });
    case "Rim2":
      return materialTreatment("#182226", 0.3, 0.68);
    default:
      return null;
  }
}

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

function cloneMaterial(
  source: Material,
  clones: Map<Material, Material>,
): Material {
  const existing = clones.get(source);
  if (existing) return existing;
  const clone = source.clone();
  clones.set(source, clone);
  return clone;
}

function prepareCoupeModel(source: Object3D): PreparedCoupeModel {
  const model = source.clone(true);
  const clones = new Map<Material, Material>();

  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) =>
        cloneMaterial(material, clones),
      );
    } else {
      object.material = cloneMaterial(object.material, clones);
    }
  });

  return {
    materials: [...clones.values()].filter(
      (material): material is MeshStandardMaterial =>
        material instanceof MeshStandardMaterial,
    ),
    model,
  };
}

function meshMaterialNames(mesh: Mesh): readonly string[] {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  return materials.map((material) => material.name);
}

function shouldCastCoupeShadow(mesh: Mesh): boolean {
  return meshMaterialNames(mesh).some(
    (name) =>
      name.startsWith("Paint ") ||
      name === "Mechanical" ||
      name === "Panel Sides" ||
      name === "Tireside" ||
      name === "Tiretread",
  );
}

function applyCoupeMaterialTreatment(
  material: MeshStandardMaterial,
  brakeLights: boolean,
  headlights: boolean,
  damage: number,
) {
  const treatment = getAuthoredHeroCoupeMaterialTreatment(
    material.name,
    brakeLights,
    headlights,
    damage,
  );
  if (!treatment) return;

  material.color.set(treatment.color);
  material.metalness = treatment.metalness;
  material.roughness = treatment.roughness;
  material.envMapIntensity = treatment.envMapIntensity ?? 0.95;
  material.emissive.set(treatment.emissive ?? "#000000");
  material.emissiveIntensity = treatment.emissiveIntensity ?? 0;
  material.opacity = treatment.opacity ?? 1;
  material.transparent = treatment.transparent ?? false;
  material.depthWrite = !material.transparent;
  if (material instanceof MeshPhysicalMaterial) {
    material.clearcoat = treatment.clearcoat ?? material.clearcoat;
    material.clearcoatRoughness =
      treatment.clearcoatRoughness ?? material.clearcoatRoughness;
  }
  material.needsUpdate = true;
}

function AuthoredCoupeDynamicLight({
  headlights,
  quality,
}: {
  readonly headlights: boolean;
  readonly quality: "desktop" | "mobile";
}) {
  const target = useMemo(() => new Object3D(), []);

  return (
    <group name="authored-hero-coupe-dynamic-light">
      <primitive object={target} position={[0, 0.22, -18]} />
      {headlights && quality === "desktop" ? (
        <spotLight
          angle={0.34}
          castShadow={false}
          color="#ffe5ad"
          decay={2}
          distance={22}
          intensity={48}
          penumbra={0.76}
          position={[0, 0.48, -2.42]}
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
  const prepared = useMemo(() => prepareCoupeModel(scene), [scene]);
  const wheelBindings = useMemo<readonly WheelBinding[]>(
    () =>
      AUTHORED_HERO_COUPE_REQUIRED_NODES.slice(1).map((name) => {
        const object = prepared.model.getObjectByName(name);
        if (!object) {
          const availableNames: string[] = [];
          prepared.model.traverse((candidate) => {
            if (candidate.name) availableNames.push(candidate.name);
          });
          throw new Error(
            `Hero coupe is missing wheel node ${name}; available nodes: ${availableNames.join(", ")}`,
          );
        }
        return {
          baseQuaternion: object.quaternion.clone(),
          front: name.startsWith("WheelFront"),
          object,
        };
      }),
    [prepared],
  );
  const steeringQuaternion = useMemo(() => new Quaternion(), []);
  const spinQuaternion = useMemo(() => new Quaternion(), []);
  const accumulatedSpin = useRef(0);
  const normalizedDamage = MathUtils.clamp(
    Number.isFinite(damage) ? damage : 0,
    0,
    1,
  );

  useLayoutEffect(() => {
    prepared.model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow =
        quality === "desktop" && shouldCastCoupeShadow(object);
      object.receiveShadow = true;
    });
    for (const material of prepared.materials) {
      applyCoupeMaterialTreatment(
        material,
        brakeLights || disabled,
        headlights,
        normalizedDamage,
      );
    }
  }, [brakeLights, disabled, headlights, normalizedDamage, prepared, quality]);

  useEffect(
    () => () => {
      for (const material of prepared.materials) material.dispose();
    },
    [prepared],
  );

  useFrame((_, dt) => {
    accumulatedSpin.current = advanceAuthoredWheelSpin(
      accumulatedSpin.current,
      wheelSpin,
      dt,
    );
    const steer = MathUtils.clamp(steering, -1, 1) * 0.42;
    steeringQuaternion.setFromAxisAngle(STEERING_AXIS, steer);
    spinQuaternion.setFromAxisAngle(SPIN_AXIS, accumulatedSpin.current);

    for (const wheel of wheelBindings) {
      if (wheel.front) {
        wheel.object.quaternion
          .copy(steeringQuaternion)
          .multiply(wheel.baseQuaternion)
          .multiply(spinQuaternion);
      } else {
        wheel.object.quaternion
          .copy(wheel.baseQuaternion)
          .multiply(spinQuaternion);
      }
    }
  });

  return (
    <group {...groupProps}>
      <group position={[0, MODEL_GROUND_OFFSET, 0]}>
        <group
          rotation={[0, Math.PI, 0]}
          scale={[
            AUTHORED_HERO_COUPE_SCALE[0],
            AUTHORED_HERO_COUPE_SCALE[1],
            AUTHORED_HERO_COUPE_SCALE[2],
          ]}
        >
          <primitive dispose={null} object={prepared.model} />
        </group>
        <AuthoredCoupeDynamicLight headlights={headlights} quality={quality} />
        {disabled ? (
          <group position={[0, 1.18, -1.42]}>
            <mesh scale={[0.22, 0.31, 0.22]}>
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
