import { MAX_PUBLIC_REGISTRY_BYTES, STATIC_LIMITS } from "./constants.mjs";
import { invariant } from "./errors.mjs";

const MAXIMUM_ARTIFACT_PLACEHOLDER = Object.freeze({
  digest: `sha256:${"f".repeat(64)}`,
  manifestDigest: `sha256:${"f".repeat(64)}`,
  entryPath: "index.html",
  fileCount: STATIC_LIMITS.maxFiles,
  bytes: STATIC_LIMITS.maxTotalBytes,
});

export function serializePublicRegistry(
  values,
  { placeholderArtifacts = false } = {},
) {
  const games = values
    .map((value) => value.submission ?? value)
    .map((record) =>
      projectPublicGame(record, {
        artifact: placeholderArtifacts
          ? MAXIMUM_ARTIFACT_PLACEHOLDER
          : record.artifact,
      }),
    )
    .sort((left, right) => Buffer.from(left.id).compare(Buffer.from(right.id)));
  const bytes = Buffer.from(
    `${JSON.stringify({ schemaVersion: 1, games }, null, 2)}\n`,
    "utf8",
  );
  assertPublicRegistryBytes(bytes);
  return Object.freeze({ games: Object.freeze(games), bytes });
}

export function assertPublicRegistryBytes(
  bytes,
  label = "public registry.json",
) {
  invariant(Buffer.isBuffer(bytes), `${label} must be serialized bytes`);
  invariant(
    bytes.length <= MAX_PUBLIC_REGISTRY_BYTES,
    `${label} exceeds ${MAX_PUBLIC_REGISTRY_BYTES} bytes`,
  );
}

function projectPublicGame(record, { artifact }) {
  invariant(artifact, `Missing artifact metadata for ${record.id}`);
  return {
    id: record.id,
    title: record.title,
    tagline: record.tagline,
    description: record.description,
    model: record.model ?? record.provenance.model,
    builtOn: record.builtOn ?? record.provenance.builtOn,
    source: record.source,
    artifact,
    lineage: record.lineage,
    provenance: record.provenance,
    licenses: record.licenses,
    features: record.features,
    presentation: record.presentation,
  };
}
