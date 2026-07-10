const UINT32_RANGE = 4_294_967_296;

function avalanche(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export function hashVfxId(id: string | number): number {
  if (typeof id === "number") {
    return avalanche(Number.isFinite(id) ? Math.trunc(id) : 0);
  }

  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return avalanche(hash);
}

export function mixVfxSeed(
  worldSeed: number,
  id: string | number,
  ordinal = 0,
  lane = 0,
): number {
  let mixed = avalanche(Number.isFinite(worldSeed) ? Math.trunc(worldSeed) : 0);
  mixed = avalanche(mixed ^ hashVfxId(id));
  mixed = avalanche(mixed ^ Math.imul(Math.trunc(ordinal), 0x9e3779b1));
  return avalanche(mixed ^ Math.imul(Math.trunc(lane), 0x85ebca77));
}

export function vfxRandom01(seed: number, lane = 0): number {
  return (
    avalanche(seed ^ Math.imul(Math.trunc(lane), 0x27d4eb2d)) / UINT32_RANGE
  );
}

export function vfxSigned(seed: number, lane = 0): number {
  return vfxRandom01(seed, lane) * 2 - 1;
}
