"use client";

import {
  Bloom,
  EffectComposer,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { GameQualityTier } from "../../performance";
import { resolveAfterlightPostFxConfig } from "./config";

export interface AfterlightPostEffectsProps {
  readonly quality: GameQualityTier;
  readonly reducedMotion: boolean;
}

export function AfterlightPostEffects({
  quality,
  reducedMotion,
}: AfterlightPostEffectsProps) {
  const config = resolveAfterlightPostFxConfig(quality, reducedMotion);
  if (!config.enabled) return null;

  return (
    <EffectComposer
      depthBuffer
      enableNormalPass={false}
      multisampling={0}
      stencilBuffer={false}
    >
      <Bloom
        intensity={config.bloom.intensity}
        luminanceSmoothing={config.bloom.smoothing}
        luminanceThreshold={config.bloom.threshold}
        mipmapBlur
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette
        darkness={config.vignette.darkness}
        offset={config.vignette.offset}
      />
    </EffectComposer>
  );
}
