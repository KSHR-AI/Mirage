import { describe, expect, it } from "vitest";
import {
  DIGEST_PATTERN,
  GITHUB_REPOSITORY_PATTERN,
  validateSubmission,
} from "./submission.mjs";
import {
  makeSubmission,
  TEST_COMMIT,
  TEST_PARENT_SOURCE,
  TEST_SEED_DIGEST,
} from "./test-helpers.mjs";

describe("submission validation", () => {
  it("accepts the exact normalized submission contract", () => {
    const submission = validateSubmission(makeSubmission(), {
      filePath: "submissions/night-drive-001.json",
    });

    expect(submission.source).toEqual({
      repositoryUrl: "https://github.com/example/night-drive",
      commit: TEST_COMMIT,
    });
    expect(submission.presentation).toEqual({
      coverPath: "assets/cover.webp",
      coverAlt: "A procedural car driving through a city at night",
      controls: ["WASD to drive"],
      limitations: ["Desktop browsers are best tested"],
      protocolVersion: 1,
    });
    expect(Object.hasOwn(submission, "artifact")).toBe(false);
  });

  it.each([
    "http://github.com/example/night-drive",
    "https://www.github.com/example/night-drive",
    "https://github.com/example/night-drive/",
    "https://github.com/example/night-drive.git",
    "https://github.com/example/night-drive?ref=main",
    "https://github.com/example/night-drive/tree/main",
    "https://user:secret@github.com/example/night-drive",
  ])(
    "rejects non-canonical or credentialed repository URL %s",
    (repositoryUrl) => {
      expect(() =>
        validateSubmission(makeSubmission({ source: { repositoryUrl } })),
      ).toThrow(/repositoryUrl/);
    },
  );

  it("requires exact lowercase commit and path-bound immutable ID", () => {
    expect(() =>
      validateSubmission(
        makeSubmission({ source: { commit: "A".repeat(40) } }),
      ),
    ).toThrow(/40-character lowercase/);
    expect(() =>
      validateSubmission(makeSubmission(), {
        filePath: "submissions/different-id.json",
      }),
    ).toThrow(/must be stored/);
    expect(() =>
      validateSubmission(makeSubmission({ id: "../night-drive" })),
    ).toThrow(/kebab-case/);
  });

  it("validates every lineage variant without conflating evidence", () => {
    expect(
      validateSubmission(
        makeSubmission({
          lineage: { kind: "independent", seedDigest: TEST_SEED_DIGEST },
        }),
      ).lineage.kind,
    ).toBe("independent");
    expect(
      validateSubmission(
        makeSubmission({
          lineage: {
            kind: "derived",
            parentId: "earlier-game-001",
            parentSource: TEST_PARENT_SOURCE,
          },
        }),
      ).lineage,
    ).toEqual({
      kind: "derived",
      parentId: "earlier-game-001",
      parentSource: TEST_PARENT_SOURCE,
    });
    expect(
      validateSubmission(
        makeSubmission({
          lineage: {
            kind: "unverified",
            note: "The runner isolation record was not preserved.",
          },
        }),
      ).lineage.kind,
    ).toBe("unverified");

    expect(() =>
      validateSubmission(
        makeSubmission({
          lineage: { kind: "independent", seedDigest: "sha256:ABC" },
        }),
      ),
    ).toThrow(/seedDigest/);
    expect(() =>
      validateSubmission(
        makeSubmission({
          lineage: {
            kind: "derived",
            parentId: "night-drive-001",
            parentSource: TEST_PARENT_SOURCE,
          },
        }),
      ),
    ).toThrow(/different/);
    expect(() =>
      validateSubmission(
        makeSubmission({
          lineage: {
            kind: "derived",
            parentId: "earlier-game-001",
            parentSource: {
              repositoryUrl: "https://github.com/example/parent-game/tree/main",
              commit: TEST_PARENT_SOURCE.commit,
            },
          },
        }),
      ),
    ).toThrow(/parentSource.repositoryUrl/);
    expect(() =>
      validateSubmission(
        makeSubmission({
          lineage: {
            kind: "derived",
            parentId: "earlier-game-001",
            parentSource: {
              ...TEST_PARENT_SOURCE,
              commit: "main",
            },
          },
        }),
      ),
    ).toThrow(/parentSource.commit/);
  });

  it("requires truthful prompt, license, and presentation records", () => {
    expect(() =>
      validateSubmission(
        makeSubmission({
          provenance: {
            prompt: { status: "published", text: null, note: "Missing." },
          },
        }),
      ),
    ).toThrow(/published prompt/);
    expect(() =>
      validateSubmission(
        makeSubmission({ licenses: { code: "not a license / shell" } }),
      ),
    ).toThrow(/SPDX/);
    expect(() =>
      validateSubmission(
        makeSubmission({ presentation: { coverPath: "../cover.webp" } }),
      ),
    ).toThrow(/coverPath/);
    expect(() =>
      validateSubmission(
        makeSubmission({ presentation: { protocolVersion: 2 } }),
      ),
    ).toThrow(/protocolVersion/);
  });

  it("preserves realistic multiline prompt whitespace while rejecting unsafe controls", () => {
    const text = "\n\tBuild the game.\r\nKeep this indentation.\t\n";
    expect(
      validateSubmission(
        makeSubmission({
          provenance: {
            prompt: {
              status: "published",
              text,
              note: "Exact multiline prompt preserved.",
            },
          },
        }),
      ).provenance.prompt.text,
    ).toBe(text);

    expect(() =>
      validateSubmission(
        makeSubmission({
          provenance: {
            prompt: {
              status: "published",
              text: "unsafe\u0000prompt",
              note: "Prompt contains a NUL.",
            },
          },
        }),
      ),
    ).toThrow(/control characters/);
    expect(() =>
      validateSubmission(
        makeSubmission({
          provenance: {
            prompt: {
              status: "published",
              text: " \n\t\r ",
              note: "Prompt is only whitespace.",
            },
          },
        }),
      ),
    ).toThrow(/all whitespace/);
  });

  it("rejects contributor artifact fields and any unknown schema field", () => {
    expect(() =>
      validateSubmission({
        ...makeSubmission(),
        artifact: {
          embedUrl: "https://attacker.example/game",
          digest: `sha256:${"a".repeat(64)}`,
        },
      }),
    ).toThrow(/unknown field "artifact"/);
  });

  it("exports strict identity patterns", () => {
    expect(
      GITHUB_REPOSITORY_PATTERN.test(
        "https://github.com/Example-Org/night_drive.js",
      ),
    ).toBe(true);
    expect(DIGEST_PATTERN.test(`sha256:${"a".repeat(64)}`)).toBe(true);
    expect(DIGEST_PATTERN.test("a".repeat(64))).toBe(false);
  });
});
