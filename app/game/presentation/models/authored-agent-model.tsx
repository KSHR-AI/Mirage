"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Mesh,
  type AnimationAction,
  type AnimationClip,
} from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  getAgentAppearance,
  hashVisualId,
  type AgentVisualRole,
} from "./appearance";
import type { AgentAnimationState, AgentModelProps, VisualId } from "./types";

export interface AuthoredAgentModelProps extends AgentModelProps {
  readonly role: AgentVisualRole;
}

export interface AuthoredAgentVariation {
  readonly animationPhase: number;
  readonly playbackRate: number;
  readonly scale: number;
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
  jump: Object.freeze(["Roll", "Run"]),
  aim: Object.freeze(["Idle_Gun_Pointing"]),
  fire: Object.freeze(["Idle_Gun_Shoot", "Gun_Shoot"]),
  cower: Object.freeze(["Idle"]),
  down: Object.freeze(["Death"]),
});

const CROSS_FADE_SECONDS = 0.18;
const MODEL_CENTER_HEIGHT = 1;
const WALK_SPEED = 5;
const RUN_SPEED = 8.5;
const RUN_THRESHOLD = WALK_SPEED * 1.15;
const MAX_AIM_YAW = 0.78;
const MAX_AIM_PITCH = 0.55;
const ONE_SHOT_STATES: ReadonlySet<AgentAnimationState> = new Set([
  "jump",
  "fire",
  "down",
]);

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
    animationPhase: appearance.phase / (Math.PI * 2),
    playbackRate: 0.96 + ((hash >>> 24) % 9) / 100,
    scale: appearance.heightScale,
  });
}

export function getAuthoredAgentTimeScale(
  animation: AgentAnimationState,
  speed: number | undefined,
  playbackRate = 1,
): number {
  const resolvedSpeed = Math.max(0, finiteOr(speed, 0));
  const resolvedPlaybackRate = MathUtils.clamp(
    finiteOr(playbackRate, 1),
    0.9,
    1.1,
  );
  let locomotionRate = 1;

  if (animation === "walk") {
    locomotionRate = MathUtils.clamp(resolvedSpeed / WALK_SPEED, 0.55, 1.8);
  } else if (animation === "run" || animation === "jump") {
    locomotionRate = MathUtils.clamp(resolvedSpeed / RUN_SPEED, 0.65, 1.8);
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
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
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
  const timeScale = getAuthoredAgentTimeScale(
    resolvedAnimation,
    speed,
    variation.playbackRate,
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
  const activeAction = activeClipName ? actions[activeClipName] : null;
  const activeActionRef = useRef<ActiveActionState | null>(null);

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
          position={[0, MODEL_CENTER_HEIGHT * variation.scale, 0]}
          rotation={[-resolvedAimPitch * 0.16, resolvedAimYaw, 0]}
          scale={variation.scale}
        >
          <primitive dispose={null} object={clonedScene} />
        </group>
      </group>
    </group>
  );
}
