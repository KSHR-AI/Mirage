import { describe, expect, it } from "vitest";

import {
  AUTHORED_AGENT_CLIP_CANDIDATES,
  AUTHORED_AGENT_MODEL_URLS,
  getAuthoredAgentMaterialTreatment,
  getAuthoredAgentTimeScale,
  getAuthoredAgentVariation,
  resolveAuthoredAgentAnimation,
  resolveAuthoredAgentClipName,
} from "./authored-agent-model";
import { getAgentAppearance } from "./appearance";

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
      jump: ["Run", "Idle_Neutral"],
      aim: ["Idle_Gun_Pointing"],
      fire: ["Idle_Gun_Shoot", "Gun_Shoot"],
      cower: ["Idle"],
      down: ["Death"],
    });
    expect(resolveAuthoredAgentClipName(SOURCE_CLIPS, "jump")).toBe("Run");
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
    expect(getAuthoredAgentTimeScale("walk", 2.6, 1, 4 / 3, 1.02)).toBeCloseTo(
      (2.6 * (4 / 3)) / (1.76 * 1.02),
    );
    expect(getAuthoredAgentTimeScale("run", 5.8, 1, 0.8, 1.02)).toBeCloseTo(
      (5.8 * 0.8) / (2.08 * 1.02),
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

  it("starts the hero on a stable phase without cadence randomization", () => {
    expect(getAuthoredAgentVariation(1, "player")).toMatchObject({
      animationPhase: 0,
      playbackRate: 1,
    });
  });

  it("maps source material names into the role-specific Mirage palette", () => {
    const player = getAgentAppearance("hero", "player");
    const police = getAgentAppearance("unit-2", "police");

    expect(
      getAuthoredAgentMaterialTreatment("Green", player, "player"),
    ).toMatchObject({ color: player.jacket, roughness: 0.54 });
    const secondaryTrousers = getAuthoredAgentMaterialTreatment(
      "Brown2",
      player,
      "player",
    );
    expect(secondaryTrousers).toMatchObject({ roughness: 0.65 });
    expect(secondaryTrousers?.color).not.toBe(player.trousers);
    expect(
      getAuthoredAgentMaterialTreatment("Swat_Black", police, "police"),
    ).toMatchObject({ color: police.trousers, roughness: 0.61 });
    expect(
      getAuthoredAgentMaterialTreatment("Visor", police, "police"),
    ).toMatchObject({ opacity: 0.82, transparent: true });
    expect(
      getAuthoredAgentMaterialTreatment("Unknown", player, "player"),
    ).toBeNull();
  });
});
