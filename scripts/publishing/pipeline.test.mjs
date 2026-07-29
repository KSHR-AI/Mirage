import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildValidationPlan } from "./builder.mjs";
import { publishStagingTree } from "./publisher.mjs";
import {
  createTemporaryDirectory,
  makePlan,
  makeSubmission,
  readJsonFile,
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

async function stagedFixture({
  submission = makeSubmission(),
  javascript,
} = {}) {
  const root = await createTemporaryDirectory("mirage-pipeline-test-");
  temporaryRoots.push(root);
  const source = path.join(root, "source");
  const payload = path.join(root, "staging", "payload");
  const provenance = path.join(root, "staging", "provenance");
  await mkdir(source, { recursive: true });
  await writeValidDist(source);
  if (javascript) {
    await writeFile(path.join(source, "dist", "assets", "game.js"), javascript);
  }
  const submissionEntry = await writeSubmission(root, submission);
  const plan = makePlan(submissionEntry);
  const result = await buildValidationPlan({
    plan,
    outputDirectory: payload,
    provenanceDirectory: provenance,
    cwd: root,
    sourceDirectory: source,
    testMode: true,
  });
  return {
    root,
    source,
    payload,
    provenance,
    plan,
    submissionEntry,
    record: result.published[0],
  };
}

describe("local test build and trusted publisher", () => {
  it("stages deterministic bytes, exact manifest, and normalized registry record", async () => {
    const fixture = await stagedFixture();
    const { record } = fixture;
    const digestHex = record.artifact.digest.slice("sha256:".length);
    const artifactRoot = path.join(
      fixture.payload,
      "artifacts",
      record.id,
      record.source.commit,
      digestHex,
    );
    const manifestPath = path.join(
      fixture.payload,
      "manifests",
      record.id,
      record.source.commit,
      `${digestHex}.json`,
    );

    expect(
      await readFile(path.join(artifactRoot, "index.html"), "utf8"),
    ).toContain("./assets/game.js");
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    expect(manifest).toEqual({
      schemaVersion: 1,
      artifactDigest: record.artifact.digest,
      fileCount: record.artifact.fileCount,
      bytes: record.artifact.bytes,
      files: expect.arrayContaining([
        expect.objectContaining({
          path: "index.html",
          sha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        }),
      ]),
    });
    expect(record).toMatchObject({
      model: fixture.submissionEntry.submission.provenance.model,
      builtOn: fixture.submissionEntry.submission.provenance.builtOn,
      artifact: {
        entryPath: "index.html",
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        manifestDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        fileCount: 4,
      },
      presentation: {
        protocolVersion: 1,
      },
      publication: {
        contract: {
          node: "24.x",
          pnpm: "11.7.0",
          command: "pnpm run build:mirage",
          output: "dist/index.html",
        },
      },
    });
    expect(Object.keys(record.artifact).sort()).toEqual(
      ["bytes", "digest", "entryPath", "fileCount", "manifestDigest"].sort(),
    );
  });

  it("is deterministic and idempotent for the same source and static bytes", async () => {
    const fixture = await stagedFixture();
    const firstRecordBytes = await readFile(
      path.join(fixture.provenance, "night-drive-001.json"),
    );
    await buildValidationPlan({
      plan: fixture.plan,
      outputDirectory: fixture.payload,
      provenanceDirectory: fixture.provenance,
      cwd: fixture.root,
      sourceDirectory: fixture.source,
      testMode: true,
    });
    expect(
      await readFile(path.join(fixture.provenance, "night-drive-001.json")),
    ).toEqual(firstRecordBytes);

    const second = await stagedFixture();
    expect(second.record.artifact).toEqual(fixture.record.artifact);
  });

  it("disables local source mode unless explicitly marked test-only", async () => {
    const root = await createTemporaryDirectory("mirage-local-mode-test-");
    temporaryRoots.push(root);
    const source = path.join(root, "source");
    await mkdir(source);
    await writeValidDist(source);
    const entry = await writeSubmission(root);

    await expect(
      buildValidationPlan({
        plan: makePlan(entry),
        outputDirectory: path.join(root, "payload"),
        provenanceDirectory: path.join(root, "provenance"),
        cwd: root,
        sourceDirectory: source,
        testMode: false,
      }),
    ).rejects.toThrow(/test-only/);
  });

  it("detects submission mutation after plan validation", async () => {
    const root = await createTemporaryDirectory("mirage-plan-mutation-test-");
    temporaryRoots.push(root);
    const source = path.join(root, "source");
    await mkdir(source);
    await writeValidDist(source);
    const entry = await writeSubmission(root);
    await writeFile(
      path.join(root, entry.path),
      `${JSON.stringify(makeSubmission({ title: "Changed" }), null, 2)}\n`,
    );

    await expect(
      buildValidationPlan({
        plan: makePlan(entry),
        outputDirectory: path.join(root, "payload"),
        provenanceDirectory: path.join(root, "provenance"),
        cwd: root,
        sourceDirectory: source,
        testMode: true,
      }),
    ).rejects.toThrow(/changed after validation/);
  });

  it("publishes a root registry with full app records and trusted branch config", async () => {
    const fixture = await stagedFixture();
    const worktree = path.join(fixture.root, "artifact-worktree");
    await mkdir(worktree);
    await publishStagingTree({
      payloadDirectory: fixture.payload,
      provenanceDirectory: fixture.provenance,
      worktreeDirectory: worktree,
      requireGitWorktree: false,
    });

    const registry = await readJsonFile(path.join(worktree, "registry.json"));
    expect(registry).toEqual({
      schemaVersion: 1,
      games: [
        expect.objectContaining({
          id: "night-drive-001",
          model: "example-model",
          builtOn: "2026-07-29",
          artifact: fixture.record.artifact,
          presentation: fixture.record.presentation,
        }),
      ],
    });
    expect(Object.hasOwn(registry.games[0], "publication")).toBe(false);
    expect(await readJsonFile(path.join(worktree, "vercel.json"))).toEqual({
      git: { deploymentEnabled: { "mirage-artifacts": false } },
    });

    await expect(
      publishStagingTree({
        payloadDirectory: fixture.payload,
        provenanceDirectory: fixture.provenance,
        worktreeDirectory: worktree,
        requireGitWorktree: false,
      }),
    ).resolves.toMatchObject({ published: [expect.any(Object)] });
  });

  it("applies an idempotent takedown while retaining immutable artifact bytes", async () => {
    const fixture = await stagedFixture();
    const worktree = path.join(fixture.root, "artifact-worktree");
    await mkdir(worktree);
    await publishStagingTree({
      payloadDirectory: fixture.payload,
      provenanceDirectory: fixture.provenance,
      worktreeDirectory: worktree,
      requireGitWorktree: false,
    });
    const digestHex = fixture.record.artifact.digest.slice("sha256:".length);
    const retainedIndex = path.join(
      worktree,
      "artifacts",
      fixture.record.id,
      fixture.record.source.commit,
      digestHex,
      "index.html",
    );

    const removalRoot = path.join(fixture.root, "removal-staging");
    const removalPayload = path.join(removalRoot, "payload");
    const removalProvenance = path.join(removalRoot, "provenance");
    await mkdir(removalProvenance, { recursive: true });
    await writeFile(
      path.join(removalProvenance, "removals.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          head: TEST_HEAD,
          removed: [
            {
              id: fixture.record.id,
              path: fixture.submissionEntry.path,
              source: fixture.record.source,
              submissionDigest: fixture.submissionEntry.submissionDigest,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const remove = () =>
      publishStagingTree({
        payloadDirectory: removalPayload,
        provenanceDirectory: removalProvenance,
        worktreeDirectory: worktree,
        requireGitWorktree: false,
      });
    await remove();
    await expect(remove()).resolves.toMatchObject({
      removed: [expect.objectContaining({ id: fixture.record.id })],
    });
    expect(await readFile(retainedIndex, "utf8")).toContain("<!doctype html>");
    expect(await readJsonFile(path.join(worktree, "registry.json"))).toEqual({
      schemaVersion: 1,
      games: [],
    });

    await publishStagingTree({
      payloadDirectory: fixture.payload,
      provenanceDirectory: fixture.provenance,
      worktreeDirectory: worktree,
      requireGitWorktree: false,
    });
    expect(
      (await readJsonFile(path.join(worktree, "registry.json"))).games,
    ).toHaveLength(1);
  });

  it("accepts an omitted empty payload directory for initial no-op publication", async () => {
    const root = await createTemporaryDirectory("mirage-empty-publish-test-");
    temporaryRoots.push(root);
    const input = path.join(root, "input");
    const provenance = path.join(input, "provenance");
    const payload = path.join(input, "payload");
    const worktree = path.join(root, "worktree");
    await mkdir(provenance, { recursive: true });
    await mkdir(worktree);
    await writeFile(
      path.join(provenance, "removals.json"),
      `${JSON.stringify(
        { schemaVersion: 1, head: TEST_HEAD, removed: [] },
        null,
        2,
      )}\n`,
    );

    await expect(
      publishStagingTree({
        payloadDirectory: payload,
        provenanceDirectory: provenance,
        worktreeDirectory: worktree,
        requireGitWorktree: false,
      }),
    ).resolves.toMatchObject({ published: [], removed: [] });
    expect(await readJsonFile(path.join(worktree, "registry.json"))).toEqual({
      schemaVersion: 1,
      games: [],
    });
  });

  it("rejects tampering, unreferenced payload, and divergent immutable IDs", async () => {
    const tampered = await stagedFixture();
    const digestHex = tampered.record.artifact.digest.slice("sha256:".length);
    await writeFile(
      path.join(
        tampered.payload,
        "artifacts",
        tampered.record.id,
        tampered.record.source.commit,
        digestHex,
        "assets",
        "game.js",
      ),
      "console.log('tampered');\n",
    );
    const tamperedWorktree = path.join(tampered.root, "worktree");
    await mkdir(tamperedWorktree);
    await expect(
      publishStagingTree({
        payloadDirectory: tampered.payload,
        provenanceDirectory: tampered.provenance,
        worktreeDirectory: tamperedWorktree,
        requireGitWorktree: false,
      }),
    ).rejects.toThrow(/do not match trusted manifest/);

    const first = await stagedFixture();
    const worktree = path.join(first.root, "worktree");
    await mkdir(worktree);
    await publishStagingTree({
      payloadDirectory: first.payload,
      provenanceDirectory: first.provenance,
      worktreeDirectory: worktree,
      requireGitWorktree: false,
    });
    const divergent = await stagedFixture({
      submission: makeSubmission({
        source: { commit: "4".repeat(40) },
      }),
      javascript: "document.body.dataset.ready = 'different';\n",
    });
    await expect(
      publishStagingTree({
        payloadDirectory: divergent.payload,
        provenanceDirectory: divergent.provenance,
        worktreeDirectory: worktree,
        requireGitWorktree: false,
      }),
    ).rejects.toThrow(/different commit or digest/);
  });

  it("rejects a public registry with missing or cyclic lineage and duplicate source revisions", async () => {
    const missing = await stagedFixture({
      submission: makeSubmission({
        lineage: {
          kind: "derived",
          parentId: "missing-parent",
          parentSource: {
            repositoryUrl: "https://github.com/example/missing-parent",
            commit: "4".repeat(40),
          },
        },
      }),
    });
    const missingWorktree = path.join(missing.root, "worktree");
    await mkdir(missingWorktree);
    await expect(
      publishStagingTree({
        payloadDirectory: missing.payload,
        provenanceDirectory: missing.provenance,
        worktreeDirectory: missingWorktree,
        requireGitWorktree: false,
      }),
    ).rejects.toThrow(/missing parent/);

    const cyclic = await stagedFixture();
    const cycleWorktree = path.join(cyclic.root, "cycle-worktree");
    const cycleInput = path.join(cyclic.root, "cycle-input");
    await mkdir(path.join(cycleWorktree, "registry"), { recursive: true });
    await mkdir(path.join(cycleInput, "payload"), { recursive: true });
    await mkdir(path.join(cycleInput, "provenance"), { recursive: true });
    await writeFile(
      path.join(cycleInput, "provenance", "removals.json"),
      `${JSON.stringify(
        { schemaVersion: 1, head: TEST_HEAD, removed: [] },
        null,
        2,
      )}\n`,
    );
    const cycleA = {
      ...structuredClone(cyclic.record),
      id: "cycle-a",
      source: {
        repositoryUrl: "https://github.com/example/cycle-a",
        commit: "4".repeat(40),
      },
      lineage: {
        kind: "derived",
        parentId: "cycle-b",
        parentSource: {
          repositoryUrl: "https://github.com/example/cycle-b",
          commit: "5".repeat(40),
        },
      },
    };
    const cycleB = {
      ...structuredClone(cyclic.record),
      id: "cycle-b",
      source: {
        repositoryUrl: "https://github.com/example/cycle-b",
        commit: "5".repeat(40),
      },
      lineage: {
        kind: "derived",
        parentId: "cycle-a",
        parentSource: {
          repositoryUrl: "https://github.com/example/cycle-a",
          commit: "4".repeat(40),
        },
      },
    };
    await writeFile(
      path.join(cycleWorktree, "registry", "cycle-a.json"),
      `${JSON.stringify(cycleA, null, 2)}\n`,
    );
    await writeFile(
      path.join(cycleWorktree, "registry", "cycle-b.json"),
      `${JSON.stringify(cycleB, null, 2)}\n`,
    );
    await expect(
      publishStagingTree({
        payloadDirectory: path.join(cycleInput, "payload"),
        provenanceDirectory: path.join(cycleInput, "provenance"),
        worktreeDirectory: cycleWorktree,
        requireGitWorktree: false,
      }),
    ).rejects.toThrow(/lineage cycle/);

    const first = await stagedFixture({
      submission: makeSubmission({
        id: "source-owner",
        source: {
          repositoryUrl: "https://github.com/example/shared-source",
          commit: "4".repeat(40),
        },
      }),
    });
    const worktree = path.join(first.root, "worktree");
    await mkdir(worktree);
    await publishStagingTree({
      payloadDirectory: first.payload,
      provenanceDirectory: first.provenance,
      worktreeDirectory: worktree,
      requireGitWorktree: false,
    });
    const duplicate = await stagedFixture({
      submission: makeSubmission({
        id: "source-copy",
        source: first.record.source,
      }),
    });
    await expect(
      publishStagingTree({
        payloadDirectory: duplicate.payload,
        provenanceDirectory: duplicate.provenance,
        worktreeDirectory: worktree,
        requireGitWorktree: false,
      }),
    ).rejects.toThrow(/reuses source revision/);
  });

  it("rejects a parent takedown while a derived child remains active", async () => {
    const parent = await stagedFixture({
      submission: makeSubmission({
        id: "lineage-parent",
        source: {
          repositoryUrl: "https://github.com/example/lineage-parent",
          commit: "4".repeat(40),
        },
      }),
    });
    const worktree = path.join(parent.root, "worktree");
    await mkdir(worktree);
    await publishStagingTree({
      payloadDirectory: parent.payload,
      provenanceDirectory: parent.provenance,
      worktreeDirectory: worktree,
      requireGitWorktree: false,
    });

    const child = await stagedFixture({
      submission: makeSubmission({
        id: "lineage-child",
        source: {
          repositoryUrl: "https://github.com/example/lineage-child",
          commit: "5".repeat(40),
        },
        lineage: {
          kind: "derived",
          parentId: parent.record.id,
          parentSource: parent.record.source,
        },
      }),
    });
    await publishStagingTree({
      payloadDirectory: child.payload,
      provenanceDirectory: child.provenance,
      worktreeDirectory: worktree,
      requireGitWorktree: false,
    });
    const activeRegistry = await readJsonFile(
      path.join(worktree, "registry.json"),
    );
    expect(
      activeRegistry.games.find((game) => game.id === child.record.id).lineage,
    ).toEqual({
      kind: "derived",
      parentId: parent.record.id,
      parentSource: parent.record.source,
    });

    const removalRoot = path.join(parent.root, "parent-removal");
    await mkdir(path.join(removalRoot, "payload"), { recursive: true });
    await mkdir(path.join(removalRoot, "provenance"), { recursive: true });
    await writeFile(
      path.join(removalRoot, "provenance", "removals.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          head: TEST_HEAD,
          removed: [
            {
              id: parent.record.id,
              path: parent.submissionEntry.path,
              source: parent.record.source,
              submissionDigest: parent.submissionEntry.submissionDigest,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await expect(
      publishStagingTree({
        payloadDirectory: path.join(removalRoot, "payload"),
        provenanceDirectory: path.join(removalRoot, "provenance"),
        worktreeDirectory: worktree,
        requireGitWorktree: false,
      }),
    ).rejects.toThrow(/missing parent/);
  });
});
