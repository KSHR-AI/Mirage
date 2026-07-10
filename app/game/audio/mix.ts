import type { AfterlightLocationKey } from "../content/types";
import type { Vec3 } from "../core/contracts";

export type AudioTravelMode = "foot" | "vehicle";
export type AfterlightAudioWeather = "clear" | "drizzle" | "fog" | "wind";

export interface AfterlightSpatialSource {
  readonly id: string;
  readonly position: Vec3;
  readonly intensity?: number;
}

export interface SpatialAudioMix {
  readonly distance: number;
  readonly gain: number;
  readonly pan: number;
}

export interface AfterlightAudioState {
  readonly mode: AudioTravelMode;
  readonly grounded: boolean;
  readonly speedKph: number;
  readonly engineLoad: number;
  readonly wantedLevel: 0 | 1 | 2 | 3;
  readonly health: number;
  readonly paused: boolean;
  readonly blackout: boolean;
  readonly missionIntensity: number;
  readonly district: AfterlightLocationKey;
  readonly weather: AfterlightAudioWeather;
  readonly listenerPosition: Vec3;
  readonly listenerYaw: number;
  readonly police: readonly AfterlightSpatialSource[];
}

export interface AfterlightAudioMix {
  readonly engineLowFrequency: number;
  readonly engineLowGain: number;
  readonly engineMidFrequency: number;
  readonly engineMidGain: number;
  readonly engineHighFrequency: number;
  readonly engineHighGain: number;
  readonly districtNoiseFrequency: number;
  readonly districtNoiseQ: number;
  readonly districtNoiseGain: number;
  readonly districtToneFrequency: number;
  readonly districtToneGain: number;
  readonly weatherNoiseFrequency: number;
  readonly weatherNoiseQ: number;
  readonly weatherNoiseGain: number;
  readonly pursuitFrequency: number;
  readonly pursuitGain: number;
  readonly heartbeatFrequency: number;
  readonly heartbeatGain: number;
  readonly blackoutFrequency: number;
  readonly blackoutGain: number;
  readonly police: readonly SpatialAudioMix[];
  readonly estimatedActiveVoices: number;
}

export const MAX_ACTIVE_AUDIO_VOICES = 16;
export const MAX_CUE_AUDIO_VOICES = 4;
export const MAX_POLICE_AUDIO_SOURCES = 3;

interface DistrictProfile {
  readonly noiseFrequency: number;
  readonly noiseGain: number;
  readonly noiseQ: number;
  readonly toneFrequency: number;
  readonly toneGain: number;
}

interface WeatherProfile {
  readonly noiseFrequency: number;
  readonly noiseGain: number;
  readonly noiseQ: number;
}

const DISTRICT_PROFILES: Record<AfterlightLocationKey, DistrictProfile> = {
  soma: {
    noiseFrequency: 340,
    noiseGain: 0.02,
    noiseQ: 0.42,
    toneFrequency: 96,
    toneGain: 0.004,
  },
  "north-beach": {
    noiseFrequency: 300,
    noiseGain: 0.017,
    noiseQ: 0.36,
    toneFrequency: 132,
    toneGain: 0.003,
  },
  "financial-district": {
    noiseFrequency: 410,
    noiseGain: 0.022,
    noiseQ: 0.54,
    toneFrequency: 144,
    toneGain: 0.005,
  },
  "potrero-grid": {
    noiseFrequency: 260,
    noiseGain: 0.018,
    noiseQ: 0.33,
    toneFrequency: 84,
    toneGain: 0.0035,
  },
  "golden-gate": {
    noiseFrequency: 230,
    noiseGain: 0.013,
    noiseQ: 0.28,
    toneFrequency: 76,
    toneGain: 0.0028,
  },
  "marin-safehouse": {
    noiseFrequency: 180,
    noiseGain: 0.01,
    noiseQ: 0.24,
    toneFrequency: 68,
    toneGain: 0.0018,
  },
};

const WEATHER_PROFILES: Record<AfterlightAudioWeather, WeatherProfile> = {
  clear: { noiseFrequency: 520, noiseGain: 0.003, noiseQ: 0.16 },
  drizzle: { noiseFrequency: 980, noiseGain: 0.012, noiseQ: 0.62 },
  fog: { noiseFrequency: 640, noiseGain: 0.009, noiseQ: 0.34 },
  wind: { noiseFrequency: 1180, noiseGain: 0.02, noiseQ: 0.48 },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function resolveAfterlightWeather(
  district: AfterlightLocationKey,
): AfterlightAudioWeather {
  switch (district) {
    case "golden-gate":
      return "wind";
    case "potrero-grid":
      return "drizzle";
    case "marin-safehouse":
      return "clear";
    default:
      return "fog";
  }
}

export function computeSpatialAudioMix(
  listenerPosition: Vec3,
  listenerYaw: number,
  sourcePosition: Vec3,
  intensity = 1,
  maxDistance = 92,
): SpatialAudioMix {
  const dx = sourcePosition[0] - listenerPosition[0];
  const dz = sourcePosition[2] - listenerPosition[2];
  const distance = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz) - listenerYaw;
  const wrappedAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
  const distanceScale = 1 - clamp(distance / maxDistance, 0, 1);
  const gain =
    Math.pow(distanceScale, 1.6) *
    clamp(Number.isFinite(intensity) ? intensity : 1, 0, 1.35);

  return {
    distance,
    gain,
    pan: Math.sin(wrappedAngle) * clamp(0.25 + distanceScale * 0.75, 0.25, 1),
  };
}

export function normalizeAudioState(
  state: AfterlightAudioState,
): AfterlightAudioState {
  return {
    ...state,
    grounded: Boolean(state.grounded),
    speedKph: clamp(
      Number.isFinite(state.speedKph) ? state.speedKph : 0,
      0,
      240,
    ),
    engineLoad: clamp(
      Number.isFinite(state.engineLoad) ? state.engineLoad : 0,
      0,
      1,
    ),
    health: clamp(Number.isFinite(state.health) ? state.health : 100, 0, 100),
    missionIntensity: clamp(
      Number.isFinite(state.missionIntensity) ? state.missionIntensity : 0,
      0,
      1,
    ),
    listenerYaw: Number.isFinite(state.listenerYaw) ? state.listenerYaw : 0,
    police: state.police.slice(0, MAX_POLICE_AUDIO_SOURCES).map((source) => ({
      ...source,
      intensity: clamp(
        Number.isFinite(source.intensity ?? Number.NaN)
          ? (source.intensity ?? 1)
          : 1,
        0,
        1.35,
      ),
    })),
  };
}

export function computeAfterlightAudioMix(
  rawState: AfterlightAudioState,
): AfterlightAudioMix {
  const state = normalizeAudioState(rawState);
  const speed = state.speedKph / 240;
  const load = clamp(
    state.engineLoad * 0.7 + speed * 0.3 + state.missionIntensity * 0.15,
    0,
    1,
  );
  const wanted = state.wantedLevel / 3;
  const lowHealth = clamp((38 - state.health) / 38, 0, 1);
  const pauseScale = state.paused ? 0.16 : 1;
  const driving = state.mode === "vehicle" ? 1 : 0;
  const district = DISTRICT_PROFILES[state.district];
  const weather = WEATHER_PROFILES[state.weather];
  const police = state.police.map((source) => {
    const spatial = computeSpatialAudioMix(
      state.listenerPosition,
      state.listenerYaw,
      source.position,
      source.intensity,
    );
    return {
      ...spatial,
      gain: spatial.gain * (0.3 + wanted * 0.7) * pauseScale,
    };
  });

  const pursuitGain =
    (state.missionIntensity * 0.03 + wanted * 0.04) * pauseScale;
  const heartbeatGain = lowHealth * 0.055 * pauseScale;
  const blackoutGain = (state.blackout ? 0.04 : 0) * pauseScale;
  const estimatedActiveVoices = Math.min(
    MAX_ACTIVE_AUDIO_VOICES,
    6 +
      (pursuitGain > 0.001 ? 1 : 0) +
      (heartbeatGain > 0.001 ? 1 : 0) +
      (blackoutGain > 0.001 ? 1 : 0) +
      police.filter((voice) => voice.gain > 0.001).length +
      MAX_CUE_AUDIO_VOICES,
  );

  return {
    engineLowFrequency: 28 + Math.pow(speed, 0.85) * 58 + load * 16,
    engineLowGain:
      driving * pauseScale * (0.012 + speed * 0.034) * (0.65 + load * 0.35),
    engineMidFrequency: 62 + Math.pow(speed, 0.92) * 116 + load * 24,
    engineMidGain:
      driving *
      pauseScale *
      (0.004 + speed * speed * 0.022) *
      (0.48 + load * 0.52),
    engineHighFrequency: 158 + Math.pow(speed, 1.2) * 328 + load * 48,
    engineHighGain:
      driving *
      pauseScale *
      (0.0015 + Math.pow(speed, 1.6) * 0.0105) *
      (0.3 + load * 0.7),
    districtNoiseFrequency: district.noiseFrequency,
    districtNoiseQ: district.noiseQ,
    districtNoiseGain:
      district.noiseGain * (state.blackout ? 0.42 : 1) * pauseScale,
    districtToneFrequency: district.toneFrequency + state.missionIntensity * 12,
    districtToneGain:
      district.toneGain * (state.blackout ? 0.3 : 1) * pauseScale,
    weatherNoiseFrequency: weather.noiseFrequency + speed * 160,
    weatherNoiseQ: weather.noiseQ,
    weatherNoiseGain:
      (weather.noiseGain + Math.pow(speed, 1.4) * 0.01 * driving) * pauseScale,
    pursuitFrequency: 52 + wanted * 26 + state.missionIntensity * 14,
    pursuitGain,
    heartbeatFrequency: 46 + lowHealth * 18,
    heartbeatGain,
    blackoutFrequency: 28 + state.missionIntensity * 6,
    blackoutGain,
    police,
    estimatedActiveVoices,
  };
}

export const DEFAULT_AFTERLIGHT_AUDIO_STATE: AfterlightAudioState = {
  mode: "foot",
  grounded: true,
  speedKph: 0,
  engineLoad: 0,
  wantedLevel: 0,
  health: 100,
  paused: true,
  blackout: false,
  missionIntensity: 0,
  district: "soma",
  weather: "fog",
  listenerPosition: [0, 0, 0],
  listenerYaw: 0,
  police: [],
};
