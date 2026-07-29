import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { invariant, PublishingError } from "./errors.mjs";

export function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function readJson(filePath, label = filePath) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    throw new PublishingError(`Could not read ${label}: ${error.message}`);
  }

  try {
    return { value: JSON.parse(source), source };
  } catch (error) {
    throw new PublishingError(`Invalid JSON in ${label}: ${error.message}`);
  }
}

export async function writeJsonAtomic(filePath, value) {
  const parent = path.dirname(filePath);
  await mkdir(parent, { recursive: true });
  const temporaryPath = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const source = canonicalJson(value);

  try {
    await writeFile(temporaryPath, source, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644,
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function assertPlainObject(value, label) {
  invariant(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value;
}

export function assertExactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    invariant(allowed.has(key), `${label} contains unknown field "${key}"`);
  }
  for (const key of required) {
    invariant(
      Object.hasOwn(value, key),
      `${label} is missing required field "${key}"`,
    );
  }
}

export function assertString(value, label, { min = 1, max = 10_000 } = {}) {
  invariant(typeof value === "string", `${label} must be a string`);
  invariant(
    value.length >= min && value.length <= max,
    `${label} must contain ${min}-${max} characters`,
  );
  invariant(value.trim() === value, `${label} must not have outer whitespace`);
  invariant(
    !/[\u0000-\u001f\u007f]/.test(value),
    `${label} has control characters`,
  );
  return value;
}

export function assertNullableString(value, label, options = {}) {
  return value === null ? null : assertString(value, label, options);
}

export function assertInteger(
  value,
  label,
  { min = 0, max = Number.MAX_SAFE_INTEGER, nullable = false } = {},
) {
  if (nullable && value === null) return null;
  invariant(
    Number.isSafeInteger(value) && value >= min && value <= max,
    `${label} must be an integer from ${min} to ${max}`,
  );
  return value;
}

export function assertStringArray(
  value,
  label,
  { minItems = 0, maxItems = 100, itemMax = 500 } = {},
) {
  invariant(Array.isArray(value), `${label} must be an array`);
  invariant(
    value.length >= minItems && value.length <= maxItems,
    `${label} must contain ${minItems}-${maxItems} items`,
  );
  const result = value.map((item, index) =>
    assertString(item, `${label}[${index}]`, { max: itemMax }),
  );
  invariant(new Set(result).size === result.length, `${label} has duplicates`);
  return result;
}
