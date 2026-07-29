import path from "node:path";
import { assertCollectionInvariants } from "./collection-invariants.mjs";
import { PLAN_SCHEMA_VERSION } from "./constants.mjs";
import { invariant, PublishingError } from "./errors.mjs";
import { readGitFile, resolveCommit, runGit } from "./git.mjs";
import {
  assertExactKeys,
  assertPlainObject,
  assertString,
  sha256,
} from "./json.mjs";
import {
  COMMIT_PATTERN,
  DIGEST_PATTERN,
  SUBMISSION_ID_PATTERN,
  validateSubmission,
} from "./submission.mjs";
import { serializePublicRegistry } from "./public-registry.mjs";

export async function createValidationPlan({
  mode,
  base,
  head,
  cwd = process.cwd(),
}) {
  invariant(
    mode === "all" || mode === "changed",
    "Plan mode must be all or changed",
  );
  const resolvedHead = await resolveCommit(head ?? "HEAD", cwd);

  let additions;
  let removed;
  let activeSubmissions;
  let resolvedBase = null;
  if (mode === "all") {
    invariant(base === undefined, "--base is only valid with --mode changed");
    activeSubmissions = await loadAllSubmissions(resolvedHead, cwd);
    additions = activeSubmissions;
    removed = [];
  } else {
    invariant(base, "--base is required with --mode changed");
    invariant(head, "--head is required with --mode changed");
    resolvedBase = await resolveCommit(base, cwd);
    ({ additions, removed } = await loadChangedSubmissions(
      resolvedBase,
      resolvedHead,
      cwd,
    ));
    activeSubmissions = await loadAllSubmissions(resolvedHead, cwd);
  }

  assertCollectionInvariants(activeSubmissions, {
    label: "active submissions",
  });
  serializePublicRegistry(activeSubmissions, { placeholderArtifacts: true });
  validatePlanIdentities(additions, removed);
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    mode,
    base: resolvedBase,
    head: resolvedHead,
    submissions: additions.sort((left, right) =>
      left.submission.id.localeCompare(right.submission.id),
    ),
    removed: removed.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function validateBuildPlan(value) {
  const plan = assertPlainObject(value, "build plan");
  assertExactKeys(
    plan,
    ["schemaVersion", "mode", "base", "head", "submissions", "removed"],
    [],
    "build plan",
  );
  invariant(
    plan.schemaVersion === PLAN_SCHEMA_VERSION,
    `build plan schemaVersion must be ${PLAN_SCHEMA_VERSION}`,
  );
  invariant(
    plan.mode === "all" || plan.mode === "changed",
    "build plan mode must be all or changed",
  );
  if (plan.mode === "changed") {
    assertCommit(plan.base, "build plan base");
  } else {
    invariant(plan.base === null, "all-mode build plan base must be null");
  }
  const head = assertCommit(plan.head, "build plan head");
  invariant(
    Array.isArray(plan.submissions),
    "build plan submissions must be an array",
  );
  invariant(Array.isArray(plan.removed), "build plan removed must be an array");

  const submissions = plan.submissions.map((entry, index) =>
    validatePlanSubmission(entry, index),
  );
  const removed = plan.removed.map((entry, index) =>
    validateRemovedSubmission(entry, index),
  );
  validatePlanIdentities(submissions, removed);
  return Object.freeze({
    schemaVersion: PLAN_SCHEMA_VERSION,
    mode: plan.mode,
    base: plan.base,
    head,
    submissions: Object.freeze(submissions),
    removed: Object.freeze(removed),
  });
}

async function loadAllSubmissions(commit, cwd) {
  const output = await runGit(
    ["ls-tree", "-r", "--name-only", "-z", commit, "--", "submissions"],
    { cwd, encoding: "buffer" },
  );
  const paths = output
    .toString("utf8")
    .split("\0")
    .filter((filePath) => filePath.endsWith(".json"))
    .sort();
  return Promise.all(
    paths.map((filePath) => loadSubmission(commit, filePath, cwd)),
  );
}

async function loadChangedSubmissions(base, head, cwd) {
  const output = await runGit(
    [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      base,
      head,
      "--",
      "submissions",
    ],
    { cwd, encoding: "buffer" },
  );
  const fields = output.toString("utf8").split("\0");
  const additions = [];
  const removed = [];

  for (let index = 0; index < fields.length - 1;) {
    const status = fields[index++];
    if (!status) continue;
    const firstPath = fields[index++];
    const paths =
      status.startsWith("R") || status.startsWith("C")
        ? [firstPath, fields[index++]]
        : [firstPath];
    const jsonPaths = paths.filter((filePath) => filePath.endsWith(".json"));
    if (jsonPaths.length === 0) continue;

    if (status === "A") {
      additions.push(await loadSubmission(head, firstPath, cwd));
    } else if (status === "D") {
      const previous = await loadSubmission(base, firstPath, cwd);
      removed.push({
        id: previous.submission.id,
        path: previous.path,
        source: previous.submission.source,
        submissionDigest: previous.submissionDigest,
      });
    } else {
      throw new PublishingError(
        `Submission records are immutable; ${status} is not allowed for ${jsonPaths.join(", ")}`,
      );
    }
  }

  return { additions, removed };
}

async function loadSubmission(commit, filePath, cwd) {
  assertSubmissionPath(filePath);
  const source = await readGitFile(commit, filePath, cwd);
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new PublishingError(`Invalid JSON in ${filePath}: ${error.message}`);
  }
  const submission = validateSubmission(value, { filePath });
  return {
    path: filePath,
    submissionDigest: `sha256:${sha256(source)}`,
    submission,
  };
}

function validatePlanSubmission(value, index) {
  const label = `build plan submissions[${index}]`;
  const entry = assertPlainObject(value, label);
  assertExactKeys(entry, ["path", "submissionDigest", "submission"], [], label);
  const filePath = assertString(entry.path, `${label}.path`, { max: 200 });
  assertSubmissionPath(filePath);
  const submissionDigest = assertDigest(
    entry.submissionDigest,
    `${label}.submissionDigest`,
  );
  return Object.freeze({
    path: filePath,
    submissionDigest,
    submission: validateSubmission(entry.submission, { filePath }),
  });
}

function validateRemovedSubmission(value, index) {
  const label = `build plan removed[${index}]`;
  const entry = assertPlainObject(value, label);
  assertExactKeys(
    entry,
    ["id", "path", "source", "submissionDigest"],
    [],
    label,
  );
  const id = assertString(entry.id, `${label}.id`, { max: 80 });
  invariant(SUBMISSION_ID_PATTERN.test(id), `${label}.id is invalid`);
  const filePath = assertString(entry.path, `${label}.path`, { max: 200 });
  invariant(filePath === `submissions/${id}.json`, `${label}.path is invalid`);
  const source = assertPlainObject(entry.source, `${label}.source`);
  assertExactKeys(source, ["repositoryUrl", "commit"], [], `${label}.source`);
  invariant(
    typeof source.repositoryUrl === "string" &&
      /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(source.repositoryUrl),
    `${label}.source.repositoryUrl is invalid`,
  );
  assertCommit(source.commit, `${label}.source.commit`);
  return Object.freeze({
    id,
    path: filePath,
    source: Object.freeze({
      repositoryUrl: source.repositoryUrl,
      commit: source.commit,
    }),
    submissionDigest: assertDigest(
      entry.submissionDigest,
      `${label}.submissionDigest`,
    ),
  });
}

function validatePlanIdentities(submissions, removed) {
  const ids = new Set();
  const sources = new Set();
  for (const entry of submissions) {
    const { id, source } = entry.submission;
    invariant(!ids.has(id), `Duplicate submission ID in plan: ${id}`);
    ids.add(id);
    const sourceIdentity =
      `${source.repositoryUrl}@${source.commit}`.toLowerCase();
    invariant(
      !sources.has(sourceIdentity),
      `Duplicate source revision in plan: ${source.repositoryUrl}@${source.commit}`,
    );
    sources.add(sourceIdentity);
  }
  for (const entry of removed) {
    invariant(
      !ids.has(entry.id),
      `Plan both publishes and removes ID: ${entry.id}`,
    );
    invariant(
      !ids.has(`removed:${entry.id}`),
      `Duplicate removed ID: ${entry.id}`,
    );
    ids.add(`removed:${entry.id}`);
  }
}

function assertSubmissionPath(filePath) {
  invariant(
    typeof filePath === "string" &&
      filePath === filePath.split(path.sep).join("/") &&
      /^submissions\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(filePath),
    `Invalid submission path: ${filePath}`,
  );
}

function assertCommit(value, label) {
  invariant(
    typeof value === "string" && COMMIT_PATTERN.test(value),
    `${label} must be a 40-character lowercase SHA`,
  );
  return value;
}

function assertDigest(value, label) {
  invariant(
    typeof value === "string" && DIGEST_PATTERN.test(value),
    `${label} must be sha256 followed by 64 lowercase hexadecimal characters`,
  );
  return value;
}
