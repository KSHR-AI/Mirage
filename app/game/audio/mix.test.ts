import { describe, expect, it } from "vitest";
import {
  DEFAULT_AFTERLIGHT_AUDIO_STATE,
  computeAfterlightAudioMix,
  normalizeAudioState,
} from "./mix";

describe("computeAfterlightAudioMix", () => {
  it("keeps vehicle layers silent while the player is on foot", () => {
    const mix = computeAfterlightAudioMix({
      ...DEFAULT_AFTERLIGHT_AUDIO_STATE,
      paused: false,
      speedKph: 120,
    });

    expect(mix.engineGain).toBe(0);
    expect(mix.engineHarmonicGain).toBe(0);
    expect(mix.windGain).toBe(0);
    expect(mix.cityGain).toBeGreaterThan(0);
  });

  it("raises engine, wind, and pursuit layers with driving pressure", () => {
    const calm = computeAfterlightAudioMix({
      ...DEFAULT_AFTERLIGHT_AUDIO_STATE,
      mode: "vehicle",
      paused: false,
      speedKph: 20,
    });
    const chase = computeAfterlightAudioMix({
      ...DEFAULT_AFTERLIGHT_AUDIO_STATE,
      mode: "vehicle",
      paused: false,
      speedKph: 160,
      wantedLevel: 3,
      missionIntensity: 1,
    });

    expect(chase.engineFrequency).toBeGreaterThan(calm.engineFrequency);
    expect(chase.engineGain).toBeGreaterThan(calm.engineGain);
    expect(chase.windGain).toBeGreaterThan(calm.windGain);
    expect(chase.pursuitGain).toBeGreaterThan(calm.pursuitGain);
    expect(chase.sirenGain).toBeGreaterThan(0);
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
    expect(mix.cityGain).toBeLessThan(0.01);
  });

  it("sanitizes non-finite and out-of-range telemetry", () => {
    expect(
      normalizeAudioState({
        ...DEFAULT_AFTERLIGHT_AUDIO_STATE,
        speedKph: Number.NaN,
        health: -40,
        missionIntensity: 5,
      }),
    ).toMatchObject({ speedKph: 0, health: 0, missionIntensity: 1 });
  });
});
