import {
  createArtifactErrorResponse,
  createArtifactHeaders,
  getRawArtifactManifestUrl,
  getRawArtifactUrl,
  getSafeContentType,
  matchArtifactRequest,
  MAX_ARTIFACT_FILE_BYTES,
  parseAndVerifyArtifactManifest,
  verifyArtifactFile,
} from "../../../../artifact-proxy";
import { loadPublishedRegistry } from "../../../../../registry/load";

export const MAX_ARTIFACT_MANIFEST_BYTES = 8 * 1024 * 1024;

export const runtime = "nodejs";

type ArtifactRouteContext = {
  params: Promise<{
    id: string;
    commit: string;
    digest: string;
    path: string[];
  }>;
};

export async function GET(_request: Request, context: ArtifactRouteContext) {
  const params = await context.params;
  const registry = await loadPublishedRegistry();
  if (registry.kind === "unavailable") {
    return createArtifactErrorResponse(503, "Artifact registry unavailable");
  }

  const match = matchArtifactRequest(registry.games, params);
  if (!match) {
    return createArtifactErrorResponse(404, "Artifact not found");
  }

  const contentType = getSafeContentType(match.path);
  if (!contentType) {
    return createArtifactErrorResponse(415, "Artifact type not allowed");
  }

  let manifestResponse: Response;
  try {
    manifestResponse = await fetch(
      getRawArtifactManifestUrl(registry.registryUrl, match.game),
      {
        method: "GET",
        redirect: "manual",
        cache: "force-cache",
      },
    );
  } catch {
    return createArtifactErrorResponse(502, "Artifact manifest unavailable");
  }
  if (manifestResponse.status !== 200) {
    return createArtifactErrorResponse(502, "Artifact manifest unavailable");
  }

  let manifest;
  try {
    manifest = parseAndVerifyArtifactManifest(
      await readBoundedBody(manifestResponse, MAX_ARTIFACT_MANIFEST_BYTES),
      match.game,
    );
  } catch {
    return createArtifactErrorResponse(
      502,
      "Artifact manifest could not be verified",
    );
  }

  const fileRecord = manifest.files.find((file) => file.path === match.path);
  if (!fileRecord) {
    return createArtifactErrorResponse(404, "Artifact file not published");
  }

  let upstream: Response;
  try {
    upstream = await fetch(getRawArtifactUrl(registry.registryUrl, match), {
      method: "GET",
      redirect: "manual",
      cache: "force-cache",
    });
  } catch {
    return createArtifactErrorResponse(502, "Artifact source unavailable");
  }
  if (upstream.status !== 200) {
    return createArtifactErrorResponse(502, "Artifact source unavailable");
  }

  let body: ArrayBuffer;
  try {
    body = await readBoundedBody(
      upstream,
      Math.min(fileRecord.bytes, MAX_ARTIFACT_FILE_BYTES),
    );
  } catch {
    return createArtifactErrorResponse(502, "Artifact source unavailable");
  }
  if (!verifyArtifactFile(body, fileRecord)) {
    return createArtifactErrorResponse(
      502,
      "Artifact file could not be verified",
    );
  }

  return new Response(body, {
    status: 200,
    headers: createArtifactHeaders(contentType, body.byteLength),
  });
}

async function readBoundedBody(response: Response, maximumBytes: number) {
  const declaredLength = response.headers.get("content-length");
  const contentEncoding = response.headers
    .get("content-encoding")
    ?.trim()
    .toLowerCase();
  if (
    declaredLength !== null &&
    (contentEncoding === undefined ||
      contentEncoding === "" ||
      contentEncoding === "identity") &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)
  ) {
    throw new Error("Response exceeds byte limit");
  }

  if (!response.body) return new ArrayBuffer(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maximumBytes) {
      await reader.cancel();
      throw new Error("Response exceeds byte limit");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}
