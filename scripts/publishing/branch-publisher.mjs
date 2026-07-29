import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { writeBytesIdempotently } from "./artifact.mjs";
import { invariant, PublishingError } from "./errors.mjs";
import { publishStagingTree } from "./publisher.mjs";
import { COMMIT_PATTERN, DIGEST_PATTERN } from "./submission.mjs";

const execFileAsync = promisify(execFile);
const REPOSITORY_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})\/[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})$/;
const BRANCH_PATTERN =
  /^(?!-)(?!.*(?:\.\.|@\{|\/\/|\\|[\u0000-\u001f\u007f]))(?!.*(?:\/|\.|\.lock)$)[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

export async function publishArtifactBranch({
  inputDirectory,
  branch,
  repository,
  workflowArtifactDigest,
  sourceWorkflowSha,
  disableVercelDeployments,
  token,
}) {
  invariant(
    REPOSITORY_PATTERN.test(repository),
    "--repository must be a GitHub OWNER/REPO",
  );
  invariant(BRANCH_PATTERN.test(branch), "--branch is not a safe Git branch");
  invariant(
    DIGEST_PATTERN.test(workflowArtifactDigest),
    "--workflow-artifact-digest must be sha256 followed by 64 lowercase hexadecimal characters",
  );
  invariant(
    COMMIT_PATTERN.test(sourceWorkflowSha),
    "--source-workflow-sha must be a 40-character lowercase commit",
  );
  invariant(
    disableVercelDeployments === true,
    "--disable-vercel-deployments is required",
  );
  invariant(
    typeof token === "string" &&
      token.length >= 20 &&
      !/[\u0000-\u001f\u007f]/.test(token),
    "GH_TOKEN is required for protected artifact-branch publication",
  );

  const inputRoot = path.resolve(inputDirectory);
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "mirage-artifact-branch-"),
  );
  const worktree = path.join(temporaryRoot, "worktree");
  const remoteUrl = `https://github.com/${repository}.git`;
  const authEnvironment = createAuthenticatedGitEnvironment(token);

  try {
    await runTrustedGit(["init", "--quiet", worktree]);
    await runTrustedGit(["-C", worktree, "remote", "add", "origin", remoteUrl]);

    const branchExists = await remoteBranchExists({
      worktree,
      branch,
      authEnvironment,
    });
    if (branchExists) {
      await runTrustedGit(
        [
          "-C",
          worktree,
          "fetch",
          "--quiet",
          "--depth=1",
          "origin",
          `refs/heads/${branch}`,
        ],
        { environment: authEnvironment },
      );
      await runTrustedGit([
        "-C",
        worktree,
        "checkout",
        "--quiet",
        "-B",
        branch,
        "FETCH_HEAD",
      ]);
    } else {
      await runTrustedGit([
        "-C",
        worktree,
        "checkout",
        "--quiet",
        "--orphan",
        branch,
      ]);
    }

    await runTrustedGit([
      "-C",
      worktree,
      "config",
      "user.name",
      "Mirage Artifact Publisher",
    ]);
    await runTrustedGit([
      "-C",
      worktree,
      "config",
      "user.email",
      "artifact-publisher@users.noreply.github.com",
    ]);

    const result = await publishStagingTree({
      payloadDirectory: path.join(inputRoot, "payload"),
      provenanceDirectory: path.join(inputRoot, "provenance"),
      worktreeDirectory: worktree,
      requireGitWorktree: true,
    });
    await writeWorkflowAudit({
      worktree,
      workflowArtifactDigest,
      sourceWorkflowSha,
      result,
    });

    await runTrustedGit(["-C", worktree, "add", "--all", "--", "."]);
    const hasChanges = !(await gitIndexIsClean(worktree));
    if (!hasChanges) {
      const currentCommit = branchExists
        ? (await runTrustedGit(["-C", worktree, "rev-parse", "HEAD"])).trim()
        : null;
      return Object.freeze({
        ...result,
        committed: false,
        commit: currentCommit,
      });
    }

    await runTrustedGit([
      "-C",
      worktree,
      "commit",
      "--quiet",
      "--no-gpg-sign",
      "-m",
      `Publish artifacts from ${sourceWorkflowSha.slice(0, 12)}`,
    ]);
    const commit = (
      await runTrustedGit(["-C", worktree, "rev-parse", "HEAD"])
    ).trim();
    await runTrustedGit(
      [
        "-C",
        worktree,
        "push",
        "--porcelain",
        "origin",
        `HEAD:refs/heads/${branch}`,
      ],
      { environment: authEnvironment },
    );
    return Object.freeze({ ...result, committed: true, commit });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function writeWorkflowAudit({
  worktree,
  workflowArtifactDigest,
  sourceWorkflowSha,
  result,
}) {
  const audit = {
    schemaVersion: 1,
    sourceWorkflowSha,
    workflowArtifactDigest,
    published: result.published.map((record) => ({
      id: record.id,
      source: record.source,
      artifact: record.artifact,
    })),
    removed: result.removed.map((removal) => ({
      id: removal.id,
      source: removal.source,
      submissionDigest: removal.submissionDigest,
    })),
  };
  const digestHex = workflowArtifactDigest.slice("sha256:".length);
  await writeBytesIdempotently(
    path.join(
      worktree,
      "audit",
      "workflows",
      sourceWorkflowSha,
      `${digestHex}.json`,
    ),
    Buffer.from(`${JSON.stringify(audit, null, 2)}\n`),
  );
}

async function remoteBranchExists({ worktree, branch, authEnvironment }) {
  const result = await runTrustedGit(
    [
      "-C",
      worktree,
      "ls-remote",
      "--exit-code",
      "--heads",
      "origin",
      `refs/heads/${branch}`,
    ],
    { environment: authEnvironment, acceptedExitCodes: [0, 2] },
  );
  return result.trim().length > 0;
}

async function gitIndexIsClean(worktree) {
  const result = await executeGit(
    ["-C", worktree, "diff", "--cached", "--quiet", "--exit-code"],
    { acceptedExitCodes: [0, 1] },
  );
  return result.exitCode === 0;
}

async function runTrustedGit(args, options = {}) {
  const result = await executeGit(args, options);
  return result.stdout;
}

async function executeGit(args, { environment, acceptedExitCodes = [0] } = {}) {
  try {
    const result = await execFileAsync("git", args, {
      encoding: "utf8",
      env: environment ?? createSafeGitEnvironment(),
      maxBuffer: 20 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const exitCode = Number(error.code);
    if (acceptedExitCodes.includes(exitCode)) {
      return {
        exitCode,
        stdout: typeof error.stdout === "string" ? error.stdout : "",
        stderr: typeof error.stderr === "string" ? error.stderr : "",
      };
    }
    const stderr =
      typeof error.stderr === "string"
        ? error.stderr.replace(/AUTHORIZATION:[^\r\n]*/gi, "[redacted]").trim()
        : "";
    throw new PublishingError(
      `Trusted Git command failed: git ${args.join(" ")}${stderr ? `: ${stderr}` : ""}`,
    );
  }
}

function createAuthenticatedGitEnvironment(token) {
  const environment = createSafeGitEnvironment();
  const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString(
    "base64",
  );
  return {
    ...environment,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
}

function createSafeGitEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("GIT_")) delete environment[key];
  }
  Object.assign(environment, {
    GIT_ASKPASS: "/bin/false",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
  });
  delete environment.GH_TOKEN;
  delete environment.GITHUB_TOKEN;
  return environment;
}
