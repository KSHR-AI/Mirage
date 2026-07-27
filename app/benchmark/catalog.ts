const taskDocuments = import.meta.glob("../../benchmark/tasks/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const submissionDocuments = import.meta.glob(
  "../../benchmark/submissions/*.json",
  {
    eager: true,
    import: "default",
  },
) as Record<string, unknown>;

export type RunStatus = "playable" | "degraded" | "unplayable";
export type CaptureStatus = "published" | "partial" | "not-recorded";

export type BenchmarkProvenance = {
  prompt: {
    status: CaptureStatus;
    text: string | null;
    digest: string | null;
    note: string;
  };
  setup: {
    status: CaptureStatus;
    modelSnapshot: string | null;
    reasoning: string | null;
    harness: string | null;
    tools: string[];
    agentCount: number | null;
    subagentCount: number | null;
    baseCommit: string | null;
    resultCommit: string;
  };
  execution: {
    wallTimeSeconds: number | null;
    totalTokens: number | null;
    costUsd: number | null;
    retries: number | null;
    humanInterventions: number | null;
  };
  dependencies: {
    packageLock: string;
    thirdPartyAssets: number | null;
    licenseStatus: "verified" | "review-required";
  };
  manifestUrl: string | null;
  submissionPrUrl: string | null;
};

export type BenchmarkRun = {
  id: string;
  taskId: string;
  model: string;
  builtOn: string;
  commit: string;
  playUrl: string;
  sourceUrl: string;
  status: RunStatus;
  progress: {
    percent: number;
    basis: "submitter-estimate";
    note: string;
  };
  comparisonEligible: boolean;
  previewImage: string;
  provenance: BenchmarkProvenance;
  capabilities: Array<{
    label: string;
    status: "verified" | "demonstrated" | "absent";
  }>;
};

export type BenchmarkTask = {
  id: string;
  version: string;
  status: "draft" | "frozen";
  brandName: string;
  surfaceLabel: string;
  gameTitle: string;
  locationLabel: string;
  title: string;
  summary: string;
  updatedOn: string;
  featuredRunId: string;
  repositoryUrl: string;
  contribution: {
    guidePath: string;
    slotLabel: string;
    slotDescription: string;
    slotAction: string;
    navAction: string;
  };
  metadata: {
    title: string;
    description: string;
    shareImage: {
      path: string;
      width: number;
      height: number;
      alt: string;
    };
  };
};

function parseTask(value: unknown): BenchmarkTask {
  const task = value as Partial<BenchmarkTask>;
  if (
    typeof task.id !== "string" ||
    typeof task.version !== "string" ||
    (task.status !== "draft" && task.status !== "frozen") ||
    typeof task.brandName !== "string" ||
    typeof task.surfaceLabel !== "string" ||
    typeof task.gameTitle !== "string" ||
    typeof task.locationLabel !== "string" ||
    typeof task.title !== "string" ||
    typeof task.summary !== "string" ||
    !isIsoDate(task.updatedOn) ||
    typeof task.featuredRunId !== "string" ||
    typeof task.repositoryUrl !== "string" ||
    typeof task.contribution?.guidePath !== "string" ||
    typeof task.contribution.slotLabel !== "string" ||
    typeof task.contribution.slotDescription !== "string" ||
    typeof task.contribution.slotAction !== "string" ||
    typeof task.contribution.navAction !== "string" ||
    typeof task.metadata?.title !== "string" ||
    typeof task.metadata.description !== "string" ||
    typeof task.metadata.shareImage?.path !== "string" ||
    typeof task.metadata.shareImage.width !== "number" ||
    task.metadata.shareImage.width <= 0 ||
    typeof task.metadata.shareImage.height !== "number" ||
    task.metadata.shareImage.height <= 0 ||
    typeof task.metadata.shareImage.alt !== "string"
  ) {
    throw new Error("Invalid benchmark task manifest");
  }
  return task as BenchmarkTask;
}

function parseRun(value: unknown): BenchmarkRun {
  const run = value as Partial<BenchmarkRun>;
  if (
    typeof run.id !== "string" ||
    typeof run.taskId !== "string" ||
    typeof run.model !== "string" ||
    !isIsoDate(run.builtOn) ||
    typeof run.commit !== "string" ||
    typeof run.playUrl !== "string" ||
    typeof run.sourceUrl !== "string" ||
    (run.status !== "playable" &&
      run.status !== "degraded" &&
      run.status !== "unplayable") ||
    typeof run.progress?.percent !== "number" ||
    run.progress.percent < 0 ||
    run.progress.percent > 100 ||
    run.progress.basis !== "submitter-estimate" ||
    typeof run.progress.note !== "string" ||
    typeof run.comparisonEligible !== "boolean" ||
    typeof run.previewImage !== "string" ||
    typeof run.provenance !== "object" ||
    run.provenance === null ||
    !isCaptureStatus(run.provenance.prompt?.status) ||
    !isCaptureStatus(run.provenance.setup?.status) ||
    typeof run.provenance.prompt.note !== "string" ||
    !Array.isArray(run.provenance.setup.tools) ||
    typeof run.provenance.setup.resultCommit !== "string" ||
    typeof run.provenance.dependencies?.packageLock !== "string" ||
    (run.provenance.dependencies.licenseStatus !== "verified" &&
      run.provenance.dependencies.licenseStatus !== "review-required") ||
    !Array.isArray(run.capabilities)
  ) {
    throw new Error("Invalid benchmark run manifest");
  }
  return run as BenchmarkRun;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function isCaptureStatus(value: unknown): value is CaptureStatus {
  return (
    value === "published" || value === "partial" || value === "not-recorded"
  );
}

export function hasPublishedPrompt(run: BenchmarkRun) {
  return (
    run.provenance.prompt.status === "published" &&
    Boolean(run.provenance.prompt.text) &&
    Boolean(run.provenance.prompt.digest)
  );
}

export function hasPublishedSetup(run: BenchmarkRun) {
  const setup = run.provenance.setup;
  return (
    setup.status === "published" &&
    Boolean(setup.modelSnapshot) &&
    Boolean(setup.reasoning) &&
    Boolean(setup.harness) &&
    setup.tools.length > 0 &&
    setup.agentCount !== null &&
    setup.subagentCount !== null &&
    Boolean(setup.baseCommit) &&
    setup.resultCommit === run.commit
  );
}

const discoveredTasks = Object.values(taskDocuments).map(parseTask);
if (discoveredTasks.length !== 1) {
  throw new Error("The benchmark catalog must contain exactly one active task");
}

const benchmarkTask = discoveredTasks[0];
const discoveredRuns = Object.values(submissionDocuments).map((document) =>
  Object.freeze(parseRun(document)),
);

if (discoveredRuns.length === 0) {
  throw new Error("The benchmark catalog must contain at least one run");
}

const runIds = new Set(discoveredRuns.map((run) => run.id));
if (runIds.size !== discoveredRuns.length) {
  throw new Error("Benchmark run identifiers must be unique");
}

if (discoveredRuns.some((run) => run.taskId !== benchmarkTask.id)) {
  throw new Error("Every benchmark run must reference the active task");
}

const featuredRun = discoveredRuns.find(
  (run) => run.id === benchmarkTask.featuredRunId,
);
if (!featuredRun) {
  throw new Error("The task's featured run is missing from the catalog");
}

const orderedRuns = [
  featuredRun,
  ...discoveredRuns
    .filter((run) => run.id !== featuredRun.id)
    .sort((left, right) => right.builtOn.localeCompare(left.builtOn)),
];

export const BENCHMARK_TASK = Object.freeze(benchmarkTask);
export const BENCHMARK_RUNS = Object.freeze(orderedRuns);
export const FEATURED_RUN = featuredRun;
