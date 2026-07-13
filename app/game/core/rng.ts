export type RngSeed = number | string;

export interface SeededRngState {
  readonly seed: number;
  readonly state: number;
}

const UINT32_SIZE = 0x1_0000_0000;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function hashBytes(hash: number, value: number): number {
  return Math.imul(hash ^ (value & 0xff), FNV_PRIME) >>> 0;
}

function hashString(value: string, initial = FNV_OFFSET): number {
  let hash = initial >>> 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    hash = hashBytes(hash, codeUnit);
    hash = hashBytes(hash, codeUnit >>> 8);
  }

  return hash;
}

function avalanche(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export function normalizeSeed(seed: RngSeed): number {
  if (typeof seed === "string") {
    return avalanche(hashString(seed));
  }

  if (!Number.isFinite(seed)) {
    throw new RangeError("RNG seed must be finite");
  }

  return Math.trunc(seed) >>> 0;
}

export function deriveSeed(seed: RngSeed, streamName: string): number {
  if (typeof streamName !== "string") {
    throw new TypeError("RNG stream name must be a string");
  }

  const root = normalizeSeed(seed);
  let hash = FNV_OFFSET;
  hash = hashBytes(hash, root);
  hash = hashBytes(hash, root >>> 8);
  hash = hashBytes(hash, root >>> 16);
  hash = hashBytes(hash, root >>> 24);

  return avalanche(hashString(streamName, hash));
}

export class SeededRng {
  readonly seed: number;
  private currentState: number;

  constructor(seed: RngSeed) {
    this.seed = normalizeSeed(seed);
    this.currentState = this.seed;
  }

  get state(): number {
    return this.currentState;
  }

  nextUint32(): number {
    let value = (this.currentState + 0x6d2b79f5) >>> 0;
    this.currentState = value;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  next(): number {
    return this.nextUint32() / UINT32_SIZE;
  }

  nextFloat(): number {
    return this.next();
  }

  float(): number {
    return this.next();
  }

  range(minInclusive: number, maxExclusive: number): number {
    if (
      !Number.isFinite(minInclusive) ||
      !Number.isFinite(maxExclusive) ||
      maxExclusive <= minInclusive
    ) {
      throw new RangeError("RNG range requires finite bounds with max > min");
    }

    return minInclusive + this.next() * (maxExclusive - minInclusive);
  }

  int(minInclusive: number, maxExclusive: number): number {
    if (
      !Number.isSafeInteger(minInclusive) ||
      !Number.isSafeInteger(maxExclusive) ||
      maxExclusive <= minInclusive
    ) {
      throw new RangeError(
        "RNG integer range requires safe integer bounds with max > min",
      );
    }

    const width = maxExclusive - minInclusive;
    if (width > UINT32_SIZE) {
      throw new RangeError("RNG integer range cannot exceed 2^32 values");
    }

    return minInclusive + Math.floor(this.next() * width);
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    return this.int(minInclusive, maxExclusive);
  }

  chance(probability: number): boolean {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError("RNG probability must be between 0 and 1");
    }

    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new RangeError("Cannot pick from an empty collection");
    }

    return values[this.int(0, values.length)] as T;
  }

  snapshot(): SeededRngState {
    return Object.freeze({ seed: this.seed, state: this.currentState });
  }

  restore(state: number | SeededRngState): void {
    const nextState = typeof state === "number" ? state : state.state;
    const expectedSeed = typeof state === "number" ? this.seed : state.seed;

    if (normalizeSeed(expectedSeed) !== this.seed) {
      throw new Error("Cannot restore RNG state from a different seed");
    }
    if (!Number.isFinite(nextState)) {
      throw new RangeError("RNG state must be finite");
    }

    this.currentState = Math.trunc(nextState) >>> 0;
  }

  clone(): SeededRng {
    const clone = new SeededRng(this.seed);
    clone.restore(this.currentState);
    return clone;
  }

  fork(streamName: string): SeededRng {
    return new SeededRng(deriveSeed(this.seed, streamName));
  }
}

export type RandomStream = SeededRng;
export type RngStreamSnapshot = Readonly<Record<string, number>>;

export class RngStreams {
  readonly seed: number;
  private readonly streams = new Map<string, SeededRng>();

  constructor(seed: RngSeed) {
    this.seed = normalizeSeed(seed);
  }

  stream(name: string): SeededRng {
    const existing = this.streams.get(name);
    if (existing) {
      return existing;
    }

    const stream = new SeededRng(deriveSeed(this.seed, name));
    this.streams.set(name, stream);
    return stream;
  }

  get(name: string): SeededRng {
    return this.stream(name);
  }

  has(name: string): boolean {
    return this.streams.has(name);
  }

  snapshot(): RngStreamSnapshot {
    const snapshot: Record<string, number> = Object.create(null) as Record<
      string,
      number
    >;

    for (const name of [...this.streams.keys()].sort()) {
      snapshot[name] = (this.streams.get(name) as SeededRng).state;
    }

    return Object.freeze(snapshot);
  }

  restore(snapshot: RngStreamSnapshot): void {
    this.streams.clear();

    for (const name of Object.keys(snapshot).sort()) {
      this.stream(name).restore(snapshot[name] as number);
    }
  }

  clone(): RngStreams {
    const clone = new RngStreams(this.seed);
    clone.restore(this.snapshot());
    return clone;
  }
}

export function createRng(seed: RngSeed): SeededRng {
  return new SeededRng(seed);
}
