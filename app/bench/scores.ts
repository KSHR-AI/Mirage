/**
 * MirageML Bench Index scores.
 *
 * Scores belong to a model + harness pair, and to each published run. They live
 * here, apart from the submission records in `submissions/*.json`, which state
 * only published evidence. Every score is a 0–100 judgment of a played game.
 */

export const INDEX_VERSION = "v1.0";

export type MetricKey =
  "playability" | "mapFidelity" | "driving" | "missions" | "performance";

export type Metric = {
  key: MetricKey;
  label: string;
  short: string;
  description: string;
};

export const METRICS: readonly Metric[] = [
  {
    key: "playability",
    label: "Playability",
    short: "Play",
    description:
      "Boots in the sandboxed player, controls respond, and a ten-minute session finishes without a soft-lock or crash.",
  },
  {
    key: "mapFidelity",
    label: "SF Map Fidelity",
    short: "Map",
    description:
      "Recognizable San Francisco: street grid, hills, the Bay, and landmarks a local could navigate by.",
  },
  {
    key: "driving",
    label: "Driving & Physics",
    short: "Drive",
    description:
      "Vehicle handling, collisions, traffic, and entering or leaving cars on foot.",
  },
  {
    key: "missions",
    label: "Missions & Wanted System",
    short: "Missions",
    description:
      "Objectives, pedestrians, police response, and a loop that gives the player something to do.",
  },
  {
    key: "performance",
    label: "Runtime Performance",
    short: "Perf",
    description:
      "Load time and frame pacing on a mid-range laptop at 1080p in the opaque-origin player.",
  },
];

export type ProviderKey =
  | "anthropic"
  | "openai"
  | "google"
  | "meta"
  | "moonshot"
  | "alibaba"
  | "xai"
  | "deepseek"
  | "tencent"
  | "zhipu"
  | "mistral"
  | "xiaomi"
  | "nvidia"
  | "unknown";

export type Provider = {
  name: string;
  /** Bar and badge color. */
  color: string;
  /** Monogram shown in the badge under each bar. */
  mark: string;
  /** Badge text color on `color`. */
  ink: string;
};

export const PROVIDERS: Record<ProviderKey, Provider> = {
  anthropic: { name: "Anthropic", color: "#c8775c", mark: "A", ink: "#fff" },
  openai: { name: "OpenAI", color: "#232323", mark: "O", ink: "#fff" },
  google: { name: "Google", color: "#34a853", mark: "G", ink: "#fff" },
  meta: { name: "Meta", color: "#0b84ff", mark: "M", ink: "#fff" },
  moonshot: { name: "Moonshot AI", color: "#1677ff", mark: "K", ink: "#fff" },
  alibaba: { name: "Alibaba", color: "#ff6a00", mark: "Q", ink: "#fff" },
  xai: { name: "xAI", color: "#7a6fd6", mark: "x", ink: "#fff" },
  deepseek: { name: "DeepSeek", color: "#2f46e0", mark: "D", ink: "#fff" },
  tencent: { name: "Tencent", color: "#4fb3ff", mark: "T", ink: "#fff" },
  zhipu: { name: "Z.ai", color: "#2b7bf2", mark: "Z", ink: "#fff" },
  mistral: { name: "Mistral", color: "#f03c12", mark: "M", ink: "#fff" },
  xiaomi: { name: "Xiaomi", color: "#ff6900", mark: "mi", ink: "#fff" },
  nvidia: { name: "NVIDIA", color: "#76b900", mark: "N", ink: "#fff" },
  unknown: { name: "Not recorded", color: "#8a8f98", mark: "?", ink: "#fff" },
};

export type SubScores = Readonly<Record<MetricKey, number>>;

export type Access = "public-api" | "no-public-api";

type EntryRecord = {
  id: string;
  model: string;
  harness: string;
  provider: ProviderKey;
  access: Access;
  /** Benchmark trials behind the pair's scores. */
  trials: number;
  /** Median wall-clock hours from empty repository to deployed game. */
  buildHours: number;
  /** Published runs in `submissions/` attributed to this pair; at least one. */
  runIds: readonly string[];
  scores: SubScores;
};

export type Entry = EntryRecord & { index: number };

function s(
  playability: number,
  mapFidelity: number,
  driving: number,
  missions: number,
  performance: number,
): SubScores {
  return { playability, mapFidelity, driving, missions, performance };
}

const ENTRY_RECORDS: readonly EntryRecord[] = [
  {
    id: "gpt-6-2-astra--niteshift",
    model: "GPT-6.2-Astra",
    harness: "Niteshift",
    provider: "openai",
    access: "public-api",
    trials: 3,
    buildHours: 8.4,
    runIds: ["grand-theft-astra"],
    scores: s(72, 58, 66, 50, 55),
  },
  {
    id: "claude-opus-5-5--claude-code",
    model: "Claude Opus 5.5",
    harness: "Claude Code",
    provider: "anthropic",
    access: "public-api",
    trials: 5,
    buildHours: 6.1,
    runIds: ["port-solano-001"],
    scores: s(70, 58, 62, 47, 56),
  },
  {
    id: "claude-fable-5-2--not-recorded",
    model: "Claude Fable 5.2",
    harness: "Harness not recorded",
    provider: "anthropic",
    access: "public-api",
    trials: 1,
    buildHours: 0,
    runIds: ["crosstown"],
    scores: s(64, 56, 54, 38, 50),
  },
  {
    id: "claude-opus-5--claude-code",
    model: "Claude Opus 5",
    harness: "Claude Code",
    provider: "anthropic",
    access: "public-api",
    trials: 5,
    buildHours: 7.6,
    runIds: ["opus-sanfran"],
    scores: s(58, 46, 52, 36, 48),
  },
  {
    id: "gpt-5-6-ultra--codex-desktop",
    model: "GPT-5.6 Ultra",
    harness: "Codex desktop",
    provider: "openai",
    access: "public-api",
    trials: 4,
    buildHours: 9.2,
    runIds: ["bayline-heat"],
    scores: s(55, 44, 49, 33, 49),
  },
  {
    id: "gpt-6-astra--chatgpt-sites",
    model: "GPT-6-Astra",
    harness: "ChatGPT Sites",
    provider: "openai",
    access: "public-api",
    trials: 2,
    buildHours: 1.2,
    runIds: ["not-gta-6-seaplane"],
    scores: s(52, 38, 48, 26, 46),
  },
  {
    id: "not-recorded--not-recorded",
    model: "Model not recorded",
    harness: "Harness not recorded",
    provider: "unknown",
    access: "public-api",
    trials: 1,
    buildHours: 0,
    runIds: ["slop-newyork"],
    scores: s(48, 52, 28, 14, 44),
  },
];

export type RunScore = {
  runId: string;
  entryId: string;
  scores: SubScores;
  index: number;
  /** One line from the judges' play session. */
  verdict: string;
};

const RUN_RECORDS: readonly Omit<RunScore, "index">[] = [
  {
    runId: "grand-theft-astra",
    entryId: "gpt-6-2-astra--niteshift",
    scores: s(74, 60, 68, 51, 54),
    verdict:
      "Tight car handling and a working wanted meter; the map thins out west of Van Ness.",
  },
  {
    runId: "port-solano-001",
    entryId: "claude-opus-5-5--claude-code",
    scores: s(71, 57, 63, 48, 55),
    verdict:
      "Stable from boot to credits with a readable mission chain; hills read flat.",
  },
  {
    runId: "crosstown",
    entryId: "claude-fable-5-2--not-recorded",
    scores: s(64, 56, 54, 38, 50),
    verdict:
      "Dense, believable blocks and smooth traversal; little to do once you have a car.",
  },
  {
    runId: "opus-sanfran",
    entryId: "claude-opus-5--claude-code",
    scores: s(59, 47, 52, 37, 47),
    verdict:
      "Landmarks in the right places and a real police chase; frame time spikes downtown.",
  },
  {
    runId: "bayline-heat",
    entryId: "gpt-5-6-ultra--codex-desktop",
    scores: s(56, 45, 50, 33, 48),
    verdict:
      "Strong neon art direction along the Embarcadero; missions end without a fail state.",
  },
  {
    runId: "not-gta-6-seaplane",
    entryId: "gpt-6-astra--chatgpt-sites",
    scores: s(52, 38, 48, 26, 46),
    verdict:
      "The seaplane is a delight to fly; the city underneath is mostly placeholder blocks.",
  },
  {
    runId: "slop-newyork",
    entryId: "not-recorded--not-recorded",
    scores: s(48, 52, 28, 14, 44),
    verdict:
      "Gorgeous WebGPU city, but it is New York, not San Francisco, and there is no game loop.",
  },
];

export function computeIndex(scores: SubScores) {
  const values = METRICS.map((metric) => scores[metric.key]);
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export const ENTRIES: readonly Entry[] = ENTRY_RECORDS.map((entry) => ({
  ...entry,
  index: computeIndex(entry.scores),
}));

export const RUN_SCORES: readonly RunScore[] = RUN_RECORDS.map((run) => ({
  ...run,
  index: computeIndex(run.scores),
}));

export type ScoreKey = "index" | MetricKey;

export function getScore(
  item: { index: number; scores: SubScores },
  key: ScoreKey,
) {
  return key === "index" ? item.index : item.scores[key];
}

export function getScoreLabel(key: ScoreKey) {
  return key === "index"
    ? "MirageML Bench Index"
    : (METRICS.find((metric) => metric.key === key)?.label ?? key);
}

export function getEntry(id: string) {
  return ENTRIES.find((entry) => entry.id === id) ?? null;
}

export function getRunScore(runId: string) {
  return RUN_SCORES.find((run) => run.runId === runId) ?? null;
}

/** Rank by `key`, highest first; ties keep their order in the data file. */
export function rankEntries(
  entries: readonly Entry[],
  key: ScoreKey = "index",
) {
  return [...entries].sort((a, b) => getScore(b, key) - getScore(a, key));
}

export function getEntryLabel(entry: Pick<Entry, "model" | "harness">) {
  return `${entry.model} · ${entry.harness}`;
}

export const HARNESSES: readonly string[] = [
  ...new Set(ENTRY_RECORDS.map((entry) => entry.harness)),
].sort();
