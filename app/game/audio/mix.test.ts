import { describe, expect, it } from "vitest";
import {
  DEFAULT_AFTERLIGHT_AUDIO_STATE,
  MAX_ACTIVE_AUDIO_VOICES,
  computeSpatialAudioMix,
  computeAfterlightAudioMix,
  normalizeAudioState,
  resolveAfterlightWeather,
} from "./mix";

describe("computeAfterlightAudioMix", () => {
  it("keeps vehicle layers silent while the player is on foot", () => {
    const mix = computeAfterlightAudioMix({
      ...DEFAULT_AFTERLIGHT_AUDIO_STATE,
      paused: false,
      speedKph: 120,
    });

    expect(mix.engineLowGain).toBe(0);
    expect(mix.engineMidGain).toBe(0);
    expect(mix.engineHighGain).toBe(0);
    expect(mix.districtNoiseGain).toBeGreaterThan(0);
  });

  it("raises low, mid, and high engine layers with driving pressure", () => {
    const calm = computeAfterlightAudioMix({
      ...DEFAULT_AFTERLIGHT_AUDIO_STATE,
      mode: "vehicle",
      paused: false,
      speedKph: 20,
      engineLoad: 0.2,
    });
    const chase = computeAfterlightAudioMix({
      ...DEFAULT_AFTERLIGHT_AUDIO_STATE,
      mode: "vehicle",
      paused: false,
      speedKph: 160,
      engineLoad: 0.95,
      wantedLevel: 3,
      missionIntensity: 1,
    });

    expect(chase.engineLowFrequency).toBeGreaterThan(calm.engineLowFrequency);
    expect(chase.engineLowGain).toBeGreaterThan(calm.engineLowGain);
    expect(chase.engineMidGain).toBeGreaterThan(calm.engineMidGain);
    expect(chase.engineHighGain).toBeGreaterThan(calm.engineHighGain);
    expect(chase.weatherNoiseGain).toBeGreaterThan(calm.weatherNoiseGain);
    expect(chase.pursuitGain).toBeGreaterThan(calm.pursuitGain);
    expect(chase.estimatedActiveVoices).toBeLessThanOrEqual(
      MAX_ACTIVE_AUDIO_VOICES,
    );
  });

  it("adds low-health and blackout signatures", () => {
    const mix = computeAfterlightAudioMix({
      ...DEFAULT_AFTERLIGHT_AUDIO_STATE,
      paused: false,
      health: 8,
      blackout: true,
    });

    expect(mix.heartbeatGain).toBeGreaterThan(0);
    expect(mix.blackoutGain).toBeGreaterThan(0);
    expect(mix.districtNoiseGain).toBeLessThan(0.01);
  });

  it("sanitizes non-finite and out-of-range telemetry", () => {
    expect(
      normalizeAudioState({
        ...DEFAULT_AFTERLIGHT_AUDIO_STATE,
        speedKph: Number.NaN,
        engineLoad: 4,
        health: -40,
        listenerYaw: Number.NaN,
        missionIntensity: 5,
      }),
    ).toMatchObject({
      speedKph: 0,
      engineLoad: 1,
      health: 0,
      listenerYaw: 0,
      missionIntensity: 1,
    });
  });

  it("spatializes police sources against the listener", () => {
    const left = computeSpatialAudioMix([0, 0, 0], 0, [-20, 0, 18]);
    const right = computeSpatialAudioMix([0, 0, 0], 0, [20, 0, 18]);
    const far = computeSpatialAudioMix([0, 0, 0], 0, [72, 0, 72]);

    expect(left.pan).toBeLessThan(0);
    expect(right.pan).toBeGreaterThan(0);
    expect(far.gain).toBeLessThan(right.gain);
  });

  it("maps districts to deterministic weather beds", () => {
    expect(resolveAfterlightWeather("golden-gate")).toBe("wind");
    expect(resolveAfterlightWeather("potrero-grid")).toBe("drizzle");
    expect(resolveAfterlightWeather("soma")).toBe("fog");
  });
});
