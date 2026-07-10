import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const assetRoot = path.join(root, "public/game-assets");
const manifestPath = path.join(assetRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const errors = [];
const registeredPaths = new Set();
const ids = new Set();

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

function validHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

requireValue(manifest.version === 1, "manifest.version must be 1");
requireValue(
  !Number.isNaN(Date.parse(manifest.generatedAt)),
  "manifest.generatedAt must be an ISO date",
);
requireValue(
  Array.isArray(manifest.entries),
  "manifest.entries must be an array",
);
requireValue(
  manifest.policy?.commercialUseRequired === true,
  "manifest policy must require commercial use",
);
requireValue(
  manifest.policy?.unknownLicensesAllowed === false,
  "manifest policy must reject unknown licenses",
);

for (const entry of manifest.entries ?? []) {
  const prefix = `asset ${entry.id ?? "<missing-id>"}`;
  requireValue(
    typeof entry.id === "string" && entry.id.length > 0,
    `${prefix}: missing id`,
  );
  requireValue(!ids.has(entry.id), `${prefix}: duplicate id`);
  ids.add(entry.id);
  requireValue(
    typeof entry.name === "string" && entry.name.length > 0,
    `${prefix}: missing name`,
  );
  requireValue(
    typeof entry.kind === "string" && entry.kind.length > 0,
    `${prefix}: missing kind`,
  );
  requireValue(
    validHttpsUrl(entry.source?.pageUrl),
    `${prefix}: source.pageUrl must use HTTPS`,
  );
  requireValue(
    Array.isArray(entry.source?.authors) && entry.source.authors.length > 0,
    `${prefix}: authors are required`,
  );
  requireValue(
    typeof entry.license?.spdx === "string",
    `${prefix}: SPDX license is required`,
  );
  requireValue(
    validHttpsUrl(entry.license?.url),
    `${prefix}: license URL must use HTTPS`,
  );
  requireValue(
    entry.license?.commercialUse === true,
    `${prefix}: commercial use must be allowed`,
  );
  requireValue(
    entry.license?.redistributableInLargerWork === true,
    `${prefix}: redistribution in a larger work must be allowed`,
  );
  requireValue(
    typeof entry.license?.attributionRequired === "boolean",
    `${prefix}: attributionRequired must be explicit`,
  );
  requireValue(
    typeof entry.license?.attributionRequirements === "string",
    `${prefix}: attribution requirements must be documented`,
  );
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(entry.acquiredAt),
    `${prefix}: acquiredAt must be YYYY-MM-DD`,
  );
  requireValue(
    Array.isArray(entry.modifications),
    `${prefix}: modifications must be an array`,
  );
  requireValue(
    Array.isArray(entry.files) && entry.files.length > 0,
    `${prefix}: files are required`,
  );

  for (const file of entry.files ?? []) {
    const relative = path.normalize(file.path);
    const filePrefix = `${prefix} file ${relative}`;
    requireValue(
      relative.startsWith(`public${path.sep}game-assets${path.sep}`) &&
        !relative.includes(`..${path.sep}`),
      `${filePrefix}: path must stay inside public/game-assets`,
    );
    requireValue(
      !registeredPaths.has(relative),
      `${filePrefix}: file is registered twice`,
    );
    registeredPaths.add(relative);
    const absolute = path.join(root, relative);
    try {
      const metadata = await stat(absolute);
      requireValue(metadata.isFile(), `${filePrefix}: path is not a file`);
      requireValue(
        metadata.size === file.bytes,
        `${filePrefix}: byte count does not match`,
      );
      requireValue(
        (await sha256(absolute)) === file.sha256,
        `${filePrefix}: SHA-256 does not match`,
      );
      requireValue(
        metadata.size <= 8 * 1024 * 1024,
        `${filePrefix}: exceeds the 8 MiB browser asset budget`,
      );
    } catch (error) {
      errors.push(`${filePrefix}: ${error.message}`);
    }
  }
}

for (const absolute of await walk(assetRoot)) {
  const relative = path.relative(root, absolute);
  if (relative === "public/game-assets/manifest.json") continue;
  requireValue(
    registeredPaths.has(relative),
    `unregistered game asset: ${relative}`,
  );
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  const count = [...registeredPaths].length;
  console.log(
    `Validated ${manifest.entries.length} asset entries and ${count} files.`,
  );
}
