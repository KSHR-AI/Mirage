import { describe, expect, it } from "vitest";

import type { ActorState, Faction } from "../core/contracts";
import {
  canActorDamage,
  canFactionDamage,
  FACTION_DAMAGE_POLICY,
  type FactionDamagePolicy,
} from "./factions";

const factions: readonly Faction[] = [
  "player",
  "civilian",
  "afterlight",
  "police",
];

function actor(id: number, faction: Faction): ActorState {
  return {
    id,
    kind: faction === "player" ? "player" : "guard",
    faction,
    pose: { position: [0, 0, 0], rotationY: 0 },
    velocity: [0, 0, 0],
    health: 100,
    life: "alive",
  };
}

describe("faction damage policy", () => {
  it("defines every faction and never permits same-faction damage", () => {
    expect(Object.keys(FACTION_DAMAGE_POLICY).sort()).toEqual(
      [...factions].sort(),
    );
    for (const faction of factions) {
      expect(canFactionDamage(faction, faction)).toBe(false);
    }
  });

  it.each([
    ["player", "civilian", true],
    ["player", "afterlight", true],
    ["player", "police", true],
    ["civilian", "player", false],
    ["afterlight", "player", true],
    ["afterlight", "civilian", false],
    ["afterlight", "police", true],
    ["police", "player", true],
    ["police", "civilian", false],
    ["police", "afterlight", true],
  ] as const)("maps %s -> %s to %s", (source, target, expected) => {
    expect(canFactionDamage(source, target)).toBe(expected);
  });

  it("requires distinct living actors in addition to hostile factions", () => {
    const source = actor(1, "player");
    const target = actor(2, "afterlight");

    expect(canActorDamage(source, target)).toBe(true);
    expect(canActorDamage(source, { ...target, id: source.id })).toBe(false);
    expect(canActorDamage({ ...source, life: "dead" }, target)).toBe(false);
    expect(canActorDamage(source, { ...target, life: "down" })).toBe(false);
  });

  it("accepts an explicit mission-specific policy", () => {
    const noDamage: FactionDamagePolicy = {
      player: [],
      civilian: [],
      afterlight: [],
      police: [],
    };
    expect(
      canActorDamage(actor(1, "player"), actor(2, "afterlight"), noDamage),
    ).toBe(false);
  });
});
