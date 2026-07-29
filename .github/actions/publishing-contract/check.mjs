import { readFile } from "node:fs/promises";

const workflowPath =
  process.argv[2] ?? ".github/workflows/publish-submissions.yml";
const workflow = await readFile(workflowPath, "utf8");

const failures = [];
const requireMatch = (pattern, message) => {
  if (!pattern.test(workflow)) failures.push(message);
};
const forbidMatch = (pattern, message) => {
  if (pattern.test(workflow)) failures.push(message);
};

forbidMatch(
  /^\s*(pull_request_target|workflow_run):/m,
  "Privileged pull-request triggers are forbidden.",
);
forbidMatch(
  /(?:\bsecrets\.|\bid-token\s*:|\bpull_request_target\b|\bworkflow_run\b)/,
  "The workflow must not reference repository secrets, OIDC, or privileged triggers.",
);
requireMatch(
  /MIRAGE_BUILDER_IMAGE:[\s\S]*node:24\.14\.0-bookworm@sha256:[a-f0-9]{64}/,
  "The Node 24 builder must be pinned by an immutable Docker digest.",
);
requireMatch(
  /concurrency:[\s\S]*cancel-in-progress:\s*false/,
  "Publication runs must be serialized without cancelling queued main commits.",
);
requireMatch(
  /preflight:\s*\n\s+name:\s*submission-preflight[\s\S]*?permissions:\s*\n\s+contents:\s*read[\s\S]*?ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}[\s\S]*?build-submissions\.mjs/,
  "The pull-request preflight must be read-only and check out the exact planned head commit.",
);
requireMatch(
  /stage:[\s\S]*?permissions:\s*\n\s+contents:\s*read[\s\S]*?build-submissions\.mjs/,
  "The protected-main staging job must have read-only contents permission.",
);
requireMatch(
  /publish:[\s\S]*?permissions:\s*\n\s+contents:\s*write/,
  "Only the publisher may receive contents: write.",
);
requireMatch(
  /publish-artifacts\.mjs[\s\S]*--branch mirage-artifacts[\s\S]*--disable-vercel-deployments/,
  "The publisher must use the trusted artifact-branch CLI and emit the Vercel deployment block.",
);
requireMatch(
  /build-submissions\.mjs[\s\S]*--image "\$MIRAGE_BUILDER_IMAGE"/,
  "The host orchestrator must receive the immutable candidate-builder image.",
);
requireMatch(
  /actions\/upload-artifact@[a-f0-9]{40}/,
  "The artifact uploader must be pinned by a full commit SHA.",
);
requireMatch(
  /actions\/download-artifact@[a-f0-9]{40}[\s\S]*digest-mismatch:\s*error/,
  "The pinned artifact downloader must fail closed on a digest mismatch.",
);
requireMatch(
  /WORKFLOW_ARTIFACT_DIGEST:\s*sha256:\$\{\{\s*needs\.stage\.outputs\.artifact-digest\s*\}\}/,
  "The publisher must normalize upload-artifact's raw digest as sha256:<hex>.",
);

const pullRequestStart = workflow.indexOf("\n  pull_request:");
const pushStart = workflow.indexOf("\n  push:");
if (
  pullRequestStart === -1 ||
  pushStart === -1 ||
  workflow.slice(pullRequestStart, pushStart).includes("paths:")
) {
  failures.push(
    "The required pull-request preflight must report on every pull request.",
  );
}

for (const line of workflow.split("\n")) {
  const match = line.match(/^\s*uses:\s*(\S+)/);
  if (!match || match[1].startsWith("./")) continue;
  if (!/@[a-f0-9]{40}(?:\s|$)/.test(match[1])) {
    failures.push(`Action is not pinned by a full commit SHA: ${match[1]}`);
  }
}

const publishStart = workflow.indexOf("\n  publish:\n");
if (publishStart === -1) {
  failures.push("The workflow is missing its publish job.");
} else {
  const unprivilegedJobs = workflow.slice(0, publishStart);
  const publishJob = workflow.slice(publishStart);
  if (/\b(?:GH_TOKEN|GITHUB_TOKEN)\b/.test(unprivilegedJobs)) {
    failures.push(
      "The preflight and staging jobs must not reference an Actions token.",
    );
  }
  for (const forbidden of [
    "build-submissions.mjs",
    "validate-submissions.mjs",
    "pnpm ",
    "npm ",
    "docker ",
  ]) {
    if (publishJob.includes(forbidden)) {
      failures.push(
        `The write-enabled publisher must not invoke ${forbidden.trim()}.`,
      );
    }
  }
}

const timeoutCount = workflow.match(/timeout-minutes:/g)?.length ?? 0;
if (timeoutCount !== 3) {
  failures.push("Every publishing job must set an explicit timeout.");
}

if (failures.length > 0) {
  for (const failure of failures)
    console.error(`publishing contract: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Publishing control-plane contract passed for ${workflowPath}.`);
}
