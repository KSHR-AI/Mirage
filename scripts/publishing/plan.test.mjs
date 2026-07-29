import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createValidationPlan, validateBuildPlan } from "./plan.mjs";
import {
  createTemporaryDirectory,
  git,
  initGitRepository,
  makeSubmission,
} from "./test-helpers.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function repositoryFixture() {
  const root = await createTemporaryDirectory("mirage-plan-test-");
  temporaryRoots.push(root);
  initGitRepository(root);
  await mkdir(path.join(root, "submissions"));
  await writeFile(path.join(root, "submissions", ".gitkeep"), "");
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "Base"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  return { root, base };
}

async function commitSubmission(root, submission = makeSubmission()) {
  const filePath = path.join(root, "submissions", `${submission.id}.json`);
  await writeFile(filePath, `${JSON.stringify(submission, null, 2)}\n`);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", `Add ${submission.id}`]);
  return { filePath, commit: git(root, ["rev-parse", "HEAD"]) };
}

describe("submission validation plans", () => {
  it("plans every committed submission in all mode", async () => {
    const fixture = await repositoryFixture();
    const { commit } = await commitSubmission(fixture.root);
    const plan = await createValidationPlan({
      mode: "all",
      cwd: fixture.root,
    });

    expect(plan.head).toBe(commit);
    expect(plan.base).toBeNull();
    expect(plan.submissions).toHaveLength(1);
    expect(plan.submissions[0].submission.id).toBe("night-drive-001");
    expect(plan.submissions[0].submissionDigest).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(validateBuildPlan(plan).submissions).toHaveLength(1);
  });

  it("plans only immutable additions in changed mode", async () => {
    const fixture = await repositoryFixture();
    const { commit } = await commitSubmission(fixture.root);
    const plan = await createValidationPlan({
      mode: "changed",
      base: fixture.base,
      head: commit,
      cwd: fixture.root,
    });

    expect(plan.submissions.map((entry) => entry.submission.id)).toEqual([
      "night-drive-001",
    ]);
    expect(plan.removed).toEqual([]);
  });

  it("rejects modification or rename of an immutable submission", async () => {
    const fixture = await repositoryFixture();
    const added = await commitSubmission(fixture.root);
    const changed = makeSubmission({
      description: "A materially changed immutable record.",
    });
    await writeFile(added.filePath, `${JSON.stringify(changed, null, 2)}\n`);
    git(fixture.root, ["add", "."]);
    git(fixture.root, ["commit", "--quiet", "-m", "Modify submission"]);
    const modifiedCommit = git(fixture.root, ["rev-parse", "HEAD"]);

    await expect(
      createValidationPlan({
        mode: "changed",
        base: added.commit,
        head: modifiedCommit,
        cwd: fixture.root,
      }),
    ).rejects.toThrow(/immutable/);
  });

  it("records deletions as takedowns without changing immutable bytes", async () => {
    const fixture = await repositoryFixture();
    const added = await commitSubmission(fixture.root);
    await rm(added.filePath);
    git(fixture.root, ["add", "--all"]);
    git(fixture.root, ["commit", "--quiet", "-m", "Remove submission"]);
    const removedCommit = git(fixture.root, ["rev-parse", "HEAD"]);
    const plan = await createValidationPlan({
      mode: "changed",
      base: added.commit,
      head: removedCommit,
      cwd: fixture.root,
    });

    expect(plan.submissions).toEqual([]);
    expect(plan.removed).toEqual([
      expect.objectContaining({
        id: "night-drive-001",
        path: "submissions/night-drive-001.json",
        source: makeSubmission().source,
      }),
    ]);
  });

  it("validates lineage against every active submission in changed mode", async () => {
    const fixture = await repositoryFixture();
    const parent = makeSubmission({
      id: "parent-game",
      source: {
        repositoryUrl: "https://github.com/example/parent-game",
        commit: "4".repeat(40),
      },
    });
    const parentCommit = await commitSubmission(fixture.root, parent);
    const child = makeSubmission({
      id: "child-game",
      source: {
        repositoryUrl: "https://github.com/example/child-game",
        commit: "5".repeat(40),
      },
      lineage: {
        kind: "derived",
        parentId: parent.id,
        parentSource: parent.source,
      },
    });
    const childCommit = await commitSubmission(fixture.root, child);

    await expect(
      createValidationPlan({
        mode: "changed",
        base: parentCommit.commit,
        head: childCommit.commit,
        cwd: fixture.root,
      }),
    ).resolves.toMatchObject({
      submissions: [
        expect.objectContaining({
          submission: expect.objectContaining({ id: child.id }),
        }),
      ],
    });

    await rm(parentCommit.filePath);
    git(fixture.root, ["add", "--all"]);
    git(fixture.root, ["commit", "--quiet", "-m", "Delete lineage parent"]);
    const deletionCommit = git(fixture.root, ["rev-parse", "HEAD"]);
    await expect(
      createValidationPlan({
        mode: "changed",
        base: childCommit.commit,
        head: deletionCommit,
        cwd: fixture.root,
      }),
    ).rejects.toThrow(/missing parent/);
  });

  it("rejects lineage cycles and duplicate source revisions in the active set", async () => {
    const cyclic = await repositoryFixture();
    await commitSubmission(
      cyclic.root,
      makeSubmission({
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
      }),
    );
    await commitSubmission(
      cyclic.root,
      makeSubmission({
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
      }),
    );
    await expect(
      createValidationPlan({ mode: "all", cwd: cyclic.root }),
    ).rejects.toThrow(/lineage cycle/);

    const duplicate = await repositoryFixture();
    const first = makeSubmission({ id: "source-owner" });
    await commitSubmission(duplicate.root, first);
    await commitSubmission(
      duplicate.root,
      makeSubmission({
        id: "source-copy",
        source: first.source,
      }),
    );
    await expect(
      createValidationPlan({ mode: "all", cwd: duplicate.root }),
    ).rejects.toThrow(/reuses source revision/);

    const mismatched = await repositoryFixture();
    const parent = makeSubmission({ id: "actual-parent" });
    await commitSubmission(mismatched.root, parent);
    await commitSubmission(
      mismatched.root,
      makeSubmission({
        id: "mismatched-child",
        source: {
          repositoryUrl: "https://github.com/example/mismatched-child",
          commit: "6".repeat(40),
        },
        lineage: {
          kind: "derived",
          parentId: parent.id,
          parentSource: {
            repositoryUrl: parent.source.repositoryUrl,
            commit: "7".repeat(40),
          },
        },
      }),
    );
    await expect(
      createValidationPlan({ mode: "all", cwd: mismatched.root }),
    ).rejects.toThrow(/parentSource/);
  });

  it("rejects forged plan digests and malformed removed identities", () => {
    const valid = {
      schemaVersion: 1,
      mode: "all",
      base: null,
      head: "a".repeat(40),
      submissions: [],
      removed: [],
    };
    expect(() =>
      validateBuildPlan({
        ...valid,
        removed: [
          {
            id: "night-drive-001",
            path: "submissions/night-drive-001.json",
            source: makeSubmission().source,
            submissionDigest: "a".repeat(64),
          },
        ],
      }),
    ).toThrow(/sha256/);
  });

  it("rejects an active collection whose maximum public projection exceeds 256 KiB", async () => {
    const fixture = await repositoryFixture();
    for (let index = 0; index < 2; index += 1) {
      const id = `large-game-${index}`;
      const submission = makeSubmission({
        id,
        source: {
          repositoryUrl: `https://github.com/example/${id}`,
          commit: index.toString(16).repeat(40),
        },
        provenance: {
          prompt: {
            status: "published",
            text: "p".repeat(200_000),
            note: "Exact prompt preserved.",
          },
        },
      });
      await writeFile(
        path.join(fixture.root, "submissions", `${id}.json`),
        `${JSON.stringify(submission, null, 2)}\n`,
      );
    }
    git(fixture.root, ["add", "."]);
    git(fixture.root, ["commit", "--quiet", "-m", "Oversized registry"]);

    await expect(
      createValidationPlan({ mode: "all", cwd: fixture.root }),
    ).rejects.toThrow(/public registry\.json exceeds 262144 bytes/);
  });
});
