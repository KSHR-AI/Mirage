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
  type Group,
} from "three";

import type {
  PoliceInterceptorModelProps,
  VehicleModelProps,
  VisualId,
} from "./types";

export type AuthoredHeroCoupeModelProps = VehicleModelProps;
export type AuthoredTrafficCoupeModelProps = VehicleModelProps;
export type AuthoredPoliceCoupeModelProps = PoliceInterceptorModelProps;

export interface AuthoredTrafficCoupePalette {
  readonly primary: string;
  readonly secondary: string;
}

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

export const AUTHORED_POLICE_COUPE_PALETTE = Object.freeze({
  primary: "#d4dcda",
  secondary: "#173039",
} as const);

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
const TRAFFIC_COUPE_PALETTES = Object.freeze([
  Object.freeze({ primary: "#47717a", secondary: "#18343a" }),
  Object.freeze({ primary: "#9a9d96", secondary: "#30383b" }),
  Object.freeze({ primary: "#9a684a", secondary: "#2d3436" }),
  Object.freeze({ primary: "#365d58", secondary: "#c5b898" }),
  Object.freeze({ primary: "#715f7c", secondary: "#252c31" }),
  Object.freeze({ primary: "#b0b0a3", secondary: "#385159" }),
] as const);

export interface AuthoredCoupeIdleMotion {
  readonly height: number;
  readonly roll: number;
}

export interface AuthoredCoupeBodyMotion extends AuthoredCoupeIdleMotion {
  readonly pitch: number;
}

export function sampleAuthoredCoupeIdleMotion(
  time: number,
  wheelSpin: number,
  disabled: boolean,
): AuthoredCoupeIdleMotion {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const safeSpin = Number.isFinite(wheelSpin) ? Math.abs(wheelSpin) : 0;
  const strength = disabled ? 0 : MathUtils.clamp(1 - safeSpin / 0.32, 0, 1);
  if (strength === 0) return { height: 0, roll: 0 };
  return {
    height: Math.sin(safeTime * 8.2) * 0.006 * strength,
    roll: Math.sin(safeTime * 4.1 + 0.7) * 0.0016 * strength,
  };
}

export function sampleAuthoredCoupeBodyMotion(
  time: number,
  wheelSpin: number,
  lateralLoad: number,
  longitudinalLoad: number,
  disabled: boolean,
): AuthoredCoupeBodyMotion {
  if (disabled) return { height: 0, pitch: 0, roll: 0 };
  const idle = sampleAuthoredCoupeIdleMotion(time, wheelSpin, false);
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const safeSpin = Number.isFinite(wheelSpin) ? Math.abs(wheelSpin) : 0;
  const speedStrength = MathUtils.clamp(safeSpin / 8, 0, 1);
  const lateral = MathUtils.clamp(
    Number.isFinite(lateralLoad) ? lateralLoad : 0,
    -1,
    1,
  );
  const longitudinal = MathUtils.clamp(
    Number.isFinite(longitudinalLoad) ? longitudinalLoad : 0,
    -1,
    1,
  );
  return {
    height:
      idle.height + Math.sin(safeTime * 17.5 + 0.4) * 0.0022 * speedStrength,
    pitch: -longitudinal * 0.024,
    roll: idle.roll - lateral * 0.052,
  };
}

function trafficCoupeHash(entityId: VisualId): number {
  const value = String(entityId);
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function getAuthoredTrafficCoupePalette(
  entityId: VisualId,
): AuthoredTrafficCoupePalette {
  return TRAFFIC_COUPE_PALETTES[
    trafficCoupeHash(entityId) % TRAFFIC_COUPE_PALETTES.length
  ];
}

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
  role: "hero" | "police" | "traffic",
  entityId: VisualId,
) {
  const treatment = getAuthoredHeroCoupeMaterialTreatment(
    material.name,
    brakeLights,
    headlights,
    damage,
  );
  if (!treatment) return;

  const trafficPalette = getAuthoredTrafficCoupePalette(entityId);
  const color =
    role === "police" && material.name === "Paint 1 Carmine"
      ? AUTHORED_POLICE_COUPE_PALETTE.primary
      : role === "police" &&
          ["Paint 2 Carmine", "Interior 3 Carmine"].includes(material.name)
        ? AUTHORED_POLICE_COUPE_PALETTE.secondary
        : role === "traffic" && material.name === "Paint 1 Carmine"
          ? trafficPalette.primary
          : role === "traffic" &&
              ["Paint 2 Carmine", "Interior 3 Carmine"].includes(material.name)
            ? trafficPalette.secondary
            : treatment.color;
  material.color.set(color);
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
  role,
}: {
  readonly headlights: boolean;
  readonly quality: "desktop" | "mobile";
  readonly role: "hero" | "police" | "traffic";
}) {
  const target = useMemo(() => new Object3D(), []);

  return (
    <group name="authored-coupe-lighting">
      <primitive object={target} position={[0, 0.22, -18]} />
      {headlights && quality === "desktop" && role === "hero" ? (
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
      {headlights && quality === "desktop" ? (
        <mesh
          position={[0, 0.026, -5.25]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[1.15, 3.7, 1]}
        >
          <circleGeometry args={[1, 20]} />
          <meshBasicMaterial
            color="#ffe4ad"
            depthWrite={false}
            fog
            opacity={role === "hero" ? 0.095 : 0.065}
            toneMapped={false}
            transparent
          />
        </mesh>
      ) : null}
    </group>
  );
}

function AuthoredPoliceAccessories({
  emergencyLights,
  phase,
  quality,
}: {
  readonly emergencyLights: boolean;
  readonly phase: number;
  readonly quality: "desktop" | "mobile";
}) {
  const normalizedPhase = MathUtils.clamp(
    Number.isFinite(phase) ? phase : 0,
    0,
    1,
  );
  const red = emergencyLights ? 1.8 + normalizedPhase * 5.2 : 0.08;
  const blue = emergencyLights ? 1.8 + (1 - normalizedPhase) * 5.2 : 0.08;

  return (
    <group name="authored-police-accessories">
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.987, 0.72, 0.08]}>
          <mesh>
            <boxGeometry args={[0.028, 0.2, 3.28]} />
            <meshStandardMaterial
              color="#14272e"
              metalness={0.4}
              roughness={0.46}
            />
          </mesh>
          <mesh position={[side * 0.018, 0, -0.5]}>
            <boxGeometry args={[0.018, 0.075, 1.22]} />
            <meshBasicMaterial color="#d8e3df" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <group position={[0, 1.49, 0.16]}>
        <mesh castShadow>
          <boxGeometry args={[1.28, 0.12, 0.27]} />
          <meshStandardMaterial
            color="#101a1e"
            metalness={0.68}
            roughness={0.28}
          />
        </mesh>
        <mesh position={[-0.36, 0.095, 0]}>
          <boxGeometry args={[0.48, 0.14, 0.2]} />
          <meshStandardMaterial
            color="#ef5262"
            emissive="#ff2949"
            emissiveIntensity={red}
            roughness={0.18}
          />
        </mesh>
        <mesh position={[0.36, 0.095, 0]}>
          <boxGeometry args={[0.48, 0.14, 0.2]} />
          <meshStandardMaterial
            color="#52c4de"
            emissive="#25bde2"
            emissiveIntensity={blue}
            roughness={0.18}
          />
        </mesh>
        {emergencyLights && quality === "desktop" ? (
          <>
            <pointLight
              color="#ff3352"
              distance={8}
              intensity={red * 0.52}
              position={[-0.4, 0.24, 0]}
            />
            <pointLight
              color="#31bfe1"
              distance={8}
              intensity={blue * 0.52}
              position={[0.4, 0.24, 0]}
            />
          </>
        ) : null}
      </group>
      <group position={[0, 0.44, -2.45]}>
        <mesh>
          <boxGeometry args={[1.52, 0.13, 0.14]} />
          <meshStandardMaterial
            color="#111b1f"
            metalness={0.7}
            roughness={0.4}
          />
        </mesh>
        {[-0.61, 0.61].map((x) => (
          <mesh key={x} position={[x, 0.23, 0.02]}>
            <boxGeometry args={[0.08, 0.5, 0.09]} />
            <meshStandardMaterial
              color="#111b1f"
              metalness={0.7}
              roughness={0.4}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function AuthoredCoupeModel({
  brakeLights = false,
  damage = 0,
  disabled = false,
  entityId = "mirage-hero",
  headlights = false,
  quality = "desktop",
  role,
  emergencyLights = true,
  lateralLoad = 0,
  longitudinalLoad = 0,
  sirenPhase = 0,
  steering = 0,
  wheelSpin = 0,
  ...groupProps
}: VehicleModelProps & {
  readonly emergencyLights?: boolean;
  readonly role: "hero" | "police" | "traffic";
  readonly sirenPhase?: number;
}) {
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
  const idleTime = useRef(0);
  const presentationRoot = useRef<Group>(null);
  const presentedLateralLoad = useRef(0);
  const presentedLongitudinalLoad = useRef(0);
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
        role,
        entityId,
      );
    }
  }, [
    brakeLights,
    disabled,
    entityId,
    headlights,
    normalizedDamage,
    prepared,
    quality,
    role,
  ]);

  useEffect(
    () => () => {
      for (const material of prepared.materials) material.dispose();
    },
    [prepared],
  );

  useFrame((_, dt) => {
    const safeDt = Math.min(
      Math.max(Number.isFinite(dt) ? dt : 0, 0),
      MAX_FRAME_DT,
    );
    idleTime.current += safeDt;
    accumulatedSpin.current = advanceAuthoredWheelSpin(
      accumulatedSpin.current,
      wheelSpin,
      safeDt,
    );
    const motionDisabled = disabled || role !== "hero";
    presentedLateralLoad.current = MathUtils.damp(
      presentedLateralLoad.current,
      motionDisabled || !Number.isFinite(lateralLoad)
        ? 0
        : MathUtils.clamp(lateralLoad, -1, 1),
      7.5,
      safeDt,
    );
    presentedLongitudinalLoad.current = MathUtils.damp(
      presentedLongitudinalLoad.current,
      motionDisabled || !Number.isFinite(longitudinalLoad)
        ? 0
        : MathUtils.clamp(longitudinalLoad, -1, 1),
      9,
      safeDt,
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
    if (presentationRoot.current) {
      const motion = sampleAuthoredCoupeBodyMotion(
        idleTime.current,
        wheelSpin,
        presentedLateralLoad.current,
        presentedLongitudinalLoad.current,
        motionDisabled,
      );
      presentationRoot.current.position.y = MODEL_GROUND_OFFSET + motion.height;
      presentationRoot.current.rotation.x = motion.pitch;
      presentationRoot.current.rotation.z = motion.roll;
    }
  });

  return (
    <group {...groupProps}>
      <group position={[0, MODEL_GROUND_OFFSET, 0]} ref={presentationRoot}>
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
        <AuthoredCoupeDynamicLight
          headlights={headlights}
          quality={quality}
          role={role}
        />
        {role === "police" ? (
          <AuthoredPoliceAccessories
            emergencyLights={emergencyLights}
            phase={sirenPhase}
            quality={quality}
          />
        ) : null}
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

export function AuthoredHeroCoupeModel(props: AuthoredHeroCoupeModelProps) {
  return <AuthoredCoupeModel {...props} role="hero" />;
}

export function AuthoredTrafficCoupeModel(
  props: AuthoredTrafficCoupeModelProps,
) {
  return <AuthoredCoupeModel {...props} role="traffic" />;
}

export function AuthoredPoliceCoupeModel(props: AuthoredPoliceCoupeModelProps) {
  return <AuthoredCoupeModel {...props} role="police" />;
}
