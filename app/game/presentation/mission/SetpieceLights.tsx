"use client";

import { memo } from "react";
import type { SetpieceLightPlan } from "./types";

export interface SetpieceLightsProps {
  readonly lights: readonly SetpieceLightPlan[];
}

export const SetpieceLights = memo(function SetpieceLights({
  lights,
}: SetpieceLightsProps) {
  return (
    <group name="afterlight-setpiece-lights">
      {lights.map((light) => (
        <pointLight
          castShadow={false}
          color={light.color}
          decay={2}
          distance={light.distance}
          intensity={light.intensity}
          key={light.id}
          position={light.position}
        />
      ))}
    </group>
  );
});
