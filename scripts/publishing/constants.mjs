export const SUBMISSION_SCHEMA_VERSION = 1;
export const PLAN_SCHEMA_VERSION = 1;
export const PUBLISHED_RECORD_SCHEMA_VERSION = 1;

export const REQUIRED_NODE_MAJOR = 24;
export const REQUIRED_PNPM_VERSION = "11.7.0";
export const BUILD_COMMAND = ["corepack", "pnpm", "run", "build:mirage"];
export const INSTALL_COMMAND = [
  "corepack",
  "pnpm",
  "install",
  "--frozen-lockfile",
];

export const DEFAULT_BUILDER_IMAGE =
  "node:24.14.0-bookworm@sha256:5a593d74b632d1c6f816457477b6819760e13624455d587eef0fa418c8d0777b";

export const STATIC_LIMITS = Object.freeze({
  maxFiles: 5_000,
  maxTotalBytes: 100 * 1024 * 1024,
  maxFileBytes: 4 * 1024 * 1024,
  maxPathBytes: 512,
  maxDepth: 20,
});

// The gallery crosses a React Server Component boundary. Reserve enough
// headroom for worst-case HTML escaping and Flight framing below Vercel's
// response limit until heavy records move behind lazy per-game requests.
export const MAX_PUBLIC_REGISTRY_BYTES = 256 * 1024;
export const MAX_ARTIFACT_MANIFEST_BYTES = 8 * 1024 * 1024;

export const DOCKER_LIMITS = Object.freeze({
  cpus: "2",
  memory: "2g",
  pids: "256",
  timeoutMs: 10 * 60 * 1000,
  maxLogBytes: 10 * 1024 * 1024,
});

export const ARTIFACT_VERCEL_CONFIG = Object.freeze({
  git: {
    deploymentEnabled: {
      "mirage-artifacts": false,
    },
  },
});

export const FIXED_MTIME = new Date("2000-01-01T00:00:00.000Z");
