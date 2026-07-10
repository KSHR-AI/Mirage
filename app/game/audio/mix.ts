export type AudioTravelMode = "foot" | "vehicle";

export interface AfterlightAudioState {
  readonly mode: AudioTravelMode;
  readonly speedKph: number;
  readonly wantedLevel: 0 | 1 | 2 | 3;
  readonly health: number;
  readonly paused: boolean;
  readonly blackout: boolean;
  readonly missionIntensity: number;
}

export interface AfterlightAudioMix {
  readonly engineFrequency: number;
  readonly engineGain: number;
  readonly engineHarmonicGain: number;
  readonly windGain: number;
  readonly cityGain: number;
  readonly pursuitGain: number;
  readonly sirenGain: number;
  readonly heartbeatGain: number;
  readonly blackoutGain: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeAudioState(
  state: AfterlightAudioState,
): AfterlightAudioState {
  return {
    ...state,
    speedKph: clamp(
      Number.isFinite(state.speedKph) ? state.speedKph : 0,
      0,
      240,
    ),
    health: clamp(Number.isFinite(state.health) ? state.health : 100, 0, 100),
    missionIntensity: clamp(
      Number.isFinite(state.missionIntensity) ? state.missionIntensity : 0,
      0,
      1,
    ),
  };
}

export function computeAfterlightAudioMix(
  rawState: AfterlightAudioState,
): AfterlightAudioMix {
  const state = normalizeAudioState(rawState);
  const speed = state.speedKph / 240;
  const wanted = state.wantedLevel / 3;
  const lowHealth = clamp((38 - state.health) / 38, 0, 1);
  const pauseScale = state.paused ? 0.18 : 1;
  const driving = state.mode === "vehicle" ? 1 : 0;

  return {
    engineFrequency: 38 + Math.pow(speed, 0.72) * 165,
    engineGain: (0.008 + speed * 0.055) * driving * pauseScale,
    engineHarmonicGain: (0.003 + speed * speed * 0.026) * driving * pauseScale,
    windGain: Math.pow(speed, 1.35) * 0.035 * driving * pauseScale,
    cityGain: (state.blackout ? 0.008 : 0.024) * pauseScale,
    pursuitGain: (state.missionIntensity * 0.034 + wanted * 0.045) * pauseScale,
    sirenGain: wanted * 0.04 * pauseScale,
    heartbeatGain: lowHealth * 0.055 * pauseScale,
    blackoutGain: (state.blackout ? 0.04 : 0) * pauseScale,
  };
}

export const DEFAULT_AFTERLIGHT_AUDIO_STATE: AfterlightAudioState = {
  mode: "foot",
  speedKph: 0,
  wantedLevel: 0,
  health: 100,
  paused: true,
  blackout: false,
  missionIntensity: 0,
};
