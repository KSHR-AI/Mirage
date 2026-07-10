export type GameQualityTier = "low" | "medium" | "high";

export interface GameQualitySettings {
  readonly tier: GameQualityTier;
  readonly dpr: readonly [minimum: number, maximum: number];
  readonly antialias: boolean;
  readonly shadows: boolean;
  readonly shadowMapSize: 512 | 1024 | 2048;
  readonly trafficCount: number;
  readonly civilianCount: number;
  readonly policeUnitCap: number;
  readonly buildingDetail: number;
  readonly particles: number;
  readonly postEffects: boolean;
}

export interface DeviceProfile {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly devicePixelRatio: number;
  readonly hardwareConcurrency?: number;
  readonly deviceMemoryGb?: number;
  readonly coarsePointer: boolean;
  readonly reducedMotion: boolean;
}

export interface PerformanceSample {
  readonly frameMs: number;
  readonly droppedSimulationSeconds: number;
}

export interface PerformanceGovernorOptions {
  readonly initialTier: GameQualityTier;
  readonly evaluationWindow?: number;
  readonly minimumSamples?: number;
  readonly degradeCooldownSamples?: number;
}

export interface PerformanceReport {
  readonly tier: GameQualityTier;
  readonly changed: boolean;
  readonly averageFrameMs: number;
  readonly slowFrameRatio: number;
  readonly droppedSimulationSeconds: number;
}

export const QUALITY_SETTINGS: Readonly<
  Record<GameQualityTier, GameQualitySettings>
> = Object.freeze({
  low: Object.freeze({
    tier: "low",
    dpr: Object.freeze([0.7, 0.9] as const),
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    trafficCount: 8,
    civilianCount: 10,
    policeUnitCap: 2,
    buildingDetail: 0.55,
    particles: 28,
    postEffects: false,
  }),
  medium: Object.freeze({
    tier: "medium",
    dpr: Object.freeze([0.85, 1.1] as const),
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    trafficCount: 14,
    civilianCount: 18,
    policeUnitCap: 3,
    buildingDetail: 0.78,
    particles: 58,
    postEffects: false,
  }),
  high: Object.freeze({
    tier: "high",
    dpr: Object.freeze([1, 1.35] as const),
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    trafficCount: 22,
    civilianCount: 30,
    policeUnitCap: 4,
    buildingDetail: 1,
    particles: 92,
    postEffects: true,
  }),
});

const TIER_ORDER: readonly GameQualityTier[] = ["low", "medium", "high"];

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

export function selectInitialQuality(profile: DeviceProfile): GameQualityTier {
  const cores = finiteOr(profile.hardwareConcurrency, 4);
  const memory = finiteOr(profile.deviceMemoryGb, 4);
  const pixelLoad =
    Math.max(1, profile.viewportWidth) *
    Math.max(1, profile.viewportHeight) *
    Math.max(1, profile.devicePixelRatio) ** 2;
  const mobileViewport = profile.coarsePointer || profile.viewportWidth <= 760;

  if (
    profile.reducedMotion ||
    cores <= 2 ||
    memory <= 2 ||
    pixelLoad > 7_500_000
  ) {
    return "low";
  }

  if (mobileViewport || cores <= 6 || memory < 6 || pixelLoad > 4_200_000) {
    return "medium";
  }

  return "high";
}

export function lowerQuality(tier: GameQualityTier): GameQualityTier {
  const index = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.max(0, index - 1)];
}

export function qualitySettings(tier: GameQualityTier): GameQualitySettings {
  return QUALITY_SETTINGS[tier];
}

export class PerformanceGovernor {
  private tier: GameQualityTier;
  private readonly samples: PerformanceSample[] = [];
  private readonly evaluationWindow: number;
  private readonly minimumSamples: number;
  private readonly degradeCooldownSamples: number;
  private cooldown = 0;

  constructor(options: PerformanceGovernorOptions) {
    this.tier = options.initialTier;
    this.evaluationWindow = Math.max(
      30,
      Math.floor(options.evaluationWindow ?? 180),
    );
    this.minimumSamples = Math.min(
      this.evaluationWindow,
      Math.max(20, Math.floor(options.minimumSamples ?? 90)),
    );
    this.degradeCooldownSamples = Math.max(
      1,
      Math.floor(options.degradeCooldownSamples ?? 300),
    );
  }

  get currentTier(): GameQualityTier {
    return this.tier;
  }

  reset(tier: GameQualityTier = this.tier): void {
    this.tier = tier;
    this.samples.length = 0;
    this.cooldown = 0;
  }

  sample(sample: PerformanceSample): PerformanceReport {
    const safeSample = {
      frameMs:
        Number.isFinite(sample.frameMs) && sample.frameMs >= 0
          ? Math.min(sample.frameMs, 250)
          : 0,
      droppedSimulationSeconds:
        Number.isFinite(sample.droppedSimulationSeconds) &&
        sample.droppedSimulationSeconds > 0
          ? sample.droppedSimulationSeconds
          : 0,
    };
    this.samples.push(safeSample);
    if (this.samples.length > this.evaluationWindow) this.samples.shift();
    if (this.cooldown > 0) this.cooldown -= 1;

    const averageFrameMs =
      this.samples.reduce((total, item) => total + item.frameMs, 0) /
      this.samples.length;
    const slowThreshold = this.tier === "low" ? 38 : 24;
    const slowFrames = this.samples.filter(
      (item) => item.frameMs > slowThreshold,
    ).length;
    const slowFrameRatio = slowFrames / this.samples.length;
    const droppedSimulationSeconds = this.samples.reduce(
      (total, item) => total + item.droppedSimulationSeconds,
      0,
    );

    const shouldDegrade =
      this.tier !== "low" &&
      this.cooldown === 0 &&
      this.samples.length >= this.minimumSamples &&
      (slowFrameRatio >= 0.22 ||
        averageFrameMs >= (this.tier === "high" ? 21 : 31) ||
        droppedSimulationSeconds >= 0.2);

    let changed = false;
    if (shouldDegrade) {
      this.tier = lowerQuality(this.tier);
      this.samples.length = 0;
      this.cooldown = this.degradeCooldownSamples;
      changed = true;
    }

    return {
      tier: this.tier,
      changed,
      averageFrameMs,
      slowFrameRatio,
      droppedSimulationSeconds,
    };
  }
}

export function readBrowserDeviceProfile(): DeviceProfile {
  const navigatorWithMemory = navigator as Navigator & {
    deviceMemory?: number;
  };

  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: navigatorWithMemory.deviceMemory,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
  };
}
