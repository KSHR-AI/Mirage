import { describe, expect, it } from "vitest";

import {
  AUTHORED_AGENT_CLIP_CANDIDATES,
  AUTHORED_AGENT_MODEL_URLS,
  getAuthoredAgentTimeScale,
  getAuthoredAgentVariation,
  resolveAuthoredAgentAnimation,
  resolveAuthoredAgentClipName,
} from "./authored-agent-model";

const SOURCE_CLIPS = [
  "Death",
  "Gun_Shoot",
  "Idle_Gun_Pointing",
  "Idle_Gun_Shoot",
  "Idle_Neutral",
  "Roll",
  "Run",
  "Walk",
] as const;

describe("authored agent model helpers", () => {
  it("maps roles to the three authored character assets", () => {
    expect(AUTHORED_AGENT_MODEL_URLS).toEqual({
      player: "/game-assets/models/characters/runner.glb",
      civilian: "/game-assets/models/characters/civilian.glb",
      guard: "/game-assets/models/characters/officer.glb",
      police: "/game-assets/models/characters/officer.glb",
    });
  });

  it("keeps the runtime-to-source clip contract explicit", () => {
    expect(AUTHORED_AGENT_CLIP_CANDIDATES).toEqual({
      idle: ["Idle_Neutral", "Idle"],
      walk: ["Walk"],
      run: ["Run"],
      jump: ["Roll", "Run"],
      aim: ["Idle_Gun_Pointing"],
      fire: ["Idle_Gun_Shoot", "Gun_Shoot"],
      cower: ["Idle"],
      down: ["Death"],
    });
    expect(resolveAuthoredAgentClipName(SOURCE_CLIPS, "jump")).toBe("Roll");
    expect(resolveAuthoredAgentClipName(SOURCE_CLIPS, "fire")).toBe(
      "Idle_Gun_Shoot",
    );
    expect(resolveAuthoredAgentClipName(SOURCE_CLIPS, "down")).toBe("Death");
  });

  it("normalizes exported clip names and falls back synchronously", () => {
    expect(resolveAuthoredAgentClipName(["Rig|idle-neutral.001"], "idle")).toBe(
      "Rig|idle-neutral.001",
    );
    expect(resolveAuthoredAgentClipName(["Run", "Idle"], "jump")).toBe("Run");
    expect(resolveAuthoredAgentClipName(["Idle_Neutral"], "cower")).toBe(
      "Idle_Neutral",
    );
    expect(resolveAuthoredAgentClipName([], "walk")).toBeNull();
  });

  it("derives state and playback rate from sanitized motion signals", () => {
    expect(resolveAuthoredAgentAnimation(undefined, 0, false, false)).toBe(
      "idle",
    );
    expect(resolveAuthoredAgentAnimation(undefined, 2, false, false)).toBe(
      "walk",
    );
    expect(resolveAuthoredAgentAnimation(undefined, 8, false, false)).toBe(
      "run",
    );
    expect(resolveAuthoredAgentAnimation(undefined, 0, true, false)).toBe(
      "aim",
    );
    expect(resolveAuthoredAgentAnimation(undefined, 0, true, true)).toBe(
      "fire",
    );
    expect(resolveAuthoredAgentAnimation("down", 8, true, true)).toBe("down");

    expect(getAuthoredAgentTimeScale("walk", 5)).toBeGreaterThan(
      getAuthoredAgentTimeScale("walk", 1),
    );
    expect(getAuthoredAgentTimeScale("run", 8.5)).toBeGreaterThan(
      getAuthoredAgentTimeScale("run", 2),
    );
    expect(Number.isFinite(getAuthoredAgentTimeScale("walk", Number.NaN))).toBe(
      true,
    );
  });

  it("keeps entity variation deterministic and bounded", () => {
    const first = getAuthoredAgentVariation("civilian-12", "civilian");
    const again = getAuthoredAgentVariation("civilian-12", "civilian");
    const neighbor = getAuthoredAgentVariation("civilian-13", "civilian");

    expect(first).toEqual(again);
    expect(first).not.toEqual(neighbor);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.animationPhase).toBeGreaterThanOrEqual(0);
    expect(first.animationPhase).toBeLessThan(1);
    expect(first.playbackRate).toBeGreaterThanOrEqual(0.96);
    expect(first.playbackRate).toBeLessThanOrEqual(1.04);
    expect(first.scale).toBeGreaterThanOrEqual(0.94);
    expect(first.scale).toBeLessThanOrEqual(1.06);
  });
});
