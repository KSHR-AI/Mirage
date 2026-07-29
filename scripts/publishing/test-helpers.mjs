import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sha256 } from "./json.mjs";

export const TEST_COMMIT = "1".repeat(40);
export const TEST_HEAD = "2".repeat(40);
export const TEST_SEED_DIGEST = `sha256:${"3".repeat(64)}`;
export const TEST_PARENT_SOURCE = Object.freeze({
  repositoryUrl: "https://github.com/example/parent-game",
  commit: "4".repeat(40),
});

export function makeSubmission(overrides = {}) {
  const submission = {
    schemaVersion: 1,
    id: "night-drive-001",
    title: "Night Drive",
    tagline: "One city, one clean attempt",
    description: "A complete browser driving game.",
    features: ["Driving", "Mission loop"],
    source: {
      repositoryUrl: "https://github.com/example/night-drive",
      commit: TEST_COMMIT,
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
  if (overrides.lineage) {
    result.lineage = structuredClone(overrides.lineage);
  }
  return result;
}

export async function createTemporaryDirectory(
  prefix = "mirage-publishing-test-",
) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeValidDist(sourceDirectory, options = {}) {
  const dist = path.join(sourceDirectory, "dist");
  await mkdir(path.join(dist, "assets"), { recursive: true });
  const html =
    options.html ??
    [
      "<!doctype html>",
      '<link rel="stylesheet" href="./assets/game.css">',
      '<img src="./assets/cover.webp" alt="">',
      '<script type="module" src="./assets/game.js"></script>',
      "",
    ].join("\n");
  await writeFile(path.join(dist, "index.html"), html);
  await writeFile(
    path.join(dist, "assets", "game.css"),
    'body{background-image:url("./cover.webp")}\n',
  );
  await writeFile(
    path.join(dist, "assets", "game.js"),
    "document.body.dataset.ready = 'true';\n",
  );
  await writeFile(
    path.join(dist, "assets", "cover.webp"),
    Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x57, 0x45, 0x42, 0x50]),
  );
  return dist;
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

export function makePlan(entry, overrides = {}) {
  return {
    schemaVersion: 1,
    mode: "all",
    base: null,
    head: TEST_HEAD,
    submissions: [entry],
    removed: [],
    ...overrides,
  };
}

export function initGitRepository(root) {
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "Publishing Test"]);
  git(root, ["config", "user.email", "publishing-test@example.com"]);
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

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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
