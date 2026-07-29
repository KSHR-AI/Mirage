import { execFileSync } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publishArtifactBranch } from "./branch-publisher.mjs";
import { buildValidationPlan } from "./builder.mjs";
import {
  createTemporaryDirectory,
  makePlan,
  TEST_HEAD,
  writeSubmission,
  writeValidDist,
} from "./test-helpers.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("trusted artifact branch publication", () => {
  it("creates, pushes, and idempotently reuses an orphan artifact branch", async () => {
    const root = await createTemporaryDirectory("mirage-branch-test-");
    temporaryRoots.push(root);
    const source = path.join(root, "source");
    const input = path.join(root, "input");
    await mkdir(source);
    await writeValidDist(source);
    const entry = await writeSubmission(root);
    await buildValidationPlan({
      plan: makePlan(entry),
      outputDirectory: path.join(input, "payload"),
      provenanceDirectory: path.join(input, "provenance"),
      cwd: root,
      sourceDirectory: source,
      testMode: true,
    });

    const bareRepository = path.join(root, "remote.git");
    const realGit = execFileSync("/usr/bin/which", ["git"], {
      encoding: "utf8",
    }).trim();
    execFileSync(realGit, ["init", "--quiet", "--bare", bareRepository]);
    const wrapperDirectory = path.join(root, "bin");
    await mkdir(wrapperDirectory);
    const wrapperPath = path.join(wrapperDirectory, "git");
    await writeFile(
      wrapperPath,
      [
        "#!/usr/bin/env node",
        'const { spawnSync } = require("node:child_process");',
        `const realGit = ${JSON.stringify(realGit)};`,
        `const remote = ${JSON.stringify(bareRepository)};`,
        "const args = process.argv.slice(2).map((arg) =>",
        '  arg === "https://github.com/example/repo.git" ? remote : arg,',
        ");",
        'const result = spawnSync(realGit, args, { stdio: "inherit", env: process.env });',
        "process.exit(result.status ?? 1);",
        "",
      ].join("\n"),
    );
    await chmod(wrapperPath, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${wrapperDirectory}${path.delimiter}${previousPath}`;
    try {
      const options = {
        inputDirectory: input,
        branch: "mirage-artifacts",
        repository: "example/repo",
        workflowArtifactDigest: `sha256:${"5".repeat(64)}`,
        sourceWorkflowSha: TEST_HEAD,
        disableVercelDeployments: true,
        token: "ghs_test_token_long_enough_for_local_remote",
      };
      const first = await publishArtifactBranch(options);
      expect(first.committed).toBe(true);
      expect(first.commit).toMatch(/^[0-9a-f]{40}$/);

      const registry = JSON.parse(
        execFileSync(
          realGit,
          [
            "--git-dir",
            bareRepository,
            "show",
            "refs/heads/mirage-artifacts:registry.json",
          ],
          { encoding: "utf8" },
        ),
      );
      expect(registry.games).toEqual([
        expect.objectContaining({
          id: "night-drive-001",
          model: "example-model",
          artifact: expect.objectContaining({ entryPath: "index.html" }),
        }),
      ]);
      const vercel = JSON.parse(
        execFileSync(
          realGit,
          [
            "--git-dir",
            bareRepository,
            "show",
            "refs/heads/mirage-artifacts:vercel.json",
          ],
          { encoding: "utf8" },
        ),
      );
      expect(vercel).toEqual({
        git: { deploymentEnabled: { "mirage-artifacts": false } },
      });

      const retry = await publishArtifactBranch(options);
      expect(retry).toMatchObject({
        committed: false,
        commit: first.commit,
      });
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("rejects invalid branch, repository, digest, or missing deployment guard before Git", async () => {
    const base = {
      inputDirectory: "/not-used",
      branch: "mirage-artifacts",
      repository: "example/repo",
      workflowArtifactDigest: `sha256:${"5".repeat(64)}`,
      sourceWorkflowSha: TEST_HEAD,
      disableVercelDeployments: true,
      token: "ghs_test_token_long_enough_for_validation",
    };
    await expect(
      publishArtifactBranch({ ...base, branch: "../escape" }),
    ).rejects.toThrow(/branch/);
    await expect(
      publishArtifactBranch({ ...base, repository: "../escape" }),
    ).rejects.toThrow(/repository/);
    await expect(
      publishArtifactBranch({
        ...base,
        workflowArtifactDigest: "5".repeat(64),
      }),
    ).rejects.toThrow(/workflow-artifact-digest/);
    await expect(
      publishArtifactBranch({ ...base, disableVercelDeployments: false }),
    ).rejects.toThrow(/disable-vercel-deployments/);
  });
});
