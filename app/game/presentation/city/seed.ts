const UINT32_RANGE = 0x1_0000_0000;

export function hashCitySeed(seed: number | string): number {
  if (typeof seed === "number") {
    return Math.trunc(seed) >>> 0 || 1;
  }

  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 1;
}

export type CityRng = ReturnType<typeof createCityRng>;

export function createCityRng(seed: number | string, stream = "city") {
  let state = hashCitySeed(`${hashCitySeed(seed)}:${stream}`);

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };

  return {
    bool(probability = 0.5): boolean {
      return next() < probability;
    },
    int(min: number, maxInclusive: number): number {
      return Math.floor(next() * (maxInclusive - min + 1)) + min;
    },
    next,
    pick<T>(values: readonly T[]): T {
      if (values.length === 0)
        throw new Error("Cannot pick from an empty city palette");
      return values[Math.floor(next() * values.length)] as T;
    },
    range(min: number, max: number): number {
      return min + next() * (max - min);
    },
  };
}

export function stableCityOrder(id: string, seed: number): number {
  return hashCitySeed(`${seed}:${id}`);
}
