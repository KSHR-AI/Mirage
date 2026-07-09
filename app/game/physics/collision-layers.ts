export const enum CollisionLayer {
  World = 0,
  Player = 1,
  Vehicle = 2,
  Actor = 3,
  Projectile = 4,
  Trigger = 5,
  Debris = 6,
}

const ALL_FILTERS = 0xffff;

export function layerBit(layer: CollisionLayer) {
  return 1 << layer;
}

export function layerMask(...layers: readonly CollisionLayer[]) {
  return layers.reduce((mask, layer) => mask | layerBit(layer), 0);
}

export function interactionGroups(
  memberships: readonly CollisionLayer[],
  filters: readonly CollisionLayer[],
) {
  const membershipMask = layerMask(...memberships);
  const filterMask = filters.length === 0 ? ALL_FILTERS : layerMask(...filters);
  return ((membershipMask & ALL_FILTERS) << 16) | (filterMask & ALL_FILTERS);
}

export const COLLISION_GROUPS = {
  world: interactionGroups(
    [CollisionLayer.World],
    [
      CollisionLayer.Player,
      CollisionLayer.Vehicle,
      CollisionLayer.Actor,
      CollisionLayer.Projectile,
      CollisionLayer.Debris,
    ],
  ),
  player: interactionGroups(
    [CollisionLayer.Player],
    [
      CollisionLayer.World,
      CollisionLayer.Vehicle,
      CollisionLayer.Actor,
      CollisionLayer.Trigger,
    ],
  ),
  vehicle: interactionGroups(
    [CollisionLayer.Vehicle],
    [
      CollisionLayer.World,
      CollisionLayer.Player,
      CollisionLayer.Vehicle,
      CollisionLayer.Actor,
      CollisionLayer.Trigger,
      CollisionLayer.Debris,
    ],
  ),
  actor: interactionGroups(
    [CollisionLayer.Actor],
    [
      CollisionLayer.World,
      CollisionLayer.Player,
      CollisionLayer.Vehicle,
      CollisionLayer.Actor,
      CollisionLayer.Trigger,
    ],
  ),
  projectile: interactionGroups(
    [CollisionLayer.Projectile],
    [CollisionLayer.World, CollisionLayer.Vehicle, CollisionLayer.Actor],
  ),
  trigger: interactionGroups(
    [CollisionLayer.Trigger],
    [CollisionLayer.Player, CollisionLayer.Vehicle, CollisionLayer.Actor],
  ),
  debris: interactionGroups(
    [CollisionLayer.Debris],
    [CollisionLayer.World, CollisionLayer.Vehicle],
  ),
} as const;

export function membershipsFromGroups(groups: number) {
  return (groups >>> 16) & ALL_FILTERS;
}

export function filtersFromGroups(groups: number) {
  return groups & ALL_FILTERS;
}
