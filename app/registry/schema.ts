const GAME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SEED_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_GAME_ID_LENGTH = 80;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_COLLECTION_LENGTH = 512;
const MAX_JSON_STRING_LENGTH = 256_000;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type GameSource = {
  repositoryUrl: string;
  commit: string;
};

export type GameDeployment = {
  url: string;
  provider: string;
};

export type GameLineage =
  | {
      kind: "independent";
      seedDigest: `sha256:${string}`;
    }
  | {
      kind: "derived";
      parentId: string;
      parentSource: GameSource;
    }
  | {
      kind: "unverified";
      note: string;
    };

export type GamePresentation = {
  coverPath: string;
  coverAlt: string;
  controls: readonly string[];
  limitations: readonly string[];
  protocolVersion: 1;
};

export type PublishedGame = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  model: string;
  builtOn: string;
  source: GameSource;
  deployment: GameDeployment;
  lineage: GameLineage;
  provenance: JsonObject;
  licenses: JsonObject;
  features: readonly string[];
  presentation: GamePresentation;
};

export type PublishedRegistry = {
  schemaVersion: 1;
  games: readonly PublishedGame[];
};

export function parseRegistryDocument(value: unknown): PublishedRegistry {
  if (!isPlainObject(value) || value.schemaVersion !== 1) {
    throw new Error("Invalid registry: schemaVersion must equal 1");
  }
  if (!Array.isArray(value.games)) {
    throw new Error("Invalid registry: games must be an array");
  }

  const games = value.games.map((game, index) => parseGame(game, index));
  const ids = new Set(games.map((game) => game.id));
  if (ids.size !== games.length) {
    throw new Error("Invalid registry: game IDs must be unique");
  }

  assertLineageGraph(games);

  return {
    schemaVersion: 1,
    games,
  };
}

function parseGame(value: unknown, index: number): PublishedGame {
  const label = `games[${index}]`;
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "id",
      "title",
      "tagline",
      "description",
      "model",
      "builtOn",
      "source",
      "deployment",
      "lineage",
      "provenance",
      "licenses",
      "features",
      "presentation",
    ])
  ) {
    throw new Error(`Invalid registry: ${label} must be an object`);
  }

  const id = requiredString(value.id, `${label}.id`, MAX_GAME_ID_LENGTH);
  if (!GAME_ID_PATTERN.test(id)) {
    throw new Error(`Invalid registry: ${label}.id is malformed`);
  }

  const title = requiredString(value.title, `${label}.title`, 160);
  const tagline = requiredString(value.tagline, `${label}.tagline`, 280);
  const description = requiredString(
    value.description,
    `${label}.description`,
    4_000,
  );
  const model = requiredString(value.model, `${label}.model`, 200);
  const builtOn = parseIsoDate(value.builtOn, `${label}.builtOn`);
  const source = parseSource(value.source, label);
  const deployment = parseDeployment(value.deployment, label);
  const lineage = parseLineage(value.lineage, id, label);
  const provenance = parseJsonObject(value.provenance, `${label}.provenance`);
  const licenses = parseJsonObject(value.licenses, `${label}.licenses`);
  const presentation = parsePresentation(value.presentation, label);
  const features = parseFeatures(value.features, label);

  // Construct a new object instead of spreading accepted records so unknown
  // fields cannot cross the server-to-client boundary.
  return {
    id,
    title,
    tagline,
    description,
    model,
    builtOn,
    source,
    deployment,
    lineage,
    provenance,
    licenses,
    features,
    presentation,
  };
}

function parseSource(value: unknown, gameLabel: string): GameSource {
  return parseSourceIdentity(value, `${gameLabel}.source`);
}

function parseSourceIdentity(value: unknown, label: string): GameSource {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, ["repositoryUrl", "commit"])
  ) {
    throw new Error(`Invalid registry: ${label} has an invalid shape`);
  }

  const repositoryUrl = requiredString(
    value.repositoryUrl,
    `${label}.repositoryUrl`,
    500,
  );
  if (!isPublicGitHubRepositoryUrl(repositoryUrl)) {
    throw new Error(
      `Invalid registry: ${label}.repositoryUrl must be a public GitHub repository`,
    );
  }

  const commit = requiredString(value.commit, `${label}.commit`, 40);
  if (!COMMIT_PATTERN.test(commit)) {
    throw new Error(
      `Invalid registry: ${label}.commit must be 40 lowercase hexadecimal characters`,
    );
  }

  return { repositoryUrl, commit };
}

function parseDeployment(value: unknown, gameLabel: string): GameDeployment {
  const label = `${gameLabel}.deployment`;
  if (!isPlainObject(value) || !hasExactKeys(value, ["url", "provider"])) {
    throw new Error(`Invalid registry: ${label} has an invalid shape`);
  }

  const url = requiredString(value.url, `${label}.url`, 2_000);
  if (!isPublicDeploymentUrl(url)) {
    throw new Error(
      `Invalid registry: ${label}.url must be an uncredentialed public HTTPS URL`,
    );
  }

  return {
    url,
    provider: requiredString(value.provider, `${label}.provider`, 100),
  };
}

function parseLineage(
  value: unknown,
  gameId: string,
  gameLabel: string,
): GameLineage {
  const label = `${gameLabel}.lineage`;
  if (!isPlainObject(value)) {
    throw new Error(`Invalid registry: ${label} must be an object`);
  }

  if (value.kind === "independent") {
    if (!hasExactKeys(value, ["kind", "seedDigest"])) {
      throw new Error(`Invalid registry: ${label} has an invalid shape`);
    }
    const seedDigest = requiredString(
      value.seedDigest,
      `${label}.seedDigest`,
      71,
    );
    if (!SEED_DIGEST_PATTERN.test(seedDigest)) {
      throw new Error(
        `Invalid registry: ${label}.seedDigest must be a lowercase SHA-256`,
      );
    }
    return {
      kind: "independent",
      seedDigest: seedDigest as `sha256:${string}`,
    };
  }

  if (value.kind === "derived") {
    if (!hasExactKeys(value, ["kind", "parentId", "parentSource"])) {
      throw new Error(`Invalid registry: ${label} has an invalid shape`);
    }
    const parentId = requiredString(
      value.parentId,
      `${label}.parentId`,
      MAX_GAME_ID_LENGTH,
    );
    if (!GAME_ID_PATTERN.test(parentId) || parentId === gameId) {
      throw new Error(`Invalid registry: ${label}.parentId is malformed`);
    }
    const parentSource = parseSourceIdentity(
      value.parentSource,
      `${label}.parentSource`,
    );
    return { kind: "derived", parentId, parentSource };
  }

  if (value.kind === "unverified") {
    if (!hasExactKeys(value, ["kind", "note"])) {
      throw new Error(`Invalid registry: ${label} has an invalid shape`);
    }
    return {
      kind: "unverified",
      note: requiredString(value.note, `${label}.note`, 2_000),
    };
  }

  throw new Error(`Invalid registry: ${label}.kind is unsupported`);
}

function parseFeatures(value: unknown, gameLabel: string): readonly string[] {
  return parseStringArray(value, `${gameLabel}.features`, 1, 30, 120);
}

function parsePresentation(
  value: unknown,
  gameLabel: string,
): GamePresentation {
  const label = `${gameLabel}.presentation`;
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "coverPath",
      "coverAlt",
      "controls",
      "limitations",
      "protocolVersion",
    ])
  ) {
    throw new Error(`Invalid registry: ${label} has an invalid shape`);
  }
  const coverPath = requiredString(value.coverPath, `${label}.coverPath`, 300);
  if (!isSafeRelativePath(coverPath) || !isSafeImagePath(coverPath)) {
    throw new Error(
      `Invalid registry: ${label}.coverPath must be a safe relative image path`,
    );
  }
  if (value.protocolVersion !== 1) {
    throw new Error(`Invalid registry: ${label}.protocolVersion must equal 1`);
  }

  return {
    coverPath,
    coverAlt: requiredString(value.coverAlt, `${label}.coverAlt`, 500),
    controls: parseStringArray(value.controls, `${label}.controls`, 1, 50, 200),
    limitations: parseStringArray(
      value.limitations,
      `${label}.limitations`,
      1,
      50,
      500,
    ),
    protocolVersion: 1,
  };
}

function parseJsonObject(value: unknown, label: string): JsonObject {
  if (!isPlainObject(value) || !isJsonValue(value, 0)) {
    throw new Error(`Invalid registry: ${label} must contain bounded JSON`);
  }
  return cloneJsonValue(value) as JsonObject;
}

function isJsonValue(value: unknown, depth: number): value is JsonValue {
  if (depth > MAX_JSON_DEPTH) return false;
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value === "string") {
    return value.length <= MAX_JSON_STRING_LENGTH;
  }
  if (Array.isArray(value)) {
    return (
      value.length <= MAX_JSON_COLLECTION_LENGTH &&
      value.every((item) => isJsonValue(item, depth + 1))
    );
  }
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_JSON_COLLECTION_LENGTH &&
    entries.every(
      ([key, item]) =>
        key.length <= 200 &&
        key !== "__proto__" &&
        key !== "prototype" &&
        key !== "constructor" &&
        isJsonValue(item, depth + 1),
    )
  );
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        cloneJsonValue(item as JsonValue),
      ]),
    );
  }
  return value;
}

function assertLineageGraph(games: readonly PublishedGame[]) {
  const byId = new Map(games.map((game) => [game.id, game]));

  for (const game of games) {
    if (game.lineage.kind === "derived") {
      const parent = byId.get(game.lineage.parentId);
      if (!parent) {
        throw new Error(
          `Invalid registry: derived game "${game.id}" references missing parent "${game.lineage.parentId}"`,
        );
      }
      if (
        parent.source.repositoryUrl !==
          game.lineage.parentSource.repositoryUrl ||
        parent.source.commit !== game.lineage.parentSource.commit
      ) {
        throw new Error(
          `Invalid registry: derived game "${game.id}" parentSource does not match "${game.lineage.parentId}"`,
        );
      }
    }
  }

  for (const game of games) {
    const visited = new Set<string>();
    let current: PublishedGame | undefined = game;
    while (current?.lineage.kind === "derived") {
      if (visited.has(current.id)) {
        throw new Error(
          `Invalid registry: lineage cycle detected at "${current.id}"`,
        );
      }
      visited.add(current.id);
      current = byId.get(current.lineage.parentId);
    }
  }
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(`Invalid registry: ${label} must be a non-empty string`);
  }
  return value;
}

function parseIsoDate(value: unknown, label: string): string {
  const date = requiredString(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid registry: ${label} must be an ISO date`);
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    !parsed.toISOString().startsWith(date)
  ) {
    throw new Error(`Invalid registry: ${label} must be a real date`);
  }
  return date;
}

function isPublicGitHubRepositoryUrl(value: string) {
  return /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(
    value,
  );
}

function isSafeImagePath(value: string) {
  return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > 512 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value !== value.normalize("NFC") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return false;
  }

  const segments = value.split("/");
  return (
    segments.length <= 20 &&
    segments.every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        segment.length > 0 &&
        !segment.startsWith(".") &&
        segment === segment.normalize("NFC") &&
        !/[\\/\u0000-\u001f\u007f]/.test(segment),
    )
  );
}

export function isGameId(value: string): boolean {
  return value.length <= MAX_GAME_ID_LENGTH && GAME_ID_PATTERN.test(value);
}

export function isCommit(value: string): boolean {
  return COMMIT_PATTERN.test(value);
}

function parseStringArray(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  itemMaximum: number,
) {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new Error(
      `Invalid registry: ${label} must contain ${minimum}-${maximum} items`,
    );
  }
  const items = value.map((item, index) =>
    requiredString(item, `${label}[${index}]`, itemMaximum),
  );
  if (new Set(items).size !== items.length) {
    throw new Error(`Invalid registry: ${label} must not contain duplicates`);
  }
  return items;
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

function isPublicDeploymentUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.hostname.includes(".") &&
      url.hostname !== "localhost" &&
      !url.hostname.endsWith(".localhost") &&
      !/^\d+(?:\.\d+){3}$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}
