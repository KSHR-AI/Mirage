import path from "node:path";
import { SUBMISSION_SCHEMA_VERSION } from "./constants.mjs";
import { invariant } from "./errors.mjs";
import {
  assertExactKeys,
  assertInteger,
  assertNullableString,
  assertPlainObject,
  assertString,
  assertStringArray,
} from "./json.mjs";

export const SUBMISSION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
export const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const GITHUB_REPOSITORY_PATTERN =
  /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})$/;

const SPDX_PATTERN =
  /^(?:[A-Za-z0-9][A-Za-z0-9.+-]*)(?:\s+(?:AND|OR|WITH)\s+(?:[A-Za-z0-9][A-Za-z0-9.+-]*))*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_RELATIVE_PATH_PATTERN =
  /^(?!\.)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\\)[^\u0000-\u001f\u007f]+$/;

export function validateSubmission(value, { filePath } = {}) {
  const submission = assertPlainObject(value, "submission");
  assertExactKeys(
    submission,
    [
      "schemaVersion",
      "id",
      "title",
      "tagline",
      "description",
      "features",
      "source",
      "deployment",
      "lineage",
      "provenance",
      "licenses",
      "presentation",
    ],
    [],
    "submission",
  );
  invariant(
    submission.schemaVersion === SUBMISSION_SCHEMA_VERSION,
    `submission.schemaVersion must be ${SUBMISSION_SCHEMA_VERSION}`,
  );

  const id = assertString(submission.id, "submission.id", { max: 80 });
  invariant(
    SUBMISSION_ID_PATTERN.test(id),
    "submission.id must be a lowercase kebab-case immutable identifier",
  );

  if (filePath) {
    const normalizedPath = filePath.split(path.sep).join("/");
    invariant(
      normalizedPath === `submissions/${id}.json`,
      `Submission "${id}" must be stored at submissions/${id}.json`,
    );
  }

  return Object.freeze({
    schemaVersion: SUBMISSION_SCHEMA_VERSION,
    id,
    title: assertString(submission.title, "submission.title", { max: 120 }),
    tagline: assertString(submission.tagline, "submission.tagline", {
      max: 180,
    }),
    description: assertString(
      submission.description,
      "submission.description",
      {
        max: 2_000,
      },
    ),
    features: Object.freeze(
      assertStringArray(submission.features, "submission.features", {
        minItems: 1,
        maxItems: 30,
        itemMax: 120,
      }),
    ),
    source: validateSource(submission.source),
    deployment: validateDeployment(submission.deployment),
    lineage: validateLineage(submission.lineage, id),
    provenance: validateProvenance(submission.provenance),
    licenses: validateLicenses(submission.licenses),
    presentation: validatePresentation(submission.presentation),
  });
}

function validateSource(value, label = "submission.source") {
  const source = assertPlainObject(value, label);
  assertExactKeys(source, ["repositoryUrl", "commit"], [], label);

  const repositoryUrl = assertString(
    source.repositoryUrl,
    `${label}.repositoryUrl`,
    { max: 180 },
  );
  const repositoryMatch = repositoryUrl.match(GITHUB_REPOSITORY_PATTERN);
  invariant(
    repositoryMatch,
    `${label}.repositoryUrl must be exactly https://github.com/OWNER/REPO`,
  );
  invariant(
    !repositoryMatch[2].endsWith(".git") &&
      repositoryMatch[2] !== "." &&
      repositoryMatch[2] !== "..",
    `${label}.repositoryUrl must identify a repository, not a Git transport URL`,
  );

  const commit = assertString(source.commit, `${label}.commit`, {
    min: 40,
    max: 40,
  });
  invariant(
    COMMIT_PATTERN.test(commit),
    `${label}.commit must be an exact 40-character lowercase Git SHA`,
  );
  return Object.freeze({ repositoryUrl, commit });
}

function validateDeployment(value) {
  const label = "submission.deployment";
  const deployment = assertPlainObject(value, label);
  assertExactKeys(deployment, ["url", "provider"], [], label);
  return Object.freeze({
    url: validatePublicDeploymentUrl(deployment.url, `${label}.url`),
    provider: assertString(deployment.provider, `${label}.provider`, {
      max: 100,
    }),
  });
}

function validateLineage(value, id) {
  const lineage = assertPlainObject(value, "submission.lineage");
  const kind = assertString(lineage.kind, "submission.lineage.kind", {
    max: 20,
  });

  if (kind === "independent") {
    assertExactKeys(lineage, ["kind", "seedDigest"], [], "submission.lineage");
    const seedDigest = assertString(
      lineage.seedDigest,
      "submission.lineage.seedDigest",
      { min: 71, max: 71 },
    );
    invariant(
      DIGEST_PATTERN.test(seedDigest),
      "submission.lineage.seedDigest must be sha256 followed by 64 lowercase hexadecimal characters",
    );
    return Object.freeze({ kind, seedDigest });
  }

  if (kind === "derived") {
    assertExactKeys(
      lineage,
      ["kind", "parentId", "parentSource"],
      [],
      "submission.lineage",
    );
    const parentId = assertString(
      lineage.parentId,
      "submission.lineage.parentId",
      { max: 80 },
    );
    invariant(
      SUBMISSION_ID_PATTERN.test(parentId) && parentId !== id,
      "submission.lineage.parentId must be a different valid Mirage game ID",
    );
    const parentSource = validateSource(
      lineage.parentSource,
      "submission.lineage.parentSource",
    );
    return Object.freeze({ kind, parentId, parentSource });
  }

  invariant(
    kind === "unverified",
    'submission.lineage.kind must be "independent", "derived", or "unverified"',
  );
  assertExactKeys(lineage, ["kind", "note"], [], "submission.lineage");
  const note = assertString(lineage.note, "submission.lineage.note", {
    min: 10,
    max: 2_000,
  });
  return Object.freeze({ kind, note });
}

function validateProvenance(value) {
  const provenance = assertPlainObject(value, "submission.provenance");
  assertExactKeys(
    provenance,
    [
      "builtOn",
      "model",
      "modelSnapshot",
      "reasoning",
      "harness",
      "tools",
      "agentCount",
      "subagentCount",
      "humanInterventions",
      "prompt",
    ],
    [],
    "submission.provenance",
  );

  const builtOn = assertString(
    provenance.builtOn,
    "submission.provenance.builtOn",
    { min: 10, max: 10 },
  );
  invariant(
    isIsoDate(builtOn),
    "submission.provenance.builtOn must be a real YYYY-MM-DD date",
  );

  return Object.freeze({
    builtOn,
    model: assertString(provenance.model, "submission.provenance.model", {
      max: 200,
    }),
    modelSnapshot: assertNullableString(
      provenance.modelSnapshot,
      "submission.provenance.modelSnapshot",
      { max: 200 },
    ),
    reasoning: assertNullableString(
      provenance.reasoning,
      "submission.provenance.reasoning",
      { max: 100 },
    ),
    harness: assertString(provenance.harness, "submission.provenance.harness", {
      max: 200,
    }),
    tools: Object.freeze(
      assertStringArray(provenance.tools, "submission.provenance.tools", {
        minItems: 1,
        maxItems: 50,
        itemMax: 100,
      }),
    ),
    agentCount: assertInteger(
      provenance.agentCount,
      "submission.provenance.agentCount",
      { min: 1, max: 1_000, nullable: true },
    ),
    subagentCount: assertInteger(
      provenance.subagentCount,
      "submission.provenance.subagentCount",
      { min: 0, max: 1_000, nullable: true },
    ),
    humanInterventions: assertInteger(
      provenance.humanInterventions,
      "submission.provenance.humanInterventions",
      { min: 0, max: 1_000_000, nullable: true },
    ),
    prompt: validatePrompt(provenance.prompt),
  });
}

function validatePrompt(value) {
  const prompt = assertPlainObject(value, "submission.provenance.prompt");
  assertExactKeys(
    prompt,
    ["status", "text", "note"],
    [],
    "submission.provenance.prompt",
  );
  const status = assertString(
    prompt.status,
    "submission.provenance.prompt.status",
    { max: 20 },
  );
  invariant(
    ["published", "partial", "not-recorded"].includes(status),
    "submission.provenance.prompt.status is invalid",
  );
  const text = validateNullablePromptText(prompt.text);
  const note = assertString(prompt.note, "submission.provenance.prompt.note", {
    max: 2_000,
  });
  invariant(
    status !== "published" || text !== null,
    "A published prompt must include submission.provenance.prompt.text",
  );
  invariant(
    status === "published" || note.length >= 10,
    "A missing or partial prompt needs an explanatory note",
  );
  return Object.freeze({ status, text, note });
}

function validateNullablePromptText(value) {
  if (value === null) return null;
  const label = "submission.provenance.prompt.text";
  invariant(typeof value === "string", `${label} must be a string or null`);
  invariant(
    value.length >= 1 && value.length <= 200_000,
    `${label} must contain 1-200000 characters`,
  );
  invariant(value.trim().length > 0, `${label} must not be all whitespace`);
  invariant(
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    `${label} has unsupported control characters`,
  );
  return value;
}

function validateLicenses(value) {
  const licenses = assertPlainObject(value, "submission.licenses");
  assertExactKeys(
    licenses,
    ["code", "assetStatement", "assets"],
    [],
    "submission.licenses",
  );
  const code = validateSpdx(licenses.code, "submission.licenses.code");
  const assetStatement = assertString(
    licenses.assetStatement,
    "submission.licenses.assetStatement",
    { min: 10, max: 4_000 },
  );
  invariant(
    Array.isArray(licenses.assets),
    "submission.licenses.assets must be an array",
  );
  invariant(
    licenses.assets.length <= 1_000,
    "submission.licenses.assets may contain at most 1000 records",
  );
  const assets = licenses.assets.map((asset, index) =>
    validateAssetLicense(asset, index),
  );
  const names = assets.map((asset) => asset.name.toLowerCase());
  invariant(
    new Set(names).size === names.length,
    "submission.licenses.assets contains duplicate names",
  );
  return Object.freeze({
    code,
    assetStatement,
    assets: Object.freeze(assets),
  });
}

function validateAssetLicense(value, index) {
  const label = `submission.licenses.assets[${index}]`;
  const asset = assertPlainObject(value, label);
  assertExactKeys(
    asset,
    ["name", "creator", "license", "sourceUrl", "attribution"],
    [],
    label,
  );
  return Object.freeze({
    name: assertString(asset.name, `${label}.name`, { max: 300 }),
    creator: assertString(asset.creator, `${label}.creator`, { max: 300 }),
    license: validateSpdx(asset.license, `${label}.license`),
    sourceUrl: validateNullableHttpsUrl(asset.sourceUrl, `${label}.sourceUrl`),
    attribution: assertString(asset.attribution, `${label}.attribution`, {
      max: 2_000,
    }),
  });
}

function validatePresentation(value) {
  const presentation = assertPlainObject(value, "submission.presentation");
  assertExactKeys(
    presentation,
    ["coverPath", "coverAlt", "controls", "limitations", "protocolVersion"],
    [],
    "submission.presentation",
  );
  const protocolVersion = assertInteger(
    presentation.protocolVersion,
    "submission.presentation.protocolVersion",
    { min: 1, max: 1 },
  );
  return Object.freeze({
    coverPath: validateCoverPath(presentation.coverPath),
    coverAlt: assertString(
      presentation.coverAlt,
      "submission.presentation.coverAlt",
      { min: 5, max: 500 },
    ),
    controls: Object.freeze(
      assertStringArray(
        presentation.controls,
        "submission.presentation.controls",
        { minItems: 1, maxItems: 50, itemMax: 200 },
      ),
    ),
    limitations: Object.freeze(
      assertStringArray(
        presentation.limitations,
        "submission.presentation.limitations",
        { minItems: 1, maxItems: 50, itemMax: 500 },
      ),
    ),
    protocolVersion,
  });
}

function validateCoverPath(value) {
  const relativePath = assertString(
    value,
    "submission.presentation.coverPath",
    { max: 300 },
  );
  invariant(
    SAFE_RELATIVE_PATH_PATTERN.test(relativePath) &&
      !relativePath.startsWith("/") &&
      path.posix.normalize(relativePath) === relativePath,
    "submission.presentation.coverPath must be a normalized relative deployment path",
  );
  return relativePath;
}

function validateSpdx(value, label) {
  const expression = assertString(value, label, { max: 200 });
  invariant(
    SPDX_PATTERN.test(expression),
    `${label} must be a simple SPDX license expression`,
  );
  return expression;
}

function validateNullableHttpsUrl(value, label) {
  if (value === null) return null;
  const source = assertString(value, label, { max: 2_000 });
  let url;
  try {
    url = new URL(source);
  } catch {
    invariant(false, `${label} must be null or an HTTPS URL`);
  }
  invariant(
    url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname.length > 0,
    `${label} must be null or an HTTPS URL without credentials`,
  );
  return source;
}

function validatePublicDeploymentUrl(value, label) {
  const source = assertString(value, label, { max: 2_000 });
  let url;
  try {
    url = new URL(source);
  } catch {
    invariant(false, `${label} must be a public HTTPS URL`);
  }
  invariant(
    url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.hostname.includes(".") &&
      url.hostname !== "localhost" &&
      !url.hostname.endsWith(".localhost") &&
      !/^\d+(?:\.\d+){3}$/.test(url.hostname),
    `${label} must be an uncredentialed public HTTPS URL without a query or fragment`,
  );
  return url.toString();
}

function isIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
  );
}
