import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  assertNoSymlinkParents,
  materializeStaticDirectory,
  writeBytesIdempotently,
} from "./artifact.mjs";
import { assertCollectionInvariants } from "./collection-invariants.mjs";
import { ARTIFACT_VERCEL_CONFIG } from "./constants.mjs";
import { invariant, PublishingError } from "./errors.mjs";
import { runGit } from "./git.mjs";
import {
  assertExactKeys,
  assertInteger,
  assertPlainObject,
  assertString,
} from "./json.mjs";
import {
  assertArtifactManifestBytes,
  buildArtifactManifest,
  digestArtifactManifest,
  inspectStaticDist,
  serializeArtifactManifest,
} from "./static-dist.mjs";
import { serializePublicRegistry } from "./public-registry.mjs";
import {
  COMMIT_PATTERN,
  DIGEST_PATTERN,
  SUBMISSION_ID_PATTERN,
  validateSubmission,
} from "./submission.mjs";

const MINIMAL_VERCEL_CONFIG = `${JSON.stringify(ARTIFACT_VERCEL_CONFIG)}\n`;

export async function publishStagingTree({
  payloadDirectory,
  provenanceDirectory,
  worktreeDirectory,
  requireGitWorktree = true,
}) {
  const payloadRoot = path.resolve(payloadDirectory);
  const provenanceRoot = path.resolve(provenanceDirectory);
  const worktreeRoot = path.resolve(worktreeDirectory);
  if (!(await exists(payloadRoot))) {
    await assertRealDirectory(
      path.dirname(payloadRoot),
      "payload parent directory",
    );
    await mkdir(payloadRoot);
  }
  await assertRealDirectory(payloadRoot, "payload directory");
  await assertRealDirectory(provenanceRoot, "provenance directory");
  await assertRealDirectory(worktreeRoot, "artifact worktree");

  if (requireGitWorktree) {
    const topLevel = (
      await runGit(["rev-parse", "--show-toplevel"], { cwd: worktreeRoot })
    ).trim();
    invariant(
      (await realpath(topLevel)) === (await realpath(worktreeRoot)),
      "Artifact target must be the root of a Git worktree",
    );
  }

  for (const trustedDirectory of [
    "artifacts",
    "manifests",
    "registry",
    "audit",
  ]) {
    await assertOptionalRealDirectory(
      path.join(worktreeRoot, trustedDirectory),
    );
  }

  const { records, removals } = await readProvenance(provenanceRoot);
  const expectedPayloadFiles = new Set();
  const publishedRecords = [];

  for (const record of records) {
    const identity = deriveArtifactIdentity(record);
    const artifactSource = path.join(
      payloadRoot,
      ...identity.artifactDirectory.split("/"),
    );
    const manifestSource = path.join(
      payloadRoot,
      ...identity.manifestPath.split("/"),
    );
    const manifestBytes = await readRegularFile(
      manifestSource,
      `artifact manifest for ${record.id}`,
    );
    assertArtifactManifestBytes(
      manifestBytes,
      `artifact manifest for ${record.id}`,
    );
    invariant(
      digestArtifactManifest(manifestBytes) === record.artifact.manifestDigest,
      `Manifest digest mismatch for ${record.id}`,
    );
    const manifest = validateArtifactManifest(manifestBytes, record);
    const inspection = await inspectStaticDist(artifactSource);
    const rebuiltManifest = buildArtifactManifest(inspection);
    invariant(
      serializeArtifactManifest(rebuiltManifest).equals(manifestBytes),
      `Artifact bytes do not match trusted manifest for ${record.id}`,
    );

    expectedPayloadFiles.add(identity.manifestPath);
    for (const file of manifest.files) {
      expectedPayloadFiles.add(`${identity.artifactDirectory}/${file.path}`);
    }

    await enforceImmutableIdentity(worktreeRoot, record, identity);
    await materializeStaticDirectory(
      path.join(worktreeRoot, ...identity.artifactDirectory.split("/")),
      inspection.files,
    );
    await writeBytesIdempotently(
      path.join(worktreeRoot, ...identity.manifestPath.split("/")),
      manifestBytes,
    );

    const recordBytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
    const auditRecordPath = path.join(
      worktreeRoot,
      "audit",
      "records",
      record.id,
      record.source.commit,
      `${identity.digestHex}.json`,
    );
    await writeBytesIdempotently(auditRecordPath, recordBytes);
    await publishRegistryRecord(
      worktreeRoot,
      record,
      recordBytes,
      auditRecordPath,
    );
    publishedRecords.push(record);
  }

  const actualPayloadFiles = await listPayloadFiles(payloadRoot);
  invariant(
    sameStringSet(actualPayloadFiles, expectedPayloadFiles),
    "Payload contains missing, unreferenced, or unexpected files",
    {
      expected: [...expectedPayloadFiles].sort(),
      actual: [...actualPayloadFiles].sort(),
    },
  );

  for (const removal of removals.removed) {
    await applyRemoval(worktreeRoot, removals.head, removal);
  }

  await writeBytesIdempotently(
    path.join(worktreeRoot, "vercel.json"),
    Buffer.from(MINIMAL_VERCEL_CONFIG, "utf8"),
  );
  await rebuildPublicRegistry(worktreeRoot);
  return Object.freeze({
    published: Object.freeze(publishedRecords),
    removed: Object.freeze(removals.removed),
  });
}

function validatePublishedRecord(value, label) {
  const record = assertPlainObject(value, label);
  assertExactKeys(
    record,
    [
      "schemaVersion",
      "id",
      "title",
      "tagline",
      "description",
      "model",
      "builtOn",
      "features",
      "source",
      "lineage",
      "provenance",
      "licenses",
      "presentation",
      "artifact",
      "publication",
    ],
    [],
    label,
  );
  invariant(record.schemaVersion === 1, `${label}.schemaVersion must be 1`);
  const submission = validateSubmission({
    schemaVersion: 1,
    id: record.id,
    title: record.title,
    tagline: record.tagline,
    description: record.description,
    features: record.features,
    source: record.source,
    lineage: record.lineage,
    provenance: record.provenance,
    licenses: record.licenses,
    presentation: record.presentation,
  });
  invariant(
    record.model === submission.provenance.model,
    `${label}.model must match provenance.model`,
  );
  invariant(
    record.builtOn === submission.provenance.builtOn,
    `${label}.builtOn must match provenance.builtOn`,
  );

  const artifact = assertPlainObject(record.artifact, `${label}.artifact`);
  assertExactKeys(
    artifact,
    ["entryPath", "digest", "manifestDigest", "fileCount", "bytes"],
    [],
    `${label}.artifact`,
  );
  invariant(
    artifact.entryPath === "index.html",
    `${label}.artifact.entryPath must be index.html`,
  );
  assertDigest(artifact.digest, `${label}.artifact.digest`);
  assertDigest(artifact.manifestDigest, `${label}.artifact.manifestDigest`);
  assertInteger(artifact.fileCount, `${label}.artifact.fileCount`, {
    min: 1,
    max: 5_000,
  });
  assertInteger(artifact.bytes, `${label}.artifact.bytes`, {
    min: 1,
    max: 100 * 1024 * 1024,
  });

  const publication = assertPlainObject(
    record.publication,
    `${label}.publication`,
  );
  assertExactKeys(
    publication,
    ["contract", "submissionDigest", "build"],
    [],
    `${label}.publication`,
  );
  assertDigest(
    publication.submissionDigest,
    `${label}.publication.submissionDigest`,
  );
  const contract = assertPlainObject(
    publication.contract,
    `${label}.publication.contract`,
  );
  invariant(
    contract.node === "24.x" &&
      contract.pnpm === "11.7.0" &&
      contract.command === "pnpm run build:mirage" &&
      contract.output === "dist/index.html",
    `${label}.publication.contract is not the fixed Mirage contract`,
  );
  assertPlainObject(publication.build, `${label}.publication.build`);

  return Object.freeze({
    ...submission,
    model: submission.provenance.model,
    builtOn: submission.provenance.builtOn,
    artifact: Object.freeze({
      entryPath: artifact.entryPath,
      digest: artifact.digest,
      manifestDigest: artifact.manifestDigest,
      fileCount: artifact.fileCount,
      bytes: artifact.bytes,
    }),
    publication: Object.freeze(publication),
  });
}

function validateArtifactManifest(bytes, record) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new PublishingError(
      `Invalid artifact manifest for ${record.id}: ${error.message}`,
    );
  }
  const manifest = assertPlainObject(value, `manifest ${record.id}`);
  assertExactKeys(
    manifest,
    ["schemaVersion", "artifactDigest", "fileCount", "bytes", "files"],
    [],
    `manifest ${record.id}`,
  );
  invariant(
    manifest.schemaVersion === 1,
    "Artifact manifest schemaVersion must be 1",
  );
  invariant(
    manifest.artifactDigest === record.artifact.digest,
    `Artifact manifest digest identity mismatch for ${record.id}`,
  );
  invariant(
    manifest.fileCount === record.artifact.fileCount &&
      manifest.bytes === record.artifact.bytes,
    `Artifact manifest totals mismatch for ${record.id}`,
  );
  invariant(
    Array.isArray(manifest.files),
    "Artifact manifest files must be an array",
  );
  invariant(
    manifest.files.length === manifest.fileCount,
    "Artifact manifest fileCount is inconsistent",
  );

  let previousPath = null;
  let totalBytes = 0;
  const files = manifest.files.map((file, index) => {
    const label = `manifest ${record.id}.files[${index}]`;
    const entry = assertPlainObject(file, label);
    assertExactKeys(entry, ["path", "bytes", "sha256"], [], label);
    const filePath = assertString(entry.path, `${label}.path`, { max: 512 });
    invariant(
      isSafeManifestPath(filePath),
      `${label}.path must be a normalized relative path`,
    );
    if (previousPath !== null) {
      invariant(
        Buffer.from(previousPath).compare(Buffer.from(filePath)) < 0,
        "Artifact manifest files must be strictly UTF-8 lexicographically sorted",
      );
    }
    previousPath = filePath;
    const fileBytes = assertInteger(entry.bytes, `${label}.bytes`, {
      min: 0,
      max: 4 * 1024 * 1024,
    });
    totalBytes += fileBytes;
    const digest = assertDigest(entry.sha256, `${label}.sha256`);
    return Object.freeze({ path: filePath, bytes: fileBytes, sha256: digest });
  });
  invariant(
    totalBytes === manifest.bytes,
    "Artifact manifest byte total is inconsistent",
  );

  const validated = {
    schemaVersion: 1,
    artifactDigest: manifest.artifactDigest,
    fileCount: manifest.fileCount,
    bytes: manifest.bytes,
    files,
  };
  invariant(
    serializeArtifactManifest(validated).equals(bytes),
    "Artifact manifest bytes are not in the deterministic trusted encoding",
  );
  return Object.freeze(validated);
}

async function readProvenance(provenanceRoot) {
  const entries = await readdir(provenanceRoot, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const records = [];
  let removals = { schemaVersion: 1, head: "0".repeat(40), removed: [] };

  for (const entry of entries) {
    invariant(
      entry.isFile() && !entry.isSymbolicLink(),
      `Provenance contains a non-file entry: ${entry.name}`,
    );
    invariant(
      entry.name === "removals.json" ||
        /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(entry.name),
      `Unexpected provenance file: ${entry.name}`,
    );
    const bytes = await readRegularFile(
      path.join(provenanceRoot, entry.name),
      entry.name,
    );
    let value;
    try {
      value = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new PublishingError(`Invalid ${entry.name}: ${error.message}`);
    }
    if (entry.name === "removals.json") {
      removals = validateRemovals(value);
    } else {
      const record = validatePublishedRecord(value, entry.name);
      invariant(
        entry.name === `${record.id}.json`,
        `Registry candidate filename does not match ID: ${entry.name}`,
      );
      records.push(record);
    }
  }

  const ids = records.map((record) => record.id);
  invariant(
    new Set(ids).size === ids.length,
    "Duplicate registry candidate IDs",
  );
  invariant(
    records.every(
      (record) => !removals.removed.some((removal) => removal.id === record.id),
    ),
    "Provenance both publishes and removes the same ID",
  );
  return { records, removals };
}

function validateRemovals(value) {
  const document = assertPlainObject(value, "removals");
  assertExactKeys(
    document,
    ["schemaVersion", "head", "removed"],
    [],
    "removals",
  );
  invariant(document.schemaVersion === 1, "removals.schemaVersion must be 1");
  invariant(
    typeof document.head === "string" && COMMIT_PATTERN.test(document.head),
    "removals.head must be a 40-character lowercase commit",
  );
  invariant(
    Array.isArray(document.removed),
    "removals.removed must be an array",
  );
  const removed = document.removed.map((entry, index) => {
    const label = `removals.removed[${index}]`;
    const removal = assertPlainObject(entry, label);
    assertExactKeys(
      removal,
      ["id", "path", "source", "submissionDigest"],
      [],
      label,
    );
    const id = assertString(removal.id, `${label}.id`, { max: 80 });
    invariant(SUBMISSION_ID_PATTERN.test(id), `${label}.id is invalid`);
    invariant(
      removal.path === `submissions/${id}.json`,
      `${label}.path is invalid`,
    );
    const source = assertPlainObject(removal.source, `${label}.source`);
    invariant(
      typeof source.commit === "string" && COMMIT_PATTERN.test(source.commit),
      `${label}.source.commit is invalid`,
    );
    invariant(
      typeof source.repositoryUrl === "string" &&
        /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(source.repositoryUrl),
      `${label}.source.repositoryUrl is invalid`,
    );
    return Object.freeze({
      id,
      path: removal.path,
      source: Object.freeze({
        repositoryUrl: source.repositoryUrl,
        commit: source.commit,
      }),
      submissionDigest: assertDigest(
        removal.submissionDigest,
        `${label}.submissionDigest`,
      ),
    });
  });
  invariant(
    new Set(removed.map((entry) => entry.id)).size === removed.length,
    "removals contains duplicate IDs",
  );
  return Object.freeze({
    schemaVersion: 1,
    head: document.head,
    removed: Object.freeze(removed),
  });
}

function deriveArtifactIdentity(record) {
  const digestHex = record.artifact.digest.slice("sha256:".length);
  return Object.freeze({
    digestHex,
    artifactDirectory: `artifacts/${record.id}/${record.source.commit}/${digestHex}`,
    manifestPath: `manifests/${record.id}/${record.source.commit}/${digestHex}.json`,
  });
}

async function enforceImmutableIdentity(worktreeRoot, record, identity) {
  const idRoot = path.join(worktreeRoot, "artifacts", record.id);
  if (await exists(idRoot)) {
    const identities = await listArtifactIdentities(idRoot, record.id);
    invariant(
      identities.length === 1 &&
        identities[0] === `${record.source.commit}/${identity.digestHex}`,
      `Immutable ID ${record.id} already has a different commit or digest`,
    );
  }

  const auditRecordPath = path.join(
    worktreeRoot,
    "audit",
    "records",
    record.id,
    record.source.commit,
    `${identity.digestHex}.json`,
  );
  if (await exists(auditRecordPath)) {
    const archived = await readFile(auditRecordPath);
    const incoming = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
    invariant(
      archived.equals(incoming),
      `Immutable ID ${record.id} was previously published with different metadata`,
    );
  }
}

async function publishRegistryRecord(
  worktreeRoot,
  record,
  recordBytes,
  auditRecordPath,
) {
  const registryPath = path.join(worktreeRoot, "registry", `${record.id}.json`);
  if (await exists(registryPath)) {
    const existing = await readRegularFile(
      registryPath,
      `registry ${record.id}`,
    );
    invariant(
      existing.equals(recordBytes),
      `Refusing to overwrite divergent registry record for ${record.id}`,
    );
    return;
  }
  invariant(
    await exists(auditRecordPath),
    "Audit record must exist before publication",
  );
  await writeBytesIdempotently(registryPath, recordBytes);
}

async function applyRemoval(worktreeRoot, head, removal) {
  const registryPath = path.join(
    worktreeRoot,
    "registry",
    `${removal.id}.json`,
  );
  const auditPath = path.join(
    worktreeRoot,
    "audit",
    "removals",
    removal.id,
    `${head}.json`,
  );
  if (!(await exists(registryPath)) && (await exists(auditPath))) {
    const existing = JSON.parse(
      (
        await readRegularFile(auditPath, `removal audit ${removal.id}`)
      ).toString("utf8"),
    );
    invariant(
      existing.id === removal.id &&
        existing.removedAtCommit === head &&
        existing.source?.repositoryUrl === removal.source.repositoryUrl &&
        existing.source?.commit === removal.source.commit &&
        existing.submissionDigest === removal.submissionDigest,
      `Existing removal audit diverges for ${removal.id}`,
    );
    return;
  }

  let removedRecord = null;
  if (await exists(registryPath)) {
    const bytes = await readRegularFile(registryPath, `registry ${removal.id}`);
    let record;
    try {
      record = validatePublishedRecord(
        JSON.parse(bytes.toString("utf8")),
        removal.id,
      );
    } catch (error) {
      throw new PublishingError(
        `Cannot remove invalid registry record ${removal.id}: ${error.message}`,
      );
    }
    invariant(
      record.source.commit === removal.source.commit &&
        record.source.repositoryUrl === removal.source.repositoryUrl &&
        record.publication.submissionDigest === removal.submissionDigest,
      `Removal identity does not match published record ${removal.id}`,
    );
    removedRecord = {
      source: record.source,
      artifact: record.artifact,
      submissionDigest: record.publication.submissionDigest,
    };
    await rm(registryPath);
  }

  const removalAudit = {
    schemaVersion: 1,
    id: removal.id,
    source: removal.source,
    submissionDigest: removal.submissionDigest,
    removedAtCommit: head,
    publishedIdentity: removedRecord,
  };
  await writeBytesIdempotently(
    auditPath,
    Buffer.from(`${JSON.stringify(removalAudit, null, 2)}\n`),
  );
}

async function rebuildPublicRegistry(worktreeRoot) {
  const registryRoot = path.join(worktreeRoot, "registry");
  await assertNoSymlinkParents(path.join(registryRoot, "placeholder"));
  await mkdir(registryRoot, { recursive: true });
  const entries = await readdir(registryRoot, { withFileTypes: true });
  const records = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    invariant(
      entry.isFile() &&
        !entry.isSymbolicLink() &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(entry.name),
      `Registry contains unexpected entry: ${entry.name}`,
    );
    const bytes = await readRegularFile(
      path.join(registryRoot, entry.name),
      entry.name,
    );
    const record = validatePublishedRecord(
      JSON.parse(bytes.toString("utf8")),
      entry.name,
    );
    records.push(record);
  }
  assertCollectionInvariants(records, { label: "public registry" });
  const { bytes: registryBytes } = serializePublicRegistry(records);
  const registryPath = path.join(worktreeRoot, "registry.json");
  if (await exists(registryPath)) {
    const existing = await readRegularFile(registryPath, "public registry");
    if (existing.equals(registryBytes)) return;
    await rm(registryPath);
  }
  await writeBytesIdempotently(registryPath, registryBytes);
}

async function listPayloadFiles(root) {
  const files = new Set();
  async function walk(directory, relativeDirectory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      invariant(
        !entry.isSymbolicLink(),
        `Payload contains a symbolic link: ${entry.name}`,
      );
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(directory, entry.name);
      const stats = await lstat(absolutePath);
      if (stats.isDirectory()) {
        await walk(absolutePath, relativePath);
      } else {
        invariant(
          stats.isFile() && stats.nlink === 1,
          `Payload contains a special or hard-linked file: ${relativePath}`,
        );
        files.add(relativePath);
      }
    }
  }
  await walk(root, "");
  return files;
}

async function listArtifactIdentities(idRoot, id) {
  const commits = await readdir(idRoot, { withFileTypes: true });
  const identities = [];
  for (const commitEntry of commits) {
    invariant(
      commitEntry.isDirectory() && COMMIT_PATTERN.test(commitEntry.name),
      `Artifact storage for ${id} has an invalid commit directory`,
    );
    const commitRoot = path.join(idRoot, commitEntry.name);
    const digests = await readdir(commitRoot, { withFileTypes: true });
    for (const digestEntry of digests) {
      invariant(
        digestEntry.isDirectory() && /^[0-9a-f]{64}$/.test(digestEntry.name),
        `Artifact storage for ${id} has an invalid digest directory`,
      );
      identities.push(`${commitEntry.name}/${digestEntry.name}`);
    }
  }
  return identities.sort();
}

async function readRegularFile(filePath, label) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch (error) {
    throw new PublishingError(`Missing ${label}: ${error.message}`);
  }
  invariant(
    stats.isFile() && !stats.isSymbolicLink() && stats.nlink === 1,
    `${label} must be a regular non-linked file`,
  );
  return readFile(filePath);
}

async function assertRealDirectory(directory, label) {
  let stats;
  try {
    stats = await lstat(directory);
  } catch (error) {
    throw new PublishingError(`Missing ${label}: ${error.message}`);
  }
  invariant(
    stats.isDirectory() && !stats.isSymbolicLink(),
    `${label} must be a real directory`,
  );
}

async function assertOptionalRealDirectory(directory) {
  if (!(await exists(directory))) return;
  await assertRealDirectory(directory, directory);
}

function isSafeManifestPath(value) {
  return (
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    path.posix.normalize(value) === value &&
    !value.split("/").some((part) => part === "." || part === "..")
  );
}

function assertDigest(value, label) {
  invariant(
    typeof value === "string" && DIGEST_PATTERN.test(value),
    `${label} must be sha256 followed by 64 lowercase hexadecimal characters`,
  );
  return value;
}

function sameStringSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

async function exists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
