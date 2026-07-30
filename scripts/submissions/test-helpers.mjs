import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sha256 } from "./json.mjs";

export const TEST_COMMIT = "1".repeat(40);
export const TEST_SEED_DIGEST = `sha256:${"3".repeat(64)}`;
export const TEST_PARENT_SOURCE = Object.freeze({
  repositoryUrl: "https://github.com/example/parent-game",
  commit: "4".repeat(40),
});

export function makeSubmission(overrides = {}) {
  const submission = {
    schemaVersion: 2,
    id: "night-drive-001",
    title: "Night Drive",
    tagline: "One city, one clean attempt",
    description: "A complete browser driving game.",
    features: ["Driving", "Mission loop"],
    source: {
      repositoryUrl: "https://github.com/example/night-drive",
      commit: TEST_COMMIT,
    },
    deployment: {
      url: "https://example.github.io/night-drive/",
      provider: "GitHub Pages",
    },
    lineage: {
      kind: "independent",
      seedDigest: TEST_SEED_DIGEST,
    },
    provenance: {
      builtOn: "2026-07-29",
      model: "example-model",
      modelSnapshot: "example-model-2026-07-29",
      reasoning: "high",
      harness: "Codex",
      tools: ["apply_patch", "browser"],
      agentCount: 1,
      subagentCount: 0,
      humanInterventions: 0,
      prompt: {
        status: "published",
        text: "Build a complete browser driving game.",
        note: "Exact prompt preserved.",
      },
    },
    licenses: {
      code: "Apache-2.0",
      assetStatement: "All visual assets are original procedural geometry.",
      assets: [],
    },
    presentation: {
      coverPath: "assets/cover.webp",
      coverAlt: "A procedural car driving through a city at night",
      controls: ["WASD to drive"],
      limitations: ["Desktop browsers are best tested"],
      protocolVersion: 1,
    },
  };
  const result = deepMerge(submission, overrides);
  if (overrides.id && !overrides.deployment) {
    result.deployment.url = `https://example.github.io/${result.id}/`;
  }
  if (overrides.lineage) {
    result.lineage = structuredClone(overrides.lineage);
  }
  return result;
}

export async function createTemporaryDirectory(
  prefix = "mirage-submission-test-",
) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeSubmission(root, submission = makeSubmission()) {
  const relativePath = `submissions/${submission.id}.json`;
  const absolutePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const source = `${JSON.stringify(submission, null, 2)}\n`;
  await writeFile(absolutePath, source);
  return {
    path: relativePath,
    submissionDigest: `sha256:${sha256(source)}`,
    submission,
  };
}

export function initGitRepository(root) {
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "Submission Test"]);
  git(root, ["config", "user.email", "submission-test@example.com"]);
}

export function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  }).trim();
}

function deepMerge(base, overrides) {
  if (
    base !== null &&
    overrides !== null &&
    typeof base === "object" &&
    typeof overrides === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(overrides)
  ) {
    const result = structuredClone(base);
    for (const [key, value] of Object.entries(overrides)) {
      result[key] = key in result ? deepMerge(result[key], value) : value;
    }
    return result;
  }
  return structuredClone(overrides);
}
