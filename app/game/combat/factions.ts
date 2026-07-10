import type { ActorState, Faction } from "../core/contracts";

export type FactionDamagePolicy = Readonly<Record<Faction, readonly Faction[]>>;

export const FACTION_DAMAGE_POLICY: FactionDamagePolicy = {
  player: ["civilian", "afterlight", "police"],
  civilian: [],
  afterlight: ["player", "police"],
  police: ["player", "afterlight"],
};

export function canFactionDamage(
  source: Faction,
  target: Faction,
  policy: FactionDamagePolicy = FACTION_DAMAGE_POLICY,
) {
  return policy[source].includes(target);
}

export function canActorDamage(
  source: ActorState,
  target: ActorState,
  policy?: FactionDamagePolicy,
) {
  return (
    source.id !== target.id &&
    source.life === "alive" &&
    target.life === "alive" &&
    canFactionDamage(source.faction, target.faction, policy)
  );
}
