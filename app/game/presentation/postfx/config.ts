import type { GameQualityTier } from "../../performance";

export interface AfterlightPostFxConfig {
  readonly enabled: boolean;
  readonly bloom: {
    readonly intensity: number;
    readonly threshold: number;
    readonly smoothing: number;
  };
  readonly vignette: {
    readonly offset: number;
    readonly darkness: number;
  };
}

const DISABLED_POST_FX: AfterlightPostFxConfig = Object.freeze({
  enabled: false,
  bloom: Object.freeze({
    intensity: 0,
    threshold: 1,
    smoothing: 0,
  }),
  vignette: Object.freeze({
    offset: 0,
    darkness: 0,
  }),
});

const HIGH_POST_FX: AfterlightPostFxConfig = Object.freeze({
  enabled: true,
  bloom: Object.freeze({
    intensity: 0.18,
    threshold: 1.28,
    smoothing: 0.18,
  }),
  vignette: Object.freeze({
    offset: 0.34,
    darkness: 0.12,
  }),
});

export function resolveAfterlightPostFxConfig(
  quality: GameQualityTier,
  reducedMotion: boolean,
): AfterlightPostFxConfig {
  return quality === "high" && !reducedMotion ? HIGH_POST_FX : DISABLED_POST_FX;
}
