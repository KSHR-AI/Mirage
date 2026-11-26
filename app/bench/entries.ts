/**
 * MirageML Bench entries: the model + harness pairs on the leaderboard.
 *
 * Every field here is a recorded fact taken from a published run in
 * `submissions/*.json`. There are no maintainer scores: a pair's standing comes
 * only from Arena votes (`app/arena`), and every pair starts at the same Elo.
 */

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

export type Access = "public-api" | "no-public-api";

export type Entry = {
  id: string;
  model: string;
  harness: string;
  provider: ProviderKey;
  access: Access;
  /** Published runs in `submissions/` attributed to this pair; at least one. */
  runIds: readonly string[];
};

export const ENTRIES: readonly Entry[] = [
  {
    id: "gpt-6-2-astra--niteshift",
    model: "GPT-6.2-Astra",
    harness: "Niteshift",
    provider: "openai",
    access: "public-api",
    runIds: ["grand-theft-astra"],
  },
  {
    id: "claude-opus-5-5--claude-code",
    model: "Claude Opus 5.5",
    harness: "Claude Code",
    provider: "anthropic",
    access: "public-api",
    runIds: ["port-solano-001", "slop-newyork-002"],
  },
  {
    id: "claude-fable-5-2--not-recorded",
    model: "Claude Fable 5.2",
    harness: "Harness not recorded",
    provider: "anthropic",
    access: "public-api",
    runIds: ["crosstown"],
  },
  {
    id: "claude-opus-5--claude-code",
    model: "Claude Opus 5",
    harness: "Claude Code",
    provider: "anthropic",
    access: "public-api",
    runIds: ["opus-sanfran"],
  },
  {
    id: "gpt-5-6-ultra--codex-desktop",
    model: "GPT-5.6 Ultra",
    harness: "Codex desktop",
    provider: "openai",
    access: "public-api",
    runIds: ["bayline-heat"],
  },
  {
    id: "gpt-6-astra--chatgpt-sites",
    model: "GPT-6-Astra",
    harness: "ChatGPT Sites",
    provider: "openai",
    access: "public-api",
    runIds: ["not-gta-6-seaplane"],
  },
];

export function getEntry(id: string) {
  return ENTRIES.find((entry) => entry.id === id) ?? null;
}

/** The pair a published run belongs to, or null if it is not attributed. */
export function getEntryForRun(runId: string) {
  return ENTRIES.find((entry) => entry.runIds.includes(runId)) ?? null;
}

export function getEntryLabel(entry: Pick<Entry, "model" | "harness">) {
  return `${entry.model} · ${entry.harness}`;
}

export const HARNESSES: readonly string[] = [
  ...new Set(ENTRIES.map((entry) => entry.harness)),
].sort();
