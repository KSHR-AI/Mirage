"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { createPortal, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  Material,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PropertyBinding,
  type AnimationAction,
  type AnimationClip,
  type BufferGeometry,
  type Object3D,
  Vector3,
} from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  getAgentAppearance,
  hashVisualId,
  type AgentAppearance,
  type AgentVisualRole,
} from "./appearance";
import { Signal9Equipment } from "./authored-agent-equipment";
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

export interface AuthoredRunnerLoadoutProbe {
  readonly colors: readonly string[];
  readonly meshCount: number;
  readonly visible: boolean;
}

interface PreparedAgentModel {
  readonly geometries: readonly BufferGeometry[];
  readonly materials: readonly Material[];
  readonly scene: Object3D;
}

function belongsToNamedNode(object: Object3D, nodeName: string): boolean {
  let candidate: Object3D | null = object;
  while (candidate) {
    if (candidate.name === nodeName) return true;
    candidate = candidate.parent;
  }
  return false;
}

export function inspectAuthoredRunnerLoadout(
  scene: Object3D,
): AuthoredRunnerLoadoutProbe {
  const loadout = scene.getObjectByName("Backpack");
  const colors = new Set<string>();
  let meshCount = 0;

  loadout?.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshCount += 1;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial) {
        colors.add(`#${material.color.getHexString()}`);
      }
    }
  });

  return Object.freeze({
    colors: Object.freeze([...colors].sort()),
    meshCount,
    visible: Boolean(loadout?.visible),
  });
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

const DEFAULT_CROSS_FADE_SECONDS = 0.18;
const MODEL_FOOT_LIFT = 0.0026;
const WALK_CYCLE_DISTANCE = 1.76;
const RUN_CYCLE_DISTANCE = 2.08;
const RUN_THRESHOLD = 4.2;
const MAX_AIM_YAW = 0.78;
const MAX_AIM_PITCH = 0.55;
const DIRECTION_DAMPING = 18;
const TURN_LEAN_DAMPING = 10;
const MAX_TURN_LEAN = 0.105;
const HERO_CREASE_ANGLE = 0.92;
const ANIMATION_PROBE_INTERVAL = 0.25;
const ONE_SHOT_STATES: ReadonlySet<AgentAnimationState> = new Set([
  "fire",
  "down",
]);
const LOCOMOTION_STATES: ReadonlySet<AgentAnimationState> = new Set([
  "walk",
  "run",
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

export function getAuthoredRunnerLoadoutTreatment(
  materialName: string,
  appearance: AgentAppearance,
): AuthoredAgentMaterialTreatment | null {
  const canonicalName = materialName.toLowerCase().replace(/[^a-z0-9]/g, "");

  switch (canonicalName) {
    case "green":
      return agentMaterialTreatment("#173b40", 0.48, 0.08);
    case "lightgreen":
      return agentMaterialTreatment("#41585b", 0.5, 0.12);
    case "brown":
      return agentMaterialTreatment("#20292d", 0.57, 0.08);
    case "brown2":
      return agentMaterialTreatment("#11181c", 0.52, 0.16);
    case "gold":
      return agentMaterialTreatment(appearance.accent, 0.22, 0.76, {
        emissive: appearance.accent,
        emissiveIntensity: 0.08,
      });
    default:
      return getAuthoredAgentMaterialTreatment(
        materialName,
        appearance,
        "player",
      );
  }
}

function applyAgentMaterialTreatment(
  material: Material,
  appearance: AgentAppearance,
  role: AgentVisualRole,
  override?: AuthoredAgentMaterialTreatment | null,
) {
  if (!(material instanceof MeshStandardMaterial)) return;
  const treatment =
    override ??
    getAuthoredAgentMaterialTreatment(material.name, appearance, role);
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
  material.dithering = true;
  material.flatShading = false;
  material.needsUpdate = true;
}

function prepareAuthoredAgentModel(
  source: Object3D,
  appearance: AgentAppearance,
  role: AgentVisualRole,
  quality: "desktop" | "mobile",
): PreparedAgentModel {
  const scene = SkeletonUtils.clone(source);
  const materialClones = new Map<Material, Material>();
  const ownedMaterials = new Set<Material>();
  const geometries: BufferGeometry[] = [];
  const smoothHero = role === "player" && quality === "desktop";

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (smoothHero) {
      const geometry = object.geometry.clone();
      const smoothed = toCreasedNormals(geometry, HERO_CREASE_ANGLE);
      if (smoothed !== geometry) geometry.dispose();
      object.geometry = smoothed;
      geometries.push(smoothed);
    }
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const loadout = role === "player" && belongsToNamedNode(object, "Backpack");
    const materials = sourceMaterials.map((sourceMaterial) => {
      const existing = loadout ? undefined : materialClones.get(sourceMaterial);
      if (existing) return existing;
      const clone = sourceMaterial.clone();
      applyAgentMaterialTreatment(
        clone,
        appearance,
        role,
        loadout
          ? getAuthoredRunnerLoadoutTreatment(clone.name, appearance)
          : undefined,
      );
      ownedMaterials.add(clone);
      if (!loadout) materialClones.set(sourceMaterial, clone);
      return clone;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });

  return {
    geometries,
    materials: [...ownedMaterials],
    scene,
  };
}

interface ActiveActionState {
  readonly action: AnimationAction;
  readonly animation: AgentAnimationState;
  readonly muzzleFlash: boolean;
}

export function shouldRestartAuthoredAgentAction({
  animation,
  muzzleFlash,
  previousActionMatches,
  previousAnimationMatches,
  previousMuzzleFlash,
  scheduled,
}: {
  readonly animation: AgentAnimationState;
  readonly muzzleFlash: boolean;
  readonly previousActionMatches: boolean;
  readonly previousAnimationMatches: boolean;
  readonly previousMuzzleFlash: boolean;
  readonly scheduled: boolean;
}): boolean {
  return (
    !previousActionMatches ||
    !previousAnimationMatches ||
    !scheduled ||
    (animation === "fire" && muzzleFlash && !previousMuzzleFlash)
  );
}

export function getAuthoredAgentCrossFadeSeconds(
  previous: AgentAnimationState | undefined,
  next: AgentAnimationState,
): number {
  if (next === "fire" || next === "down") return 0.08;
  if (
    LOCOMOTION_STATES.has(previous ?? "idle") &&
    LOCOMOTION_STATES.has(next)
  ) {
    return 0.12;
  }
  if (LOCOMOTION_STATES.has(next)) return 0.14;
  if (LOCOMOTION_STATES.has(previous ?? "idle")) return 0.2;
  return DEFAULT_CROSS_FADE_SECONDS;
}

export function getAuthoredAgentTransitionPhase(
  previousAnimation: AgentAnimationState | undefined,
  nextAnimation: AgentAnimationState,
  previousTime: number | undefined,
  previousDuration: number | undefined,
  fallbackPhase: number,
): number {
  const fallback = MathUtils.euclideanModulo(finiteOr(fallbackPhase, 0), 1);
  if (
    !previousAnimation ||
    !LOCOMOTION_STATES.has(previousAnimation) ||
    !LOCOMOTION_STATES.has(nextAnimation)
  ) {
    return fallback;
  }

  const duration = finiteOr(previousDuration, 0);
  if (duration <= 0) return fallback;
  return (
    MathUtils.euclideanModulo(finiteOr(previousTime, 0), duration) / duration
  );
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function dampAuthoredAgentDirection(
  current: number,
  target: number,
  deltaSeconds: number,
  damping = DIRECTION_DAMPING,
): number {
  const resolvedCurrent = finiteOr(current, 0);
  const resolvedTarget = finiteOr(target, resolvedCurrent);
  const delta = MathUtils.clamp(finiteOr(deltaSeconds, 0), 0, 0.05);
  const blend = 1 - Math.exp(-Math.max(0, damping) * delta);
  const next =
    resolvedCurrent + angleDelta(resolvedCurrent, resolvedTarget) * blend;
  return Math.atan2(Math.sin(next), Math.cos(next));
}

export function getAuthoredAgentTurnLean(
  currentDirection: number,
  nextDirection: number,
  speed: number,
  deltaSeconds: number,
): number {
  const delta = MathUtils.clamp(finiteOr(deltaSeconds, 0), 1 / 240, 0.05);
  const speedWeight = MathUtils.clamp(finiteOr(speed, 0) / RUN_THRESHOLD, 0, 1);
  if (speedWeight === 0) return 0;
  const turnRate = angleDelta(currentDirection, nextDirection) / delta;
  return MathUtils.clamp(
    -turnRate * 0.026 * speedWeight,
    -MAX_TURN_LEAN,
    MAX_TURN_LEAN,
  );
}

function findRuntimeNode(scene: Object3D, sourceName: string): Object3D | null {
  return (
    scene.getObjectByName(sourceName) ??
    scene.getObjectByName(PropertyBinding.sanitizeNodeName(sourceName)) ??
    null
  );
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
    () => prepareAuthoredAgentModel(scene, appearance, role, quality),
    [appearance, quality, role, scene],
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
  const aiming = resolvedAnimation === "aim" || resolvedAnimation === "fire";
  const resolvedDirection = finiteOr(direction, 0);
  const resolvedAimYaw = aiming
    ? MathUtils.clamp(finiteOr(aimYaw, 0), -MAX_AIM_YAW, MAX_AIM_YAW)
    : 0;
  const resolvedAimPitch = aiming
    ? MathUtils.clamp(finiteOr(aimPitch, 0), -MAX_AIM_PITCH, MAX_AIM_PITCH)
    : 0;
  const { clips, mixer } = useAnimations(animations, clonedScene);
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
  const activeActionRef = useRef<ActiveActionState | null>(null);
  const directionRootRef = useRef<Group>(null);
  const bodyRootRef = useRef<Group>(null);
  const presentedDirectionRef = useRef(resolvedDirection);
  const presentedLeanRef = useRef(0);
  const presentedAimYawRef = useRef(0);
  const presentedAimPitchRef = useRef(0);
  const animationProbeRef = useRef({
    elapsed: 0,
    wristPosition: new Vector3(),
  });
  const attachmentNodes = useMemo(
    () => ({
      chest: findRuntimeNode(clonedScene, "Chest"),
      hips: findRuntimeNode(clonedScene, "Hips"),
      neck: findRuntimeNode(clonedScene, "Neck"),
      wrist: findRuntimeNode(clonedScene, "Wrist.R"),
    }),
    [clonedScene],
  );
  const loadoutProbe = useMemo(
    () => inspectAuthoredRunnerLoadout(clonedScene),
    [clonedScene],
  );

  useEffect(
    () => () => {
      for (const material of preparedModel.materials) material.dispose();
      for (const geometry of preparedModel.geometries) geometry.dispose();
    },
    [preparedModel],
  );

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "development" ||
      role !== "player" ||
      typeof document === "undefined" ||
      !new URLSearchParams(window.location.search).has("inspect")
    ) {
      return;
    }
    document.documentElement.dataset.mirageAgentLoadout =
      JSON.stringify(loadoutProbe);
    return () => {
      delete document.documentElement.dataset.mirageAgentLoadout;
    };
  }, [loadoutProbe, role]);

  useLayoutEffect(() => {
    if (directionRootRef.current) {
      directionRootRef.current.rotation.y = presentedDirectionRef.current;
    }
    clonedScene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = quality === "desktop";
      object.receiveShadow = true;
    });
  }, [clonedScene, quality]);

  /* eslint-disable react-hooks/immutability -- Bone and group transforms are presentation-only Three.js frame state. */
  useFrame((_, rawDelta) => {
    const delta = MathUtils.clamp(rawDelta, 0, 0.05);
    const directionRoot = directionRootRef.current;
    const bodyRoot = bodyRootRef.current;
    const previousDirection = presentedDirectionRef.current;
    const nextDirection = dampAuthoredAgentDirection(
      previousDirection,
      resolvedDirection,
      delta,
    );
    presentedDirectionRef.current = nextDirection;
    if (directionRoot) directionRoot.rotation.y = nextDirection;

    const turnLean = getAuthoredAgentTurnLean(
      previousDirection,
      nextDirection,
      speed,
      delta,
    );
    presentedLeanRef.current = MathUtils.damp(
      presentedLeanRef.current,
      turnLean,
      TURN_LEAN_DAMPING,
      delta,
    );
    if (bodyRoot) {
      bodyRoot.rotation.z = presentedLeanRef.current;
      bodyRoot.rotation.x = MathUtils.damp(
        bodyRoot.rotation.x,
        -MathUtils.clamp(finiteOr(speed, 0) / 9, 0, 1) * 0.038,
        8,
        delta,
      );
    }

    presentedAimYawRef.current = MathUtils.damp(
      presentedAimYawRef.current,
      resolvedAimYaw,
      14,
      delta,
    );
    presentedAimPitchRef.current = MathUtils.damp(
      presentedAimPitchRef.current,
      resolvedAimPitch,
      14,
      delta,
    );
    if (attachmentNodes.chest) {
      attachmentNodes.chest.rotation.y += presentedAimYawRef.current * 0.58;
      attachmentNodes.chest.rotation.x -= presentedAimPitchRef.current * 0.34;
    }
    if (attachmentNodes.neck) {
      attachmentNodes.neck.rotation.y += presentedAimYawRef.current * 0.22;
      attachmentNodes.neck.rotation.x -= presentedAimPitchRef.current * 0.16;
    }

    const probe = animationProbeRef.current;
    probe.elapsed += delta;
    if (
      process.env.NODE_ENV === "development" &&
      role === "player" &&
      probe.elapsed >= ANIMATION_PROBE_INTERVAL &&
      typeof document !== "undefined" &&
      new URLSearchParams(window.location.search).has("inspect")
    ) {
      probe.elapsed = 0;
      const actionState = activeActionRef.current;
      const wristPosition = attachmentNodes.wrist?.getWorldPosition(
        probe.wristPosition,
      );
      document.documentElement.dataset.mirageAgentAnimation = resolvedAnimation;
      document.documentElement.dataset.mirageAgentClip =
        actionState?.action.getClip().name ?? "none";
      document.documentElement.dataset.mirageAgentAction = JSON.stringify({
        running: actionState?.action.isRunning() ?? false,
        scheduled: actionState?.action.isScheduled() ?? false,
        time: Number((actionState?.action.time ?? 0).toFixed(3)),
        timeScale: Number(
          (actionState?.action.getEffectiveTimeScale() ?? 0).toFixed(3),
        ),
        weight: Number(
          (actionState?.action.getEffectiveWeight() ?? 0).toFixed(3),
        ),
        wrist: wristPosition
          ? wristPosition.toArray().map((value) => Number(value.toFixed(3)))
          : null,
      });
    }
  });
  /* eslint-enable react-hooks/immutability */

  useEffect(() => {
    const previous = activeActionRef.current;
    if (!activeClip) {
      previous?.action.fadeOut(DEFAULT_CROSS_FADE_SECONDS);
      activeActionRef.current = null;
      return;
    }
    const activeAction = mixer.clipAction(activeClip, clonedScene);
    const crossFadeSeconds = getAuthoredAgentCrossFadeSeconds(
      previous?.animation,
      resolvedAnimation,
    );
    const transitionPhase = getAuthoredAgentTransitionPhase(
      previous?.animation,
      resolvedAnimation,
      previous?.action.time,
      previous?.action.getClip().duration,
      variation.animationPhase,
    );

    const shouldRestart = shouldRestartAuthoredAgentAction({
      animation: resolvedAnimation,
      muzzleFlash,
      previousActionMatches: previous?.action === activeAction,
      previousAnimationMatches: previous?.animation === resolvedAnimation,
      previousMuzzleFlash: previous?.muzzleFlash ?? false,
      scheduled: activeAction.isScheduled(),
    });

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
        activeAction.time = transitionPhase * activeClip.duration;
      }
      activeAction.play();

      if (previous && previous.action !== activeAction) {
        if (previous.action.getMixer() === activeAction.getMixer()) {
          activeAction.crossFadeFrom(previous.action, crossFadeSeconds, false);
        } else {
          previous.action.fadeOut(crossFadeSeconds);
          activeAction.fadeIn(crossFadeSeconds);
        }
      } else {
        activeAction.fadeIn(crossFadeSeconds);
      }
    }

    activeActionRef.current = {
      action: activeAction,
      animation: resolvedAnimation,
      muzzleFlash,
    };
  }, [
    activeClip,
    clonedScene,
    mixer,
    muzzleFlash,
    resolvedAnimation,
    timeScale,
    variation.animationPhase,
  ]);
  const equipmentAnchor = aiming ? attachmentNodes.wrist : attachmentNodes.hips;
  const equipment =
    role !== "civilian" && equipmentAnchor
      ? createPortal(
          <Signal9Equipment
            mode={aiming ? "hand" : "holster"}
            muzzleFlash={muzzleFlash || resolvedAnimation === "fire"}
            quality={quality}
          />,
          equipmentAnchor,
        )
      : null;

  return (
    <>
      <group {...groupProps}>
        <group ref={directionRootRef}>
          <group
            position={[0, MODEL_FOOT_LIFT * variation.scale, 0]}
            ref={bodyRootRef}
            scale={variation.scale}
          >
            <primitive dispose={null} object={clonedScene} />
          </group>
        </group>
      </group>
      {equipment}
    </>
  );
}
