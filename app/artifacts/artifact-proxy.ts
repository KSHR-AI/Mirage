import { createHash } from "node:crypto";
import {
  isCommit,
  isDigestHex,
  isGameId,
  isSafeArtifactPath,
  type PublishedGame,
} from "../registry/schema";
import { getArtifactDigestHex } from "../registry/urls";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_MANIFEST_FILES = 5_000;
const MAX_MANIFEST_TOTAL_BYTES = 100 * 1024 * 1024;
// The proxy verifies complete bytes before responding. Stay below the
// production function response ceiling, including platform overhead.
export const MAX_ARTIFACT_FILE_BYTES = 4 * 1024 * 1024;

const SAFE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".aac": "audio/aac",
  ".avif": "image/avif",
  ".bin": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

export const ARTIFACT_CONTENT_SECURITY_POLICY = [
  "sandbox allow-scripts allow-pointer-lock",
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  // Static games may fetch their own WASM, GLTF, or JSON. The iframe's opaque
  // sandbox origin prevents these requests from carrying Mirage credentials.
  "connect-src 'self'",
  "worker-src 'none'",
  "child-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "navigate-to 'none'",
].join("; ");

export const ARTIFACT_PERMISSIONS_POLICY = [
  "accelerometer=()",
  "ambient-light-sensor=()",
  "autoplay=(self)",
  "battery=()",
  "camera=()",
  "clipboard-read=()",
  "clipboard-write=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "gamepad=(self)",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "idle-detection=()",
  "local-fonts=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "serial=()",
  "speaker-selection=()",
  "storage-access=()",
  "usb=()",
  "web-share=()",
  "window-management=()",
  "xr-spatial-tracking=()",
].join(", ");

export type ArtifactRouteParams = {
  id: string;
  commit: string;
  digest: string;
  path: readonly string[];
};

export type MatchedArtifactRequest = {
  game: PublishedGame;
  path: string;
};

export type ArtifactManifestFile = {
  path: string;
  bytes: number;
  sha256: `sha256:${string}`;
};

export type ArtifactManifest = {
  schemaVersion: 1;
  artifactDigest: `sha256:${string}`;
  fileCount: number;
  bytes: number;
  files: readonly ArtifactManifestFile[];
};

export function matchArtifactRequest(
  games: readonly PublishedGame[],
  params: ArtifactRouteParams,
): MatchedArtifactRequest | null {
  if (
    !isGameId(params.id) ||
    !isCommit(params.commit) ||
    !isDigestHex(params.digest) ||
    params.path.length === 0
  ) {
    return null;
  }

  const path = params.path.join("/");
  if (!isSafeArtifactPath(path) || getSafeContentType(path) === null) {
    return null;
  }

  const game = games.find((candidate) => candidate.id === params.id);
  if (
    !game ||
    game.source.commit !== params.commit ||
    getArtifactDigestHex(game.artifact) !== params.digest
  ) {
    return null;
  }

  return { game, path };
}

export function getRawArtifactUrl(
  registryUrl: string,
  match: MatchedArtifactRequest,
) {
  const registry = new URL(registryUrl);
  assertRegistryUrl(registry);
  const registryDirectory = getRegistryDirectory(registry);
  const digest = getArtifactDigestHex(match.game.artifact);
  const remoteSegments = [
    "artifacts",
    match.game.id,
    match.game.source.commit,
    digest,
    ...match.path.split("/"),
  ];

  registry.pathname =
    registryDirectory +
    remoteSegments.map((segment) => encodeURIComponent(segment)).join("/");
  return registry;
}

export function getRawArtifactManifestUrl(
  registryUrl: string,
  game: PublishedGame,
) {
  const registry = new URL(registryUrl);
  assertRegistryUrl(registry);
  const digest = getArtifactDigestHex(game.artifact);
  const remoteSegments = [
    "manifests",
    game.id,
    game.source.commit,
    `${digest}.json`,
  ];
  registry.pathname =
    getRegistryDirectory(registry) +
    remoteSegments.map((segment) => encodeURIComponent(segment)).join("/");
  return registry;
}

export function parseAndVerifyArtifactManifest(
  rawBytes: ArrayBuffer,
  game: PublishedGame,
): ArtifactManifest {
  if (sha256Digest(rawBytes) !== game.artifact.manifestDigest) {
    throw new Error("Artifact manifest digest mismatch");
  }

  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBytes),
    );
  } catch {
    throw new Error("Artifact manifest is not valid UTF-8 JSON");
  }
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "artifactDigest",
      "fileCount",
      "bytes",
      "files",
    ]) ||
    value.schemaVersion !== 1 ||
    value.artifactDigest !== game.artifact.digest ||
    value.fileCount !== game.artifact.fileCount ||
    value.bytes !== game.artifact.bytes ||
    !Array.isArray(value.files)
  ) {
    throw new Error("Artifact manifest metadata mismatch");
  }
  if (
    !Number.isSafeInteger(value.fileCount) ||
    value.fileCount < 1 ||
    value.fileCount > MAX_MANIFEST_FILES ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 1 ||
    value.bytes > MAX_MANIFEST_TOTAL_BYTES ||
    value.files.length !== value.fileCount
  ) {
    throw new Error("Artifact manifest limits are invalid");
  }

  const files = value.files.map((file, index) =>
    parseManifestFile(file, index),
  );
  for (let index = 1; index < files.length; index += 1) {
    if (
      Buffer.from(files[index - 1].path).compare(
        Buffer.from(files[index].path),
      ) >= 0
    ) {
      throw new Error(
        "Artifact manifest files must be uniquely sorted by path",
      );
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (
    totalBytes !== value.bytes ||
    !files.some((file) => file.path === game.artifact.entryPath)
  ) {
    throw new Error("Artifact manifest contents do not match its totals");
  }

  return {
    schemaVersion: 1,
    artifactDigest: value.artifactDigest as `sha256:${string}`,
    fileCount: value.fileCount,
    bytes: value.bytes,
    files,
  };
}

export function sha256Digest(value: ArrayBuffer) {
  return `sha256:${createHash("sha256")
    .update(new Uint8Array(value))
    .digest("hex")}` as const;
}

export function verifyArtifactFile(
  value: ArrayBuffer,
  file: ArtifactManifestFile,
) {
  return value.byteLength === file.bytes && sha256Digest(value) === file.sha256;
}

export function getSafeContentType(path: string) {
  const fileName = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex < 0) return null;
  return SAFE_CONTENT_TYPES[fileName.slice(extensionIndex)] ?? null;
}

export function createArtifactHeaders(
  contentType: string,
  contentLength: number,
) {
  return new Headers({
    // The sandbox deliberately gives games an opaque origin. Public immutable
    // module, WASM, and fetch subresources therefore require CORS, while the
    // absence of Allow-Credentials keeps Mirage state outside that boundary.
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": String(contentLength),
    "Content-Security-Policy": ARTIFACT_CONTENT_SECURITY_POLICY,
    "Content-Type": contentType,
    "Permissions-Policy": ARTIFACT_PERMISSIONS_POLICY,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Permitted-Cross-Domain-Policies": "none",
  });
}

export function createArtifactErrorResponse(status: number, message: string) {
  const body = `${message}\n`;
  const headers = createArtifactHeaders(
    "text/plain; charset=utf-8",
    new TextEncoder().encode(body).byteLength,
  );
  headers.set("Cache-Control", "private, no-store");
  return new Response(body, { status, headers });
}

function parseManifestFile(
  value: unknown,
  index: number,
): ArtifactManifestFile {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, ["path", "bytes", "sha256"]) ||
    typeof value.path !== "string" ||
    !isSafeArtifactPath(value.path) ||
    getSafeContentType(value.path) === null ||
    typeof value.bytes !== "number" ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 0 ||
    value.bytes > MAX_ARTIFACT_FILE_BYTES ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256)
  ) {
    throw new Error(`Artifact manifest file ${index} is invalid`);
  }
  return {
    path: value.path,
    bytes: value.bytes,
    sha256: value.sha256 as `sha256:${string}`,
  };
}

function assertRegistryUrl(registry: URL) {
  if (
    registry.protocol !== "https:" ||
    registry.username !== "" ||
    registry.password !== "" ||
    registry.port !== "" ||
    registry.search !== "" ||
    registry.hash !== "" ||
    !registry.pathname.endsWith(".json")
  ) {
    throw new Error("Invalid registry URL");
  }
}

function getRegistryDirectory(registry: URL) {
  return registry.pathname.slice(0, registry.pathname.lastIndexOf("/") + 1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}
