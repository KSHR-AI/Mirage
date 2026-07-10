"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Group, MathUtils } from "three";

import {
  clampPresentationSignal,
  getAgentAppearance,
  getModelGeometryDetail,
  type AgentAppearance,
  type AgentVisualRole,
} from "./appearance";
import { MuzzleFlash } from "./effects";
import type {
  AgentAnimationState,
  AgentModelProps,
  ModelQuality,
} from "./types";

export interface GenericAgentModelProps extends AgentModelProps {
  readonly role: AgentVisualRole;
}

interface AgentRigProps extends GenericAgentModelProps {
  readonly armed: boolean;
}

const WALK_SPEED = 5;
const RUN_SPEED = 8.5;
const MAX_AIM_YAW = 0.78;
const MAX_AIM_PITCH = 0.55;

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function resolveAnimation(
  animation: AgentAnimationState | undefined,
  speed: number,
  aim: boolean,
): AgentAnimationState {
  if (animation) return animation;
  if (aim) return "aim";
  if (speed > WALK_SPEED * 1.15) return "run";
  if (speed > 0.12) return "walk";
  return "idle";
}

function Hair({
  appearance,
  quality,
}: {
  appearance: AgentAppearance;
  quality: ModelQuality;
}) {
  const detail = getModelGeometryDetail(quality);
  if (appearance.hairStyle === "cap") {
    return (
      <>
        <mesh castShadow position={[0, 0.1, 0]}>
          <sphereGeometry
            args={[
              0.195,
              detail.sphereWidthSegments,
              detail.sphereHeightSegments,
              0,
              Math.PI * 2,
              0,
              Math.PI * 0.48,
            ]}
          />
          <meshStandardMaterial color={appearance.jacket} roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0, 0.105, 0.18]}>
          <boxGeometry args={[0.28, 0.035, 0.16]} />
          <meshStandardMaterial color={appearance.jacket} roughness={0.76} />
        </mesh>
      </>
    );
  }
  if (appearance.hairStyle === "bun") {
    return (
      <>
        <mesh castShadow position={[0, 0.11, -0.015]}>
          <sphereGeometry
            args={[
              0.19,
              detail.sphereWidthSegments,
              detail.sphereHeightSegments,
              0,
              Math.PI * 2,
              0,
              Math.PI * 0.54,
            ]}
          />
          <meshStandardMaterial color={appearance.hair} roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 0.13, -0.18]}>
          <sphereGeometry
            args={[0.1, detail.radialSegments, detail.radialSegments]}
          />
          <meshStandardMaterial color={appearance.hair} roughness={0.9} />
        </mesh>
      </>
    );
  }
  if (appearance.hairStyle === "swept") {
    return (
      <mesh
        castShadow
        position={[-0.025, 0.12, -0.015]}
        rotation={[0.12, 0, -0.1]}
      >
        <sphereGeometry
          args={[
            0.2,
            detail.sphereWidthSegments,
            detail.sphereHeightSegments,
            0,
            Math.PI * 2,
            0,
            Math.PI * 0.52,
          ]}
        />
        <meshStandardMaterial color={appearance.hair} roughness={0.86} />
      </mesh>
    );
  }
  return (
    <mesh castShadow position={[0, 0.12, -0.02]} scale={[1, 0.72, 1]}>
      <sphereGeometry
        args={[0.195, detail.radialSegments, detail.radialSegments]}
      />
      <meshStandardMaterial color={appearance.hair} roughness={0.92} />
    </mesh>
  );
}

function Face({
  appearance,
  quality,
}: {
  appearance: AgentAppearance;
  quality: ModelQuality;
}) {
  const detail = getModelGeometryDetail(quality);
  return (
    <>
      <mesh castShadow scale={[0.88, 1.08, 0.9]}>
        <sphereGeometry
          args={[
            0.205,
            detail.sphereWidthSegments,
            detail.sphereHeightSegments,
          ]}
        />
        <meshStandardMaterial color={appearance.skin} roughness={0.84} />
      </mesh>
      <mesh position={[-0.068, 0.025, 0.177]}>
        <sphereGeometry args={[0.018, 6, 4]} />
        <meshStandardMaterial color="#15191c" roughness={0.42} />
      </mesh>
      <mesh position={[0.068, 0.025, 0.177]}>
        <sphereGeometry args={[0.018, 6, 4]} />
        <meshStandardMaterial color="#15191c" roughness={0.42} />
      </mesh>
      <Hair appearance={appearance} quality={quality} />
    </>
  );
}

function Leg({
  appearance,
  side,
  quality,
}: {
  appearance: AgentAppearance;
  side: -1 | 1;
  quality: ModelQuality;
}) {
  const detail = getModelGeometryDetail(quality);
  return (
    <>
      <mesh castShadow position={[0, -0.29, 0]}>
        <capsuleGeometry args={[0.105, 0.42, 4, detail.radialSegments]} />
        <meshStandardMaterial color={appearance.trousers} roughness={0.82} />
      </mesh>
      <mesh castShadow position={[0, -0.62, 0.055]}>
        <capsuleGeometry args={[0.09, 0.32, 4, detail.radialSegments]} />
        <meshStandardMaterial color={appearance.trousers} roughness={0.84} />
      </mesh>
      <mesh castShadow position={[0, -0.83, 0.095]}>
        <boxGeometry args={[0.19, 0.12, 0.34]} />
        <meshStandardMaterial color={appearance.shoes} roughness={0.73} />
      </mesh>
      {side === 1 ? (
        <mesh position={[0.1, -0.12, 0]}>
          <boxGeometry args={[0.035, 0.18, 0.12]} />
          <meshStandardMaterial color={appearance.accent} roughness={0.72} />
        </mesh>
      ) : null}
    </>
  );
}

function Arm({
  appearance,
  quality,
  armored,
}: {
  appearance: AgentAppearance;
  quality: ModelQuality;
  armored: boolean;
}) {
  const detail = getModelGeometryDetail(quality);
  return (
    <>
      {armored ? (
        <mesh castShadow position={[0, -0.08, 0]}>
          <sphereGeometry args={[0.16, detail.radialSegments, 6]} />
          <meshStandardMaterial
            color={appearance.jacket}
            metalness={0.12}
            roughness={0.62}
          />
        </mesh>
      ) : null}
      <mesh castShadow position={[0, -0.27, 0]}>
        <capsuleGeometry args={[0.085, 0.38, 4, detail.radialSegments]} />
        <meshStandardMaterial color={appearance.jacket} roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, -0.56, 0]}>
        <capsuleGeometry args={[0.068, 0.24, 4, detail.radialSegments]} />
        <meshStandardMaterial color={appearance.skin} roughness={0.84} />
      </mesh>
      <mesh castShadow position={[0, -0.73, 0]}>
        <sphereGeometry args={[0.09, detail.radialSegments, 6]} />
        <meshStandardMaterial color={appearance.skin} roughness={0.85} />
      </mesh>
    </>
  );
}

function Torso({
  appearance,
  quality,
  role,
}: {
  appearance: AgentAppearance;
  quality: ModelQuality;
  role: AgentVisualRole;
}) {
  const detail = getModelGeometryDetail(quality);
  const tactical = role === "guard" || role === "police";
  return (
    <>
      <mesh castShadow scale={[appearance.shoulderScale, 1, 1]}>
        <capsuleGeometry args={[0.245, 0.43, 5, detail.radialSegments]} />
        <meshStandardMaterial
          color={appearance.jacket}
          roughness={0.69}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, 0.035, 0.233]} scale={[0.86, 0.72, 0.22]}>
        <boxGeometry args={[0.43, 0.5, 0.12]} />
        <meshStandardMaterial color={appearance.shirt} roughness={0.76} />
      </mesh>
      <mesh position={[0, -0.16, 0.265]}>
        <boxGeometry args={[0.26, 0.055, 0.04]} />
        <meshStandardMaterial
          color={appearance.accent}
          emissive={role === "player" ? appearance.accent : "#000000"}
          emissiveIntensity={role === "player" ? 0.18 : 0}
          roughness={0.62}
        />
      </mesh>
      {tactical ? (
        <>
          <mesh castShadow position={[-0.19, 0.09, 0.23]}>
            <boxGeometry args={[0.12, 0.28, 0.09]} />
            <meshStandardMaterial color="#141b20" roughness={0.67} />
          </mesh>
          <mesh castShadow position={[0.19, 0.09, 0.23]}>
            <boxGeometry args={[0.12, 0.28, 0.09]} />
            <meshStandardMaterial color="#141b20" roughness={0.67} />
          </mesh>
        </>
      ) : null}
    </>
  );
}

function RoleDetails({
  appearance,
  role,
}: {
  appearance: AgentAppearance;
  role: AgentVisualRole;
}) {
  if (role === "civilian") {
    return appearance.phase > Math.PI ? (
      <group position={[-0.32, 1.16, -0.06]} rotation={[0, 0, 0.13]}>
        <mesh castShadow>
          <boxGeometry args={[0.16, 0.5, 0.38]} />
          <meshStandardMaterial color={appearance.accent} roughness={0.88} />
        </mesh>
        <mesh position={[0.02, 0.36, 0]}>
          <torusGeometry args={[0.14, 0.025, 6, 12, Math.PI]} />
          <meshStandardMaterial color="#282b2d" roughness={0.8} />
        </mesh>
      </group>
    ) : null;
  }
  if (role === "player") {
    return (
      <>
        <mesh castShadow position={[0, 1.25, -0.25]}>
          <boxGeometry args={[0.43, 0.5, 0.15]} />
          <meshStandardMaterial color="#182e34" roughness={0.7} />
        </mesh>
        <mesh position={[-0.28, 1.1, 0.02]} rotation={[0, 0, 0.18]}>
          <boxGeometry args={[0.045, 0.72, 0.045]} />
          <meshStandardMaterial color={appearance.accent} roughness={0.62} />
        </mesh>
      </>
    );
  }
  return (
    <>
      <mesh position={[0, 0.94, 0.04]}>
        <cylinderGeometry args={[0.3, 0.3, 0.1, 12]} />
        <meshStandardMaterial color="#11171b" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.31, 0.9, 0]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.13, 0.34, 0.12]} />
        <meshStandardMaterial color="#12181b" roughness={0.62} />
      </mesh>
    </>
  );
}

function AgentRig({
  aim = false,
  aimPitch = 0,
  aimYaw = 0,
  animation,
  armed,
  direction = 0,
  entityId,
  muzzleFlash = false,
  quality = "desktop",
  role,
  speed = 0,
  ...groupProps
}: AgentRigProps) {
  const appearance = useMemo(
    () => getAgentAppearance(entityId, role),
    [entityId, role],
  );
  const facingRef = useRef<Group>(null);
  const rigRef = useRef<Group>(null);
  const torsoRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const leftLegRef = useRef<Group>(null);
  const rightLegRef = useRef<Group>(null);
  const weaponRef = useRef<Group>(null);
  const resolvedSpeed = Math.max(0, finiteOr(speed, 0));
  const state = resolveAnimation(animation, resolvedSpeed, aim);
  const tactical = role === "guard" || role === "police";
  const isAiming = aim || state === "aim" || state === "fire";

  useFrame(({ clock }, delta) => {
    const facing = facingRef.current;
    const rig = rigRef.current;
    const torso = torsoRef.current;
    const head = headRef.current;
    const leftArm = leftArmRef.current;
    const rightArm = rightArmRef.current;
    const leftLeg = leftLegRef.current;
    const rightLeg = rightLegRef.current;
    const weapon = weaponRef.current;
    if (
      !facing ||
      !rig ||
      !torso ||
      !head ||
      !leftArm ||
      !rightArm ||
      !leftLeg ||
      !rightLeg
    ) {
      return;
    }

    const dt = Math.min(delta, 0.05);
    const time = clock.elapsedTime + appearance.phase;
    const down = state === "down";
    const cower = state === "cower";
    const locomoting = state === "walk" || state === "run";
    const run = state === "run";
    const speedRatio = clampPresentationSignal(
      resolvedSpeed / (run ? RUN_SPEED : WALK_SPEED),
    );
    const cadence = run ? 11 : 7.2;
    const stride = locomoting
      ? Math.sin(time * cadence) * (run ? 0.86 : 0.58) * speedRatio
      : 0;
    const bounce = locomoting
      ? Math.abs(Math.sin(time * cadence)) * (run ? 0.055 : 0.027)
      : Math.sin(time * 1.8) * 0.007;
    const fireKick =
      state === "fire" ? Math.max(0, Math.sin(time * 42)) * 0.2 : 0;
    const targetAimYaw = MathUtils.clamp(
      finiteOr(aimYaw, 0),
      -MAX_AIM_YAW,
      MAX_AIM_YAW,
    );
    const targetAimPitch = MathUtils.clamp(
      finiteOr(aimPitch, 0),
      -MAX_AIM_PITCH,
      MAX_AIM_PITCH,
    );

    facing.rotation.y = finiteOr(direction, 0);
    rig.rotation.z = MathUtils.damp(
      rig.rotation.z,
      down ? -Math.PI * 0.48 : 0,
      12,
      dt,
    );
    rig.rotation.x = MathUtils.damp(
      rig.rotation.x,
      cower ? -0.65 : run ? -0.09 : 0,
      11,
      dt,
    );
    rig.position.y = MathUtils.damp(
      rig.position.y,
      down ? 0.34 : bounce,
      13,
      dt,
    );
    torso.rotation.x = MathUtils.damp(
      torso.rotation.x,
      cower ? -0.32 : run ? -0.12 : 0,
      12,
      dt,
    );
    torso.rotation.z = MathUtils.damp(
      torso.rotation.z,
      locomoting ? -stride * 0.035 : 0,
      10,
      dt,
    );
    head.rotation.y = MathUtils.damp(
      head.rotation.y,
      isAiming ? targetAimYaw : Math.sin(time * 0.62) * 0.035,
      15,
      dt,
    );
    head.rotation.x = MathUtils.damp(
      head.rotation.x,
      cower ? -0.38 : isAiming ? -targetAimPitch * 0.45 : 0,
      15,
      dt,
    );

    const aimArmPitch = -Math.PI * 0.47 - targetAimPitch;
    leftArm.rotation.x = MathUtils.damp(
      leftArm.rotation.x,
      cower ? -1.75 : isAiming ? aimArmPitch + 0.08 : stride,
      17,
      dt,
    );
    rightArm.rotation.x = MathUtils.damp(
      rightArm.rotation.x,
      cower ? -1.55 : isAiming ? aimArmPitch + fireKick : -stride,
      17,
      dt,
    );
    leftArm.rotation.z = MathUtils.damp(
      leftArm.rotation.z,
      isAiming ? -0.28 : cower ? -0.48 : 0.045,
      14,
      dt,
    );
    rightArm.rotation.z = MathUtils.damp(
      rightArm.rotation.z,
      isAiming ? 0.22 : cower ? 0.48 : -0.045,
      14,
      dt,
    );
    leftLeg.rotation.x = MathUtils.damp(
      leftLeg.rotation.x,
      cower ? 0.72 : down ? -0.34 : -stride,
      16,
      dt,
    );
    rightLeg.rotation.x = MathUtils.damp(
      rightLeg.rotation.x,
      cower ? 0.98 : down ? 0.48 : stride,
      16,
      dt,
    );
    if (weapon) {
      weapon.visible = armed && isAiming && !down;
      weapon.rotation.x = -targetAimPitch + fireKick * 0.45;
      weapon.rotation.y = targetAimYaw * 0.3;
    }
  });

  return (
    <group {...groupProps}>
      <group ref={facingRef} scale={appearance.heightScale}>
        <group ref={rigRef}>
          <group ref={leftLegRef} position={[-0.14, 0.83, 0]}>
            <Leg appearance={appearance} quality={quality} side={-1} />
          </group>
          <group ref={rightLegRef} position={[0.14, 0.83, 0]}>
            <Leg appearance={appearance} quality={quality} side={1} />
          </group>
          <group ref={torsoRef} position={[0, 1.28, 0]}>
            <Torso appearance={appearance} quality={quality} role={role} />
          </group>
          <group ref={leftArmRef} position={[-0.34, 1.48, 0]}>
            <Arm appearance={appearance} armored={tactical} quality={quality} />
          </group>
          <group ref={rightArmRef} position={[0.34, 1.48, 0]}>
            <Arm appearance={appearance} armored={tactical} quality={quality} />
          </group>
          <group ref={headRef} position={[0, 1.82, 0.015]}>
            <Face appearance={appearance} quality={quality} />
          </group>
          <RoleDetails appearance={appearance} role={role} />
          {armed ? (
            <>
              <group
                ref={weaponRef}
                position={[0.18, 1.34, 0.56]}
                visible={isAiming && state !== "down"}
              >
                <mesh castShadow position={[0, 0, 0.07]}>
                  <boxGeometry args={[0.11, 0.13, 0.45]} />
                  <meshStandardMaterial
                    color="#141a1c"
                    metalness={0.62}
                    roughness={0.3}
                  />
                </mesh>
                <mesh
                  castShadow
                  position={[0, -0.13, -0.04]}
                  rotation={[0.25, 0, 0]}
                >
                  <boxGeometry args={[0.1, 0.27, 0.13]} />
                  <meshStandardMaterial
                    color="#253036"
                    metalness={0.28}
                    roughness={0.57}
                  />
                </mesh>
                <mesh
                  position={[0, 0.012, 0.31]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.025, 0.025, 0.18, 8]} />
                  <meshStandardMaterial
                    color="#0c1113"
                    metalness={0.72}
                    roughness={0.22}
                  />
                </mesh>
                <MuzzleFlash
                  active={muzzleFlash || state === "fire"}
                  position={[0, 0.012, 0.43]}
                  quality={quality}
                />
              </group>
              <group position={[0.35, 0.91, 0.03]} rotation={[0, 0, -0.08]}>
                <mesh castShadow>
                  <boxGeometry args={[0.14, 0.35, 0.12]} />
                  <meshStandardMaterial color="#14191b" roughness={0.66} />
                </mesh>
              </group>
            </>
          ) : null}
        </group>
      </group>
    </group>
  );
}

export function AgentModel(props: GenericAgentModelProps) {
  return <AgentRig {...props} armed={props.role !== "civilian"} />;
}

export function PlayerAgentModel(props: AgentModelProps) {
  return <AgentRig {...props} armed role="player" />;
}

export function CivilianModel(props: AgentModelProps) {
  return <AgentRig {...props} armed={false} role="civilian" />;
}

export function GuardModel(props: AgentModelProps) {
  return <AgentRig {...props} armed role="guard" />;
}

export function PoliceOfficerModel(props: AgentModelProps) {
  return <AgentRig {...props} armed role="police" />;
}
