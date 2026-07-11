"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  LoopOnce,
  LoopRepeat,
  Material,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  getAgentAppearance,
  hashVisualId,
  type AgentAppearance,
  type AgentVisualRole,
} from "./appearance";
import { MuzzleFlash } from "./effects";
import type { AgentAnimationState, AgentModelProps, VisualId } from "./types";

export interface AuthoredAgentModelProps extends AgentModelProps {
  readonly role: AgentVisualRole;
}

export interface AuthoredAgentVariation {
  readonly animationPhase: number;
  readonly playbackRate: number;
  readonly scale: number;
}

export interface AuthoredAgentMaterialTreatment {
  readonly color: string;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly metalness: number;
  readonly opacity?: number;
  readonly roughness: number;
  readonly transparent?: boolean;
}

interface PreparedAgentModel {
  readonly materials: readonly Material[];
  readonly scene: Object3D;
}

export const AUTHORED_AGENT_MODEL_URLS: Readonly<
  Record<AgentVisualRole, string>
> = Object.freeze({
  player: "/game-assets/models/characters/runner.glb",
  civilian: "/game-assets/models/characters/civilian.glb",
  guard: "/game-assets/models/characters/officer.glb",
  police: "/game-assets/models/characters/officer.glb",
});

export const AUTHORED_AGENT_CLIP_CANDIDATES: Readonly<
  Record<AgentAnimationState, readonly string[]>
> = Object.freeze({
  idle: Object.freeze(["Idle_Neutral", "Idle"]),
  walk: Object.freeze(["Walk"]),
  run: Object.freeze(["Run"]),
  jump: Object.freeze(["Run", "Idle_Neutral"]),
  aim: Object.freeze(["Idle_Gun_Pointing"]),
  fire: Object.freeze(["Idle_Gun_Shoot", "Gun_Shoot"]),
  cower: Object.freeze(["Idle"]),
  down: Object.freeze(["Death"]),
});

const CROSS_FADE_SECONDS = 0.18;
const MODEL_FOOT_LIFT = 0.0026;
const MODEL_EQUIPMENT_HEIGHT = 1;
const WALK_CYCLE_DISTANCE = 1.76;
const RUN_CYCLE_DISTANCE = 2.08;
const RUN_THRESHOLD = 4.2;
const MAX_AIM_YAW = 0.78;
const MAX_AIM_PITCH = 0.55;
const ONE_SHOT_STATES: ReadonlySet<AgentAnimationState> = new Set([
  "fire",
  "down",
]);

function shadedColor(color: string, intensity: number): string {
  return `#${new Color(color).multiplyScalar(intensity).getHexString()}`;
}

function agentMaterialTreatment(
  color: string,
  roughness: number,
  metalness = 0.03,
  options: Pick<
    AuthoredAgentMaterialTreatment,
    "emissive" | "emissiveIntensity" | "opacity" | "transparent"
  > = {},
): AuthoredAgentMaterialTreatment {
  return Object.freeze({ color, metalness, roughness, ...options });
}

export function getAuthoredAgentMaterialTreatment(
  materialName: string,
  appearance: AgentAppearance,
  role: AgentVisualRole,
): AuthoredAgentMaterialTreatment | null {
  const canonicalName = materialName.toLowerCase().replace(/[^a-z0-9]/g, "");

  switch (canonicalName) {
    case "skin":
      return agentMaterialTreatment(appearance.skin, 0.62, 0);
    case "green":
    case "purple":
    case "swat":
      return agentMaterialTreatment(appearance.jacket, 0.54);
    case "lightgreen":
    case "white":
      return agentMaterialTreatment(appearance.shirt, 0.58, 0.01);
    case "brown":
    case "lightblue":
    case "swatblack":
      return agentMaterialTreatment(appearance.trousers, 0.61);
    case "brown2":
      return agentMaterialTreatment(
        shadedColor(appearance.trousers, 0.68),
        0.65,
      );
    case "grey":
      return agentMaterialTreatment(
        role === "guard" || role === "police"
          ? shadedColor(appearance.jacket, 0.72)
          : appearance.shoes,
        0.56,
        0.08,
      );
    case "black":
    case "darkbrown":
      return agentMaterialTreatment(appearance.shoes, 0.5, 0.12);
    case "hair":
    case "eyebrows":
      return agentMaterialTreatment(appearance.hair, 0.67, 0);
    case "eye":
      return agentMaterialTreatment("#11191b", 0.28, 0, {
        emissive: "#7fb2ae",
        emissiveIntensity: 0.035,
      });
    case "gold":
      return agentMaterialTreatment(appearance.accent, 0.24, 0.72, {
        emissive: appearance.accent,
        emissiveIntensity: 0.045,
      });
    case "visor":
      return agentMaterialTreatment("#102a31", 0.16, 0.28, {
        opacity: 0.82,
        transparent: true,
      });
    default:
      return null;
  }
}

function applyAgentMaterialTreatment(
  material: Material,
  appearance: AgentAppearance,
  role: AgentVisualRole,
) {
  if (!(material instanceof MeshStandardMaterial)) return;
  const treatment = getAuthoredAgentMaterialTreatment(
    material.name,
    appearance,
    role,
  );
  if (!treatment) return;

  material.color.set(treatment.color);
  material.metalness = treatment.metalness;
  material.roughness = treatment.roughness;
  material.envMapIntensity = role === "player" ? 1.15 : 0.92;
  material.emissive.set(treatment.emissive ?? "#000000");
  material.emissiveIntensity = treatment.emissiveIntensity ?? 0;
  material.opacity = treatment.opacity ?? 1;
  material.transparent = treatment.transparent ?? false;
  material.depthWrite = !material.transparent;
  material.needsUpdate = true;
}

function prepareAuthoredAgentModel(
  source: Object3D,
  appearance: AgentAppearance,
  role: AgentVisualRole,
): PreparedAgentModel {
  const scene = SkeletonUtils.clone(source);
  const materialClones = new Map<Material, Material>();

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const materials = sourceMaterials.map((sourceMaterial) => {
      const existing = materialClones.get(sourceMaterial);
      if (existing) return existing;
      const clone = sourceMaterial.clone();
      applyAgentMaterialTreatment(clone, appearance, role);
      materialClones.set(sourceMaterial, clone);
      return clone;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });

  return {
    materials: [...materialClones.values()],
    scene,
  };
}

interface ActiveActionState {
  readonly action: AnimationAction;
  readonly animation: AgentAnimationState;
  readonly muzzleFlash: boolean;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function canonicalClipName(name: string): string {
  const segments = name.trim().split(/[|:]/);
  const localName = segments[segments.length - 1] ?? name;
  return localName
    .replace(/\.\d+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function findClipName(
  clipNames: readonly string[],
  candidates: readonly string[],
): string | null {
  for (const candidate of candidates) {
    const exact = clipNames.find((name) => name === candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const canonicalCandidate = canonicalClipName(candidate);
    const normalized = clipNames.find(
      (name) => canonicalClipName(name) === canonicalCandidate,
    );
    if (normalized) return normalized;
  }

  return null;
}

export function resolveAuthoredAgentClipName(
  clipNames: readonly string[],
  animation: AgentAnimationState,
): string | null {
  const requested = findClipName(
    clipNames,
    AUTHORED_AGENT_CLIP_CANDIDATES[animation],
  );
  if (requested) return requested;

  return findClipName(clipNames, AUTHORED_AGENT_CLIP_CANDIDATES.idle);
}

export function resolveAuthoredAgentAnimation(
  animation: AgentAnimationState | undefined,
  speed: number | undefined,
  aim: boolean,
  muzzleFlash: boolean,
): AgentAnimationState {
  if (animation) return animation;
  if (muzzleFlash) return "fire";
  if (aim) return "aim";

  const resolvedSpeed = Math.max(0, finiteOr(speed, 0));
  if (resolvedSpeed > RUN_THRESHOLD) return "run";
  if (resolvedSpeed > 0.12) return "walk";
  return "idle";
}

export function getAuthoredAgentVariation(
  entityId: VisualId,
  role: AgentVisualRole,
): AuthoredAgentVariation {
  const appearance = getAgentAppearance(entityId, role);
  const hash = hashVisualId(entityId, `authored-agent:${role}`);

  return Object.freeze({
    animationPhase: role === "player" ? 0 : appearance.phase / (Math.PI * 2),
    playbackRate: role === "player" ? 1 : 0.96 + ((hash >>> 24) % 9) / 100,
    scale: appearance.heightScale,
  });
}

export function getAuthoredAgentTimeScale(
  animation: AgentAnimationState,
  speed: number | undefined,
  playbackRate = 1,
  clipDuration = 1,
  modelScale = 1,
): number {
  const resolvedSpeed = Math.max(0, finiteOr(speed, 0));
  const resolvedPlaybackRate = MathUtils.clamp(
    finiteOr(playbackRate, 1),
    0.9,
    1.1,
  );
  const resolvedDuration = Math.max(0.01, finiteOr(clipDuration, 1));
  const resolvedScale = MathUtils.clamp(finiteOr(modelScale, 1), 0.5, 1.5);
  let locomotionRate = 1;

  if (animation === "walk") {
    locomotionRate = MathUtils.clamp(
      (resolvedSpeed * resolvedDuration) /
        (WALK_CYCLE_DISTANCE * resolvedScale),
      0.55,
      3.2,
    );
  } else if (animation === "run" || animation === "jump") {
    locomotionRate = MathUtils.clamp(
      (resolvedSpeed * resolvedDuration) / (RUN_CYCLE_DISTANCE * resolvedScale),
      0.65,
      3.2,
    );
  }

  return locomotionRate * resolvedPlaybackRate;
}

function clipForName(
  clips: readonly AnimationClip[],
  name: string | null,
): AnimationClip | null {
  if (!name) return null;
  return clips.find((clip) => clip.name === name) ?? null;
}

function AuthoredAgentEquipment({
  active,
  muzzleFlash,
  quality,
  role,
}: {
  readonly active: boolean;
  readonly muzzleFlash: boolean;
  readonly quality: "desktop" | "mobile";
  readonly role: AgentVisualRole;
}) {
  if (role === "civilian") return null;

  return active ? (
    <group position={[0.22, MODEL_EQUIPMENT_HEIGHT + 0.2, 0.39]}>
      <mesh castShadow={quality === "desktop"} position={[0, 0, 0.12]}>
        <boxGeometry args={[0.12, 0.14, 0.38]} />
        <meshStandardMaterial
          color="#151b1e"
          metalness={0.68}
          roughness={0.3}
        />
      </mesh>
      <mesh
        castShadow={quality === "desktop"}
        position={[0, -0.14, 0.02]}
        rotation={[-0.24, 0, 0]}
      >
        <boxGeometry args={[0.1, 0.25, 0.14]} />
        <meshStandardMaterial
          color="#293337"
          metalness={0.34}
          roughness={0.56}
        />
      </mesh>
      <mesh position={[0, 0.01, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.2, 8]} />
        <meshStandardMaterial
          color="#0b1012"
          metalness={0.82}
          roughness={0.22}
        />
      </mesh>
      <MuzzleFlash
        active={muzzleFlash}
        position={[0, 0.01, 0.49]}
        quality={quality}
      />
    </group>
  ) : (
    <group
      position={[0.42, MODEL_EQUIPMENT_HEIGHT - 0.18, 0.02]}
      rotation={[0, 0, -0.1]}
    >
      <mesh castShadow={quality === "desktop"}>
        <boxGeometry args={[0.14, 0.34, 0.12]} />
        <meshStandardMaterial color="#151a1c" roughness={0.68} />
      </mesh>
    </group>
  );
}

export function AuthoredAgentModel({
  aim = false,
  aimPitch = 0,
  aimYaw = 0,
  animation,
  direction = 0,
  entityId,
  muzzleFlash = false,
  quality = "desktop",
  role,
  speed = 0,
  ...groupProps
}: AuthoredAgentModelProps) {
  const modelUrl = AUTHORED_AGENT_MODEL_URLS[role];
  const { animations, scene } = useGLTF(modelUrl);
  const appearance = useMemo(
    () => getAgentAppearance(entityId, role),
    [entityId, role],
  );
  const preparedModel = useMemo(
    () => prepareAuthoredAgentModel(scene, appearance, role),
    [appearance, role, scene],
  );
  const clonedScene = preparedModel.scene;
  const variation = useMemo(
    () => getAuthoredAgentVariation(entityId, role),
    [entityId, role],
  );
  const resolvedAnimation = resolveAuthoredAgentAnimation(
    animation,
    speed,
    aim,
    muzzleFlash,
  );
  const { actions, clips } = useAnimations(animations, clonedScene);
  const activeClipName = useMemo(
    () =>
      resolveAuthoredAgentClipName(
        clips.map((clip) => clip.name),
        resolvedAnimation,
      ),
    [clips, resolvedAnimation],
  );
  const activeClip = useMemo(
    () => clipForName(clips, activeClipName),
    [activeClipName, clips],
  );
  const timeScale = getAuthoredAgentTimeScale(
    resolvedAnimation,
    speed,
    variation.playbackRate,
    activeClip?.duration,
    variation.scale,
  );
  const activeAction = activeClipName ? actions[activeClipName] : null;
  const activeActionRef = useRef<ActiveActionState | null>(null);

  useEffect(
    () => () => {
      for (const material of preparedModel.materials) material.dispose();
    },
    [preparedModel],
  );

  useLayoutEffect(() => {
    clonedScene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = quality === "desktop";
      object.receiveShadow = true;
    });
  }, [clonedScene, quality]);

  /* eslint-disable react-hooks/immutability -- AnimationAction is an imperative Three.js controller. */
  useEffect(() => {
    const previous = activeActionRef.current;
    if (!activeAction || !activeClip) {
      previous?.action.fadeOut(CROSS_FADE_SECONDS);
      activeActionRef.current = null;
      return;
    }

    const shouldRestart =
      !previous ||
      previous.action !== activeAction ||
      previous.animation !== resolvedAnimation ||
      (resolvedAnimation === "fire" && muzzleFlash && !previous.muzzleFlash);

    activeAction.enabled = true;
    activeAction.setEffectiveTimeScale(timeScale);
    activeAction.setEffectiveWeight(1);

    if (shouldRestart) {
      const oneShot = ONE_SHOT_STATES.has(resolvedAnimation);
      activeAction.clampWhenFinished = oneShot;
      activeAction.setLoop(
        oneShot ? LoopOnce : LoopRepeat,
        oneShot ? 1 : Infinity,
      );
      activeAction.reset();
      activeAction.setEffectiveTimeScale(timeScale);
      activeAction.setEffectiveWeight(1);
      if (!oneShot && activeClip.duration > 0) {
        activeAction.time = variation.animationPhase * activeClip.duration;
      }
      activeAction.play();

      if (previous && previous.action !== activeAction) {
        if (previous.action.getMixer() === activeAction.getMixer()) {
          activeAction.crossFadeFrom(previous.action, CROSS_FADE_SECONDS, true);
        } else {
          previous.action.fadeOut(CROSS_FADE_SECONDS);
          activeAction.fadeIn(CROSS_FADE_SECONDS);
        }
      } else {
        activeAction.fadeIn(CROSS_FADE_SECONDS);
      }
    }

    activeActionRef.current = {
      action: activeAction,
      animation: resolvedAnimation,
      muzzleFlash,
    };
  }, [
    activeAction,
    activeClip,
    muzzleFlash,
    resolvedAnimation,
    timeScale,
    variation.animationPhase,
  ]);
  /* eslint-enable react-hooks/immutability */

  const aiming = resolvedAnimation === "aim" || resolvedAnimation === "fire";
  const resolvedDirection = finiteOr(direction, 0);
  const resolvedAimYaw = aiming
    ? MathUtils.clamp(finiteOr(aimYaw, 0), -MAX_AIM_YAW, MAX_AIM_YAW)
    : 0;
  const resolvedAimPitch = aiming
    ? MathUtils.clamp(finiteOr(aimPitch, 0), -MAX_AIM_PITCH, MAX_AIM_PITCH)
    : 0;

  return (
    <group {...groupProps}>
      <group rotation={[0, resolvedDirection, 0]}>
        <group
          position={[0, MODEL_FOOT_LIFT * variation.scale, 0]}
          rotation={[-resolvedAimPitch * 0.16, resolvedAimYaw, 0]}
          scale={variation.scale}
        >
          <primitive dispose={null} object={clonedScene} />
          <AuthoredAgentEquipment
            active={aiming}
            muzzleFlash={muzzleFlash || resolvedAnimation === "fire"}
            quality={quality}
            role={role}
          />
        </group>
      </group>
    </group>
  );
}
