import { CITY_EXTENTS } from "./city-layout";
import { stableCityOrder } from "./seed";
import type { CityVec3 } from "./types";

export const CITY_BLACKOUT_COLLAPSE_TICKS = 36;
export const CITY_BLACKOUT_SECTOR_COUNT = 12;

const CITY_BLACKOUT_COLUMNS = 4;
const CITY_BLACKOUT_ROWS = 3;
const CITY_BLACKOUT_RESERVE_DIVISOR = 24;
const CITY_BLACKOUT_FLICKER_PERIOD = 4;

export type CityPowerMode = "powered" | "collapsing" | "blackout";

export interface CityPowerState {
  readonly mode: CityPowerMode;
  readonly currentTick: number;
  readonly reducedMotion: boolean;
  readonly seed: number;
  readonly collapseProgress: number;
  readonly disabledSectors: readonly number[];
}

export interface ResolveCityPowerStateOptions {
  readonly blackoutActive: boolean;
  readonly blackoutStartTick?: number;
  readonly currentTick: number;
  readonly reducedMotion: boolean;
  readonly seed: number;
}

interface CityPowerFeature {
  readonly id: string;
  readonly position: CityVec3;
}

export function createPoweredCityPowerState(
  seed: number,
  currentTick = 0,
  reducedMotion = false,
): CityPowerState {
  return {
    collapseProgress: 0,
    currentTick,
    disabledSectors: Object.freeze([]) as readonly number[],
    mode: "powered",
    reducedMotion,
    seed,
  };
}

export function resolveCityPowerState({
  blackoutActive,
  blackoutStartTick,
  currentTick,
  reducedMotion,
  seed,
}: ResolveCityPowerStateOptions): CityPowerState {
  if (!blackoutActive) {
    return createPoweredCityPowerState(seed, currentTick, reducedMotion);
  }

  const orderedSectors = orderedBlackoutSectors(seed);
  if (blackoutStartTick == null) {
    return {
      collapseProgress: 1,
      currentTick,
      disabledSectors: orderedSectors,
      mode: "blackout",
      reducedMotion,
      seed,
    };
  }

  const elapsed = Math.max(0, currentTick - blackoutStartTick);
  const collapseProgress = Math.min(1, elapsed / CITY_BLACKOUT_COLLAPSE_TICKS);
  const disabledSectorCount = Math.min(
    CITY_BLACKOUT_SECTOR_COUNT,
    Math.floor(collapseProgress * CITY_BLACKOUT_SECTOR_COUNT),
  );

  return {
    collapseProgress,
    currentTick,
    disabledSectors: orderedSectors.slice(0, disabledSectorCount),
    mode:
      disabledSectorCount >= CITY_BLACKOUT_SECTOR_COUNT
        ? "blackout"
        : "collapsing",
    reducedMotion,
    seed,
  };
}

export function citySectorForPosition(position: CityVec3): number {
  const x = normalize(position[0], -CITY_EXTENTS.landMax, CITY_EXTENTS.landMax);
  const z = normalize(
    position[2],
    CITY_EXTENTS.bridgeEndZ,
    CITY_EXTENTS.landMax,
  );
  const column = Math.min(
    CITY_BLACKOUT_COLUMNS - 1,
    Math.floor(x * CITY_BLACKOUT_COLUMNS),
  );
  const row = Math.min(
    CITY_BLACKOUT_ROWS - 1,
    Math.floor(z * CITY_BLACKOUT_ROWS),
  );
  return row * CITY_BLACKOUT_COLUMNS + column;
}

export function isCityLightPowered(
  featureId: string,
  position: CityVec3,
  powerState: CityPowerState,
): boolean {
  if (powerState.mode === "powered") return true;
  if (isReserveCircuit(featureId, powerState.seed)) return true;

  const sector = citySectorForPosition(position);
  if (!powerState.disabledSectors.includes(sector)) return true;

  const boundarySector =
    powerState.mode === "collapsing"
      ? powerState.disabledSectors[powerState.disabledSectors.length - 1]
      : undefined;
  if (
    boundarySector !== sector ||
    powerState.reducedMotion ||
    powerState.mode !== "collapsing"
  ) {
    return false;
  }

  return (
    stableCityOrder(`flicker:${featureId}`, powerState.seed) %
      CITY_BLACKOUT_FLICKER_PERIOD ===
    powerState.currentTick % CITY_BLACKOUT_FLICKER_PERIOD
  );
}

export function filterPoweredCityFeatures<T extends CityPowerFeature>(
  features: readonly T[],
  powerState: CityPowerState,
): T[] {
  return features.filter((feature) =>
    isCityLightPowered(feature.id, feature.position, powerState),
  );
}

function orderedBlackoutSectors(seed: number): readonly number[] {
  return Array.from(
    { length: CITY_BLACKOUT_SECTOR_COUNT },
    (_, index) => index,
  ).toSorted(
    (left, right) =>
      stableCityOrder(`city-sector:${left}`, seed) -
      stableCityOrder(`city-sector:${right}`, seed),
  );
}

function isReserveCircuit(id: string, seed: number): boolean {
  return (
    stableCityOrder(`city-reserve:${id}`, seed) %
      CITY_BLACKOUT_RESERVE_DIVISOR ===
    0
  );
}

function normalize(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const span = max - min;
  if (span <= 0) return 0;
  return (clamped - min) / span;
}
