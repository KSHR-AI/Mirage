import { execFile } from "node:child_process";
import {
  chown,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { stageArtifact, writeBytesIdempotently } from "./artifact.mjs";
import {
  BUILD_COMMAND,
  DEFAULT_BUILDER_IMAGE,
  DOCKER_LIMITS,
  INSTALL_COMMAND,
  REQUIRED_NODE_MAJOR,
  REQUIRED_PNPM_VERSION,
} from "./constants.mjs";
import { invariant, PublishingError } from "./errors.mjs";
import { resolveCommit, runGit } from "./git.mjs";
import { canonicalJson, sha256 } from "./json.mjs";
import { validateBuildPlan } from "./plan.mjs";
import { inspectStaticDist } from "./static-dist.mjs";
import { validateSubmission } from "./submission.mjs";

const execFileAsync = promisify(execFile);
const PINNED_IMAGE_PATTERN = /@sha256:[0-9a-f]{64}$/;

export async function buildValidationPlan({
  plan: planValue,
  outputDirectory,
  provenanceDirectory,
  cwd = process.cwd(),
  sourceDirectory,
  builderImage = DEFAULT_BUILDER_IMAGE,
  testMode = false,
}) {
  const plan = validateBuildPlan(planValue);
  const resolvedOutput = path.resolve(outputDirectory);
  const resolvedProvenance = path.resolve(provenanceDirectory);
  assertSeparateDirectories(resolvedOutput, resolvedProvenance);
  await mkdir(resolvedOutput, { recursive: true });
  await mkdir(resolvedProvenance, { recursive: true });

  if (sourceDirectory) {
    invariant(
      testMode,
      "--source-dir is test-only and requires MIRAGE_PUBLISH_TEST_MODE=1",
    );
  } else {
    invariant(
      Number(process.versions.node.split(".")[0]) === REQUIRED_NODE_MAJOR,
      `Production publishing requires Node ${REQUIRED_NODE_MAJOR}`,
    );
    invariant(
      PINNED_IMAGE_PATTERN.test(builderImage),
      "Builder image must be pinned by a lowercase sha256 digest",
    );
    const checkoutHead = await resolveCommit("HEAD", cwd);
    invariant(
      checkoutHead === plan.head,
      `Build plan head ${plan.head} does not match checkout ${checkoutHead}`,
    );
  }

  const published = [];
  for (const entry of plan.submissions) {
    await verifySubmissionEntry(entry, cwd);
    const localSource = sourceDirectory
      ? resolveTestSourceDirectory(
          sourceDirectory,
          entry.submission.id,
          plan.submissions.length,
        )
      : null;
    const result = localSource
      ? await buildFromTestSource({
          entry,
          sourceDirectory: localSource,
          outputDirectory: resolvedOutput,
          provenanceDirectory: resolvedProvenance,
        })
      : await buildFromPublicSource({
          entry,
          outputDirectory: resolvedOutput,
          provenanceDirectory: resolvedProvenance,
          builderImage,
        });
    published.push(result.record);
  }

  const removals = {
    schemaVersion: 1,
    head: plan.head,
    removed: plan.removed,
  };
  await writeBytesIdempotently(
    path.join(resolvedProvenance, "removals.json"),
    Buffer.from(`${JSON.stringify(removals, null, 2)}\n`, "utf8"),
  );
  return Object.freeze({ plan, published: Object.freeze(published), removals });
}

async function buildFromTestSource({
  entry,
  sourceDirectory,
  outputDirectory,
  provenanceDirectory,
}) {
  const distDirectory = path.join(sourceDirectory, "dist");
  const inspection = await inspectStaticDist(distDirectory);
  const build = Object.freeze({
    mode: "test-only-local-source",
    builderImage: null,
    sourceCommit: entry.submission.source.commit,
    installNetwork: null,
    buildNetwork: null,
    installLogDigest: null,
    buildLogDigest: null,
  });
  return stageArtifact({
    inspection,
    submission: entry.submission,
    outputDirectory,
    provenanceDirectory,
    submissionDigest: entry.submissionDigest,
    build,
  });
}

async function buildFromPublicSource({
  entry,
  outputDirectory,
  provenanceDirectory,
  builderImage,
}) {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "mirage-publisher-"),
  );
  const sourceDirectory = path.join(temporaryRoot, "source");
  const homeDirectory = path.join(temporaryRoot, "home");
  const storeDirectory = path.join(temporaryRoot, "pnpm-store");

  try {
    await mkdir(sourceDirectory, { mode: 0o755 });
    await mkdir(homeDirectory, { mode: 0o755 });
    await mkdir(storeDirectory, { mode: 0o755 });
    await fetchExactPublicSource(entry.submission.source, sourceDirectory);
    await validateSourceBuildContract(sourceDirectory);
    await rm(path.join(sourceDirectory, "dist"), {
      recursive: true,
      force: true,
    });

    const identity = await prepareContainerIdentity([
      sourceDirectory,
      homeDirectory,
      storeDirectory,
    ]);
    const install = await runDockerPhase({
      phase: "dependency install",
      image: builderImage,
      network: "bridge",
      command: [...INSTALL_COMMAND, "--store-dir", "/mirage-store"],
      sourceDirectory,
      homeDirectory,
      storeDirectory,
      identity,
    });
    await rm(path.join(sourceDirectory, "dist"), {
      recursive: true,
      force: true,
    });
    const buildResult = await runDockerPhase({
      phase: "offline game build",
      image: builderImage,
      network: "none",
      command: BUILD_COMMAND,
      sourceDirectory,
      homeDirectory,
      storeDirectory,
      identity,
    });

    const inspection = await inspectStaticDist(
      path.join(sourceDirectory, "dist"),
    );
    const build = Object.freeze({
      mode: "isolated-docker",
      builderImage,
      sourceCommit: entry.submission.source.commit,
      installNetwork: "bridge",
      buildNetwork: "none",
      installLogDigest: digestProcessLog(install),
      buildLogDigest: digestProcessLog(buildResult),
    });
    return await stageArtifact({
      inspection,
      submission: entry.submission,
      outputDirectory,
      provenanceDirectory,
      submissionDigest: entry.submissionDigest,
      build,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function verifySubmissionEntry(entry, cwd) {
  const absolutePath = path.resolve(cwd, ...entry.path.split("/"));
  invariant(
    absolutePath.startsWith(`${path.resolve(cwd)}${path.sep}`),
    `Submission path escapes checkout: ${entry.path}`,
  );
  let source;
  try {
    source = await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new PublishingError(
      `Could not verify planned submission ${entry.path}: ${error.message}`,
    );
  }
  invariant(
    `sha256:${sha256(source)}` === entry.submissionDigest,
    `Submission changed after validation: ${entry.path}`,
  );
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new PublishingError(
      `Invalid JSON in ${entry.path}: ${error.message}`,
    );
  }
  const verified = validateSubmission(value, { filePath: entry.path });
  invariant(
    canonicalJson(verified) === canonicalJson(entry.submission),
    `Submission plan does not match ${entry.path}`,
  );
}

async function fetchExactPublicSource(source, targetDirectory) {
  await runGit(["init", "--quiet", targetDirectory]);
  await runGit([
    "-C",
    targetDirectory,
    "remote",
    "add",
    "origin",
    `${source.repositoryUrl}.git`,
  ]);
  await runGit([
    "-c",
    "credential.helper=",
    "-C",
    targetDirectory,
    "fetch",
    "--quiet",
    "--depth=1",
    "--no-tags",
    "origin",
    source.commit,
  ]);
  await runGit([
    "-C",
    targetDirectory,
    "checkout",
    "--quiet",
    "--detach",
    "FETCH_HEAD",
  ]);
  const resolved = (
    await runGit(["-C", targetDirectory, "rev-parse", "HEAD"])
  ).trim();
  invariant(
    resolved === source.commit,
    `Fetched source resolved to ${resolved}, expected ${source.commit}`,
  );
}

async function validateSourceBuildContract(sourceDirectory) {
  const packagePath = path.join(sourceDirectory, "package.json");
  const lockPath = path.join(sourceDirectory, "pnpm-lock.yaml");
  const packageStats = await lstatRegular(packagePath, "package.json");
  const lockStats = await lstatRegular(lockPath, "pnpm-lock.yaml");
  invariant(
    packageStats.nlink === 1 && lockStats.nlink === 1,
    "Build contract files must not be hard links",
  );
  invariant(
    !(await exists(path.join(sourceDirectory, ".gitmodules"))),
    "Git submodules are not accepted",
  );

  let packageDocument;
  try {
    packageDocument = JSON.parse(await readFile(packagePath, "utf8"));
  } catch (error) {
    throw new PublishingError(`Invalid source package.json: ${error.message}`);
  }
  invariant(
    packageDocument.packageManager === `pnpm@${REQUIRED_PNPM_VERSION}`,
    `Source packageManager must be pnpm@${REQUIRED_PNPM_VERSION}`,
  );
  invariant(
    packageDocument.engines?.node === `${REQUIRED_NODE_MAJOR}.x`,
    `Source engines.node must be ${REQUIRED_NODE_MAJOR}.x`,
  );
  invariant(
    typeof packageDocument.scripts?.["build:mirage"] === "string" &&
      packageDocument.scripts["build:mirage"].trim().length > 0,
    "Source package.json must define scripts.build:mirage",
  );
}

async function runDockerPhase({
  phase,
  image,
  network,
  command,
  sourceDirectory,
  homeDirectory,
  storeDirectory,
  identity,
}) {
  for (const mountPath of [sourceDirectory, homeDirectory, storeDirectory]) {
    invariant(
      !mountPath.includes(","),
      "Temporary Docker mount path contains an unsupported comma",
    );
  }
  const args = [
    "run",
    "--rm",
    "--init",
    "--read-only",
    "--network",
    network,
    "--user",
    `${identity.uid}:${identity.gid}`,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--cpus",
    DOCKER_LIMITS.cpus,
    "--memory",
    DOCKER_LIMITS.memory,
    "--memory-swap",
    DOCKER_LIMITS.memory,
    "--pids-limit",
    DOCKER_LIMITS.pids,
    "--ulimit",
    "nofile=1024:1024",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=512m",
    "--mount",
    `type=bind,src=${sourceDirectory},dst=/workspace`,
    "--mount",
    `type=bind,src=${homeDirectory},dst=/mirage-home`,
    "--mount",
    `type=bind,src=${storeDirectory},dst=/mirage-store`,
    "--workdir",
    "/workspace",
    "--env",
    "CI=1",
    "--env",
    "HOME=/mirage-home",
    "--env",
    "COREPACK_HOME=/mirage-home/corepack",
    "--env",
    "XDG_CACHE_HOME=/mirage-home/cache",
    image,
    ...command,
  ];

  try {
    const result = await execFileAsync("docker", args, {
      encoding: null,
      timeout: DOCKER_LIMITS.timeoutMs,
      maxBuffer: DOCKER_LIMITS.maxLogBytes,
      env: minimalDockerEnvironment(),
    });
    return {
      stdout: Buffer.from(result.stdout),
      stderr: Buffer.from(result.stderr),
    };
  } catch (error) {
    const stdout = Buffer.isBuffer(error.stdout)
      ? error.stdout
      : Buffer.from(error.stdout ?? "");
    const stderr = Buffer.isBuffer(error.stderr)
      ? error.stderr
      : Buffer.from(error.stderr ?? "");
    throw new PublishingError(
      `Container ${phase} failed (log digest ${digestProcessLog({ stdout, stderr })})`,
    );
  }
}

function minimalDockerEnvironment() {
  const environment = {};
  for (const name of [
    "PATH",
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
  ]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return environment;
}

async function prepareContainerIdentity(directories) {
  const hostUid = process.getuid?.() ?? 10001;
  const hostGid = process.getgid?.() ?? 10001;
  const uid = hostUid === 0 ? 10001 : hostUid;
  const gid = hostGid === 0 ? 10001 : hostGid;
  invariant(uid > 0 && gid > 0, "Docker builder must use a non-root identity");
  if (hostUid === 0 || hostGid === 0) {
    for (const directory of directories) {
      await chownTree(directory, uid, gid);
    }
  }
  return { uid, gid };
}

async function chownTree(root, uid, gid) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    const stats = await lstat(entryPath);
    invariant(
      !stats.isSymbolicLink(),
      `Source checkout contains a symlink while preparing root-owned build: ${entryPath}`,
    );
    if (stats.isDirectory()) await chownTree(entryPath, uid, gid);
    await chown(entryPath, uid, gid);
  }
  await chown(root, uid, gid);
}

function digestProcessLog({ stdout, stderr }) {
  const combined = Buffer.concat([
    Buffer.from("stdout\0"),
    stdout,
    Buffer.from("\0stderr\0"),
    stderr,
  ]);
  return `sha256:${sha256(combined)}`;
}

function resolveTestSourceDirectory(sourceDirectory, id, count) {
  const root = path.resolve(sourceDirectory);
  return count === 1 ? root : path.join(root, id);
}

function assertSeparateDirectories(left, right) {
  invariant(left !== right, "Output and provenance directories must differ");
  const leftRelative = path.relative(left, right);
  const rightRelative = path.relative(right, left);
  invariant(
    leftRelative.startsWith("..") && rightRelative.startsWith(".."),
    "Output and provenance directories must not contain one another",
  );
}

async function lstatRegular(filePath, label) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch (error) {
    throw new PublishingError(`Source is missing ${label}: ${error.message}`);
  }
  invariant(
    stats.isFile() && !stats.isSymbolicLink(),
    `Source ${label} must be a regular file`,
  );
  return stats;
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
