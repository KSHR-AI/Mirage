"use client";

import { memo } from "react";
import type { InteractionCuePlan } from "./types";
import { INTERACTION_COLORS } from "./plan";

export interface MissionInteractionCuesProps {
  readonly cues: readonly InteractionCuePlan[];
  readonly reducedMotion: boolean;
}

function CueMaterial({
  color,
  opacity = 0.88,
}: {
  readonly color: string;
  readonly opacity?: number;
}) {
  return (
    <meshBasicMaterial
      color={color}
      depthWrite={false}
      opacity={opacity}
      toneMapped={false}
      transparent
    />
  );
}

function InteractCue({
  cue,
  color,
  reducedMotion,
}: {
  readonly cue: InteractionCuePlan;
  readonly color: string;
  readonly reducedMotion: boolean;
}) {
  const tickOffset = cue.radius * 0.82;
  return (
    <group name={`mission-cue-${cue.id}`} position={cue.position}>
      <mesh renderOrder={8} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[cue.radius, 0.055, 6, 28]} />
        <CueMaterial color={color} />
      </mesh>
      {!reducedMotion ? (
        <mesh
          position={[0, 0.025, 0]}
          renderOrder={8}
          rotation={[Math.PI / 2, 0, Math.PI / 4]}
        >
          <torusGeometry args={[cue.radius * 0.67, 0.022, 5, 20]} />
          <CueMaterial color={color} opacity={0.48} />
        </mesh>
      ) : null}
      {[
        [tickOffset, 0, 0],
        [-tickOffset, 0, 0],
        [0, 0, tickOffset],
        [0, 0, -tickOffset],
      ].map(([x, y, z], index) => (
        <mesh
          key={index}
          position={[x, y + 0.06, z]}
          renderOrder={8}
          rotation={[0, (Math.PI / 2) * index, 0]}
        >
          <boxGeometry args={[0.08, 0.12, cue.radius * 0.34]} />
          <CueMaterial color={color} />
        </mesh>
      ))}
      <mesh
        position={[0, 1.05, 0]}
        renderOrder={8}
        rotation={[0, Math.PI / 4, 0]}
      >
        <octahedronGeometry args={[0.2, 0]} />
        <CueMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.54, 0]} renderOrder={8}>
        <boxGeometry args={[0.035, 0.78, 0.035]} />
        <CueMaterial color={color} opacity={0.62} />
      </mesh>
    </group>
  );
}

function TargetCue({
  cue,
  color,
  reducedMotion,
}: {
  readonly cue: InteractionCuePlan;
  readonly color: string;
  readonly reducedMotion: boolean;
}) {
  const corner = cue.radius * 0.72;
  const bracketLength = Math.max(0.55, cue.radius * 0.34);
  return (
    <group name={`mission-cue-${cue.id}`} position={cue.position}>
      {[
        [corner, corner, 1, 1],
        [-corner, corner, -1, 1],
        [-corner, -corner, -1, -1],
        [corner, -corner, 1, -1],
      ].map(([x, z, xDirection, zDirection], index) => (
        <group key={index} position={[x, 0.1, z]}>
          <mesh
            position={[-xDirection * bracketLength * 0.5, 0, 0]}
            renderOrder={8}
          >
            <boxGeometry args={[bracketLength, 0.09, 0.09]} />
            <CueMaterial color={color} />
          </mesh>
          <mesh
            position={[0, 0, -zDirection * bracketLength * 0.5]}
            renderOrder={8}
          >
            <boxGeometry args={[0.09, 0.09, bracketLength]} />
            <CueMaterial color={color} />
          </mesh>
        </group>
      ))}
      <mesh renderOrder={8} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[
            cue.radius * 0.42,
            cue.radius * (reducedMotion ? 0.46 : 0.49),
            24,
          ]}
        />
        <CueMaterial color={color} opacity={0.72} />
      </mesh>
    </group>
  );
}

function DestinationCue({
  cue,
  color,
  reducedMotion,
}: {
  readonly cue: InteractionCuePlan;
  readonly color: string;
  readonly reducedMotion: boolean;
}) {
  const postOffset = cue.radius * 0.72;
  const postHeight = Math.min(4.2, Math.max(1.7, cue.radius * 0.42));
  return (
    <group name={`mission-cue-${cue.id}`} position={cue.position}>
      <mesh renderOrder={8} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[cue.radius, 0.07, 6, 36]} />
        <CueMaterial color={color} opacity={0.82} />
      </mesh>
      {!reducedMotion ? (
        <mesh
          position={[0, 0.025, 0]}
          renderOrder={8}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[cue.radius * 0.82, 0.025, 5, 30]} />
          <CueMaterial color={color} opacity={0.38} />
        </mesh>
      ) : null}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * postOffset, postHeight / 2, 0]}
          renderOrder={8}
        >
          <boxGeometry args={[0.09, postHeight, 0.09]} />
          <CueMaterial color={color} opacity={0.72} />
        </mesh>
      ))}
      <mesh position={[0, postHeight, 0]} renderOrder={8}>
        <boxGeometry args={[postOffset * 2, 0.09, 0.09]} />
        <CueMaterial color={color} opacity={0.72} />
      </mesh>
    </group>
  );
}

export const MissionInteractionCues = memo(function MissionInteractionCues({
  cues,
  reducedMotion,
}: MissionInteractionCuesProps) {
  return (
    <group name="afterlight-interaction-cues">
      {cues.map((cue) => {
        const color = INTERACTION_COLORS[cue.tone];
        if (cue.kind === "target") {
          return (
            <TargetCue
              color={color}
              cue={cue}
              key={cue.id}
              reducedMotion={reducedMotion}
            />
          );
        }
        if (cue.kind === "destination") {
          return (
            <DestinationCue
              color={color}
              cue={cue}
              key={cue.id}
              reducedMotion={reducedMotion}
            />
          );
        }
        return (
          <InteractCue
            color={color}
            cue={cue}
            key={cue.id}
            reducedMotion={reducedMotion}
          />
        );
      })}
    </group>
  );
});
