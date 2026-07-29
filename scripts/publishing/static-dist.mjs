import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  lstat,
  open,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { MAX_ARTIFACT_MANIFEST_BYTES, STATIC_LIMITS } from "./constants.mjs";
import { invariant, PublishingError } from "./errors.mjs";

const FORBIDDEN_FILE_NAMES = new Set([
  ".htaccess",
  "_headers",
  "_redirects",
  "app.yaml",
  "firebase.json",
  "netlify.toml",
  "nginx.conf",
  "now.json",
  "server.cjs",
  "server.js",
  "server.mjs",
  "vercel.json",
  "web.config",
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.toml",
]);

const FORBIDDEN_PATH_SEGMENTS = new Set([
  ".netlify",
  ".vercel",
  "api",
  "cgi-bin",
  "functions",
]);

const FORBIDDEN_EXTENSIONS = new Set([
  ".bash",
  ".bat",
  ".cgi",
  ".cmd",
  ".com",
  ".dll",
  ".dylib",
  ".exe",
  ".php",
  ".pl",
  ".ps1",
  ".py",
  ".rb",
  ".sh",
  ".so",
  ".map",
]);

const SERVED_EXTENSIONS = new Set([
  ".aac",
  ".avif",
  ".bin",
  ".css",
  ".gif",
  ".glb",
  ".gltf",
  ".htm",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".m4a",
  ".mjs",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".png",
  ".svg",
  ".ttf",
  ".txt",
  ".wasm",
  ".wav",
  ".webm",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".htm",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

const HTML_ROOT_REFERENCE =
  /\b(?:action|data|href|poster|src|srcset)\s*=\s*["']\s*\/(?!\/)/i;
const CSS_ROOT_REFERENCE =
  /(?:url\(\s*["']?|@import\s+(?:url\(\s*)?["'])\/(?!\/)/i;
const JAVASCRIPT_ROOT_REFERENCE =
  /(?:\b(?:import|export)\b[^"'`]{0,120}\bfrom\s*|import\s*\(\s*|new\s+URL\s*\(\s*)["'`]\/(?!\/)|["'`]\/(?:assets?|audio|chunks?|fonts?|images?|static|video)\//i;
const JSON_ROOT_REFERENCE =
  /"(?:href|scope|src|start_url|url)"\s*:\s*"\/(?!\/)/i;
const SERVICE_WORKER_REGISTRATION =
  /(?:navigator\s*(?:\.\s*serviceWorker|\[\s*["']serviceWorker["']\s*\])|serviceWorker)\s*(?:\.\s*register|\[\s*["']register["']\s*\])/i;
const PRIVATE_KEY_MATERIAL =
  /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/;
const TOKEN_MATERIAL =
  /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/;

export async function inspectStaticDist(
  distDirectory,
  { limits = STATIC_LIMITS } = {},
) {
  const requestedRoot = path.resolve(distDirectory);
  const rootStats = await safeLstat(requestedRoot, "Static output directory");
  invariant(
    rootStats.isDirectory() && !rootStats.isSymbolicLink(),
    "Static output must be a real directory, not a link or special file",
  );
  const rootPath = await realpath(requestedRoot);

  const files = [];
  const caseFoldedPaths = new Set();
  let totalBytes = 0;

  async function walk(directoryPath, relativeDirectory, depth) {
    invariant(
      depth <= limits.maxDepth,
      `Static output exceeds maximum depth ${limits.maxDepth}`,
    );
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) =>
      Buffer.from(left.name).compare(Buffer.from(right.name)),
    );

    for (const entry of entries) {
      validatePathSegment(entry.name);
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      validateRelativeArtifactPath(relativePath, limits);

      const absolutePath = path.join(directoryPath, entry.name);
      assertInsideRoot(rootPath, absolutePath);
      const stats = await safeLstat(absolutePath, relativePath);

      invariant(
        !stats.isSymbolicLink(),
        `Static output contains a symbolic link: ${relativePath}`,
      );
      if (stats.isDirectory()) {
        invariant(
          !FORBIDDEN_PATH_SEGMENTS.has(entry.name.toLowerCase()),
          `Static output contains forbidden server directory: ${relativePath}`,
        );
        await walk(absolutePath, relativePath, depth + 1);
        continue;
      }

      invariant(
        stats.isFile(),
        `Static output contains a socket, device, FIFO, or other special file: ${relativePath}`,
      );
      invariant(
        stats.nlink === 1,
        `Static output contains a hard-linked file: ${relativePath}`,
      );
      invariant(
        (stats.mode & 0o111) === 0,
        `Static output contains an executable file: ${relativePath}`,
      );
      validateFileName(relativePath);
      invariant(
        stats.size <= limits.maxFileBytes,
        `Static file exceeds ${limits.maxFileBytes} bytes: ${relativePath}`,
      );
      invariant(
        files.length + 1 <= limits.maxFiles,
        `Static output exceeds ${limits.maxFiles} files`,
      );
      totalBytes += stats.size;
      invariant(
        totalBytes <= limits.maxTotalBytes,
        `Static output exceeds ${limits.maxTotalBytes} total bytes`,
      );

      const foldedPath = relativePath.toLocaleLowerCase("en-US");
      invariant(
        !caseFoldedPaths.has(foldedPath),
        `Static output contains case-colliding paths: ${relativePath}`,
      );
      caseFoldedPaths.add(foldedPath);

      const bytes = await readStableRegularFile(
        absolutePath,
        relativePath,
        stats,
      );
      scanStaticFile(relativePath, bytes);
      files.push(
        Object.freeze({
          path: relativePath,
          bytes,
          byteLength: bytes.length,
          sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        }),
      );
    }
  }

  await walk(rootPath, "", 0);
  files.sort((left, right) =>
    Buffer.from(left.path).compare(Buffer.from(right.path)),
  );

  const index = files.find((file) => file.path === "index.html");
  invariant(index, "Static output must contain dist/index.html");
  invariant(index.byteLength > 0, "dist/index.html must not be empty");

  return Object.freeze({
    rootPath,
    files: Object.freeze(files),
    fileCount: files.length,
    totalBytes,
    artifactDigest: computeArtifactDigest(files),
  });
}

export function buildArtifactManifest(inspection) {
  return {
    schemaVersion: 1,
    artifactDigest: inspection.artifactDigest,
    fileCount: inspection.fileCount,
    bytes: inspection.totalBytes,
    files: inspection.files.map((file) => ({
      path: file.path,
      bytes: file.byteLength,
      sha256: file.sha256,
    })),
  };
}

export function serializeArtifactManifest(manifest) {
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  assertArtifactManifestBytes(bytes);
  return bytes;
}

export function assertArtifactManifestBytes(
  bytes,
  label = "artifact manifest",
) {
  invariant(Buffer.isBuffer(bytes), `${label} must be serialized bytes`);
  invariant(
    bytes.length <= MAX_ARTIFACT_MANIFEST_BYTES,
    `${label} exceeds ${MAX_ARTIFACT_MANIFEST_BYTES} bytes`,
  );
}

export function digestArtifactManifest(manifestBytes) {
  return `sha256:${createHash("sha256").update(manifestBytes).digest("hex")}`;
}

export function computeArtifactDigest(files) {
  const hash = createHash("sha256");
  hash.update("mirage-static-directory-v1\0", "utf8");

  for (const file of files) {
    const pathBytes = Buffer.from(file.path, "utf8");
    const header = Buffer.alloc(12);
    header.writeUInt32BE(pathBytes.length, 0);
    header.writeBigUInt64BE(BigInt(file.byteLength), 4);
    hash.update(header);
    hash.update(pathBytes);
    hash.update(file.bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}

function validatePathSegment(name) {
  invariant(
    name !== "." && name !== "..",
    "Static path contains dot traversal",
  );
  invariant(name === name.normalize("NFC"), `Static path is not NFC: ${name}`);
  invariant(
    !name.startsWith("."),
    `Static output contains a hidden path: ${name}`,
  );
  invariant(
    !/[\\/\u0000-\u001f\u007f]/.test(name),
    `Static path contains unsafe characters: ${JSON.stringify(name)}`,
  );
}

function validateRelativeArtifactPath(relativePath, limits) {
  invariant(
    !path.posix.isAbsolute(relativePath) &&
      path.posix.normalize(relativePath) === relativePath &&
      !relativePath.split("/").includes(".."),
    `Static path escapes dist/: ${relativePath}`,
  );
  invariant(
    Buffer.byteLength(relativePath, "utf8") <= limits.maxPathBytes,
    `Static path exceeds ${limits.maxPathBytes} bytes: ${relativePath}`,
  );
}

function validateFileName(relativePath) {
  const baseName = path.posix.basename(relativePath).toLowerCase();
  const extension = path.posix.extname(baseName);
  invariant(
    !FORBIDDEN_FILE_NAMES.has(baseName),
    `Static output contains forbidden server configuration: ${relativePath}`,
  );
  invariant(
    !FORBIDDEN_EXTENSIONS.has(extension),
    `Static output contains forbidden executable/server file: ${relativePath}`,
  );
  invariant(
    SERVED_EXTENSIONS.has(extension),
    `Static output uses an unsupported served extension: ${relativePath}`,
  );
  invariant(
    !isServiceWorkerName(baseName),
    `Static output contains a service worker: ${relativePath}`,
  );
}

function isServiceWorkerName(baseName) {
  return (
    /^(?:service[-_.]?worker|sw)(?:\.[a-z0-9_-]+)*\.(?:js|mjs)$/.test(
      baseName,
    ) || /^workbox(?:[-_.][a-z0-9_-]+)*\.js$/.test(baseName)
  );
}

function scanStaticFile(relativePath, bytes) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) return;
  const source = bytes.toString("utf8");
  invariant(
    !source.includes("\u0000"),
    `Text artifact contains NUL bytes: ${relativePath}`,
  );
  invariant(
    !SERVICE_WORKER_REGISTRATION.test(source),
    `Static artifact registers a service worker: ${relativePath}`,
  );
  invariant(
    !PRIVATE_KEY_MATERIAL.test(source) && !TOKEN_MATERIAL.test(source),
    `Static artifact appears to contain private key or access-token material: ${relativePath}`,
  );

  let hasRootReference = false;
  if (extension === ".html" || extension === ".htm" || extension === ".svg") {
    hasRootReference =
      HTML_ROOT_REFERENCE.test(source) || CSS_ROOT_REFERENCE.test(source);
  } else if (extension === ".css") {
    hasRootReference = CSS_ROOT_REFERENCE.test(source);
  } else if (
    extension === ".js" ||
    extension === ".mjs" ||
    extension === ".jsx"
  ) {
    hasRootReference = JAVASCRIPT_ROOT_REFERENCE.test(source);
  } else if (extension === ".json" || extension === ".webmanifest") {
    hasRootReference = JSON_ROOT_REFERENCE.test(source);
  }
  invariant(
    !hasRootReference,
    `Static artifact contains a root-absolute asset reference: ${relativePath}`,
  );
}

async function readStableRegularFile(
  absolutePath,
  relativePath,
  expectedStats,
) {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(absolutePath, flags);
    const before = await handle.stat();
    invariant(
      before.isFile() &&
        before.nlink === 1 &&
        before.dev === expectedStats.dev &&
        before.ino === expectedStats.ino &&
        before.size === expectedStats.size,
      `Static file changed during validation: ${relativePath}`,
    );
    const bytes = await handle.readFile();
    const after = await handle.stat();
    invariant(
      after.dev === before.dev &&
        after.ino === before.ino &&
        after.size === before.size &&
        bytes.length === before.size,
      `Static file changed while being read: ${relativePath}`,
    );
    return bytes;
  } finally {
    await handle?.close();
  }
}

async function safeLstat(filePath, label) {
  try {
    return await lstat(filePath);
  } catch (error) {
    throw new PublishingError(`Could not inspect ${label}: ${error.message}`);
  }
}

function assertInsideRoot(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  invariant(
    relative !== "" &&
      !relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative),
    `Static path resolves outside dist/: ${candidatePath}`,
  );
}
