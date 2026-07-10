import { describe, expect, it } from "vitest";

import {
  AFTERLIGHT_AUDIO_SAMPLE_URLS,
  AFTERLIGHT_CUE_SAMPLE_PROFILES,
  AFTERLIGHT_FOOTSTEP_SAMPLES,
  selectAfterlightSample,
} from "./sample-catalog";

describe("Afterlight sample catalogue", () => {
  it("maps every cue to at least one local recorded sample", () => {
    for (const profile of Object.values(AFTERLIGHT_CUE_SAMPLE_PROFILES)) {
      expect(profile.paths.length).toBeGreaterThan(0);
      for (const path of profile.paths) {
        expect(path).toMatch(/^\/game-assets\/audio\/.+\.ogg$/);
      }
    }
  });

  it("preloads each unique local sample once", () => {
    expect(new Set(AFTERLIGHT_AUDIO_SAMPLE_URLS).size).toBe(
      AFTERLIGHT_AUDIO_SAMPLE_URLS.length,
    );
    expect(AFTERLIGHT_FOOTSTEP_SAMPLES).toHaveLength(5);
  });

  it("selects variants deterministically by token or sequence", () => {
    const paths = ["a", "b", "c"];
    expect(selectAfterlightSample(paths, "shot:42", 0)).toBe(
      selectAfterlightSample(paths, "shot:42", 99),
    );
    expect(selectAfterlightSample(paths, undefined, 4)).toBe("b");
  });
});
