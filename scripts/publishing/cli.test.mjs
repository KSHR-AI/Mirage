import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTemporaryDirectory,
  git,
  initGitRepository,
  makeSubmission,
  readJsonFile,
  writeValidDist,
} from "./test-helpers.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function cliFixture() {
  const root = await createTemporaryDirectory("mirage-cli-test-");
  temporaryRoots.push(root);
  initGitRepository(root);
  await mkdir(path.join(root, "submissions"));
  await writeFile(
    path.join(root, "submissions", "night-drive-001.json"),
    `${JSON.stringify(makeSubmission(), null, 2)}\n`,
  );
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "Add submission"]);
  const source = path.join(root, "candidate");
  await mkdir(source);
  await writeValidDist(source);
  return { root, source };
}

describe("publishing command-line contracts", () => {
  it("validates all submissions and builds only through explicit local test mode", async () => {
    const fixture = await cliFixture();
    const planPath = path.join(fixture.root, "plan.json");
    const validate = runNode(
      "validate-submissions.mjs",
      ["--mode", "all", "--output", planPath],
      fixture.root,
    );
    expect(validate.status, validate.stderr).toBe(0);
    expect((await readJsonFile(planPath)).submissions).toHaveLength(1);

    const payload = path.join(fixture.root, "staging", "payload");
    const provenance = path.join(fixture.root, "staging", "provenance");
    const args = [
      "--plan",
      planPath,
      "--output-dir",
      payload,
      "--provenance-dir",
      provenance,
      "--source-dir",
      fixture.source,
    ];
    const denied = runNode("build-submissions.mjs", args, fixture.root);
    expect(denied.status).toBe(1);
    expect(denied.stderr).toMatch(/disabled outside explicit test mode/);

    const built = runNode("build-submissions.mjs", args, fixture.root, {
      MIRAGE_PUBLISH_TEST_MODE: "1",
    });
    expect(built.status, built.stderr).toBe(0);
    expect(
      await readJsonFile(path.join(provenance, "night-drive-001.json")),
    ).toMatchObject({
      id: "night-drive-001",
      model: "example-model",
      artifact: {
        entryPath: "index.html",
      },
    });
  });

  it("accepts the exact trusted publisher flags before rejecting unsafe repository identity", () => {
    const result = runNode(
      "publish-artifacts.mjs",
      [
        "--input-dir",
        "/tmp/not-used",
        "--branch",
        "mirage-artifacts",
        "--repository",
        "../unsafe",
        "--workflow-artifact-digest",
        `sha256:${"a".repeat(64)}`,
        "--source-workflow-sha",
        "b".repeat(40),
        "--disable-vercel-deployments",
      ],
      process.cwd(),
      { GH_TOKEN: "ghs_test_token_long_enough_for_validation" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--repository/);
    expect(result.stderr).not.toContain("ghs_test_token");
  });
});

function runNode(scriptName, args, cwd, environment = {}) {
  return spawnSync(
    process.execPath,
    [path.join(scriptsDirectory, scriptName), ...args],
    {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    },
  );
}
