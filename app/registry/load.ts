import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseRegistryDocument, type PublishedGame } from "./schema";

export const MAX_REGISTRY_BYTES = 256 * 1024;
const SUBMISSION_SCHEMA_VERSION = 2;

export type RegistryLoadResult =
  | {
      kind: "ready";
      games: readonly PublishedGame[];
      message: null;
    }
  | {
      kind: "empty";
      games: readonly [];
      message: string;
    }
  | {
      kind: "unavailable";
      games: readonly [];
      message: string;
    };

export async function loadPublishedRegistry(options?: {
  directory?: string;
  records?: readonly unknown[];
}): Promise<RegistryLoadResult> {
  try {
    const records =
      options?.records ??
      (await readSubmissionRecords(
        options?.directory ?? path.join(process.cwd(), "submissions"),
      ));
    const document = parseRegistryDocument({
      schemaVersion: 1,
      games: records.map(projectSubmission),
    });

    if (document.games.length === 0) {
      return {
        kind: "empty",
        games: [],
        message:
          "No accepted runs yet. Give a coding agent a brand-new repository, deploy its game, and submit the source and live URL.",
      };
    }

    return {
      kind: "ready",
      games: document.games,
      message: null,
    };
  } catch {
    return {
      kind: "unavailable",
      games: [],
      message:
        "The MirageML Bench submission registry could not be verified. No benchmark run will be substituted.",
    };
  }
}

async function readSubmissionRecords(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  const records: unknown[] = [];
  let bytes = 0;

  for (const name of names) {
    const source = await readFile(path.join(directory, name));
    bytes += source.byteLength;
    if (bytes > MAX_REGISTRY_BYTES) {
      throw new Error("Submission registry exceeds its byte limit");
    }
    records.push(JSON.parse(source.toString("utf8")));
  }

  return records;
}

function projectSubmission(value: unknown) {
  if (
    !isPlainObject(value) ||
    value.schemaVersion !== SUBMISSION_SCHEMA_VERSION
  ) {
    throw new Error(
      `Submission schemaVersion must equal ${SUBMISSION_SCHEMA_VERSION}`,
    );
  }
  if (!isPlainObject(value.provenance)) {
    throw new Error("Submission provenance must be an object");
  }

  const record = { ...value };
  delete record.schemaVersion;
  return {
    ...record,
    model: value.provenance.model,
    builtOn: value.provenance.builtOn,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
