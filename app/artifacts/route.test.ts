import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Digest } from "./artifact-proxy";
import {
  GET,
  MAX_ARTIFACT_MANIFEST_BYTES,
} from "./[id]/[commit]/[digest]/[...path]/route";

const COMMIT = "1".repeat(40);
const DIGEST_HEX = "a".repeat(64);

function toArrayBuffer(value: string) {
  const bytes = new TextEncoder().encode(value);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function createPublishedFixture() {
  const fileBytes = toArrayBuffer("<!doctype html><title>Game</title>\n");
  const artifactDigest = `sha256:${DIGEST_HEX}`;
  const manifestValue = {
    schemaVersion: 1,
    artifactDigest,
    fileCount: 1,
    bytes: fileBytes.byteLength,
    files: [
      {
        path: "index.html",
        bytes: fileBytes.byteLength,
        sha256: sha256Digest(fileBytes),
      },
    ],
  };
  const manifestBytes = toArrayBuffer(
    `${JSON.stringify(manifestValue, null, 2)}\n`,
  );
  const game = {
    id: "night-drive-001",
    title: "Night Drive",
    tagline: "Drive",
    description: "A complete browser game.",
    model: "example-model",
    builtOn: "2026-07-29",
    source: {
      repositoryUrl: "https://github.com/example/night-drive",
      commit: COMMIT,
    },
    artifact: {
      digest: artifactDigest,
      manifestDigest: sha256Digest(manifestBytes),
      entryPath: "index.html",
      fileCount: 1,
      bytes: fileBytes.byteLength,
    },
    lineage: {
      kind: "independent",
      seedDigest: `sha256:${"b".repeat(64)}`,
    },
    provenance: {},
    licenses: {},
    features: ["Driving"],
    presentation: {
      coverPath: "cover.webp",
      coverAlt: "A procedural car driving at night",
      controls: ["WASD"],
      limitations: ["Touch controls are not implemented"],
      protocolVersion: 1,
    },
  };
  return { fileBytes, game, manifestBytes };
}

async function requestArtifact() {
  return GET(
    new Request(
      `https://mirageml.com/artifacts/night-drive-001/${COMMIT}/${DIGEST_HEX}/index.html`,
      {
        headers: {
          authorization: "Bearer must-not-forward",
          cookie: "mirage-session=must-not-forward",
        },
      },
    ),
    {
      params: Promise.resolve({
        id: "night-drive-001",
        commit: COMMIT,
        digest: DIGEST_HEX,
        path: ["index.html"],
      }),
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("artifact proxy route", () => {
  it("forwards no request headers and serves only hash-verified bytes", async () => {
    const { fileBytes, game, manifestBytes } = createPublishedFixture();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ schemaVersion: 1, games: [game] }))
      .mockResolvedValueOnce(new Response(manifestBytes, { status: 200 }))
      .mockResolvedValueOnce(new Response(fileBytes, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const response = await requestArtifact();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<!doctype html><title>Game</title>\n");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("content-security-policy")).toContain(
      "sandbox allow-scripts allow-pointer-lock",
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).not.toHaveProperty("headers");
    }
  });

  it("fails closed when storage bytes no longer match the manifest", async () => {
    const { game, manifestBytes } = createPublishedFixture();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ schemaVersion: 1, games: [game] }))
      .mockResolvedValueOnce(new Response(manifestBytes, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(toArrayBuffer("<h1>Tampered</h1>"), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    const response = await requestArtifact();
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Artifact file could not be verified\n");
  });

  it("accepts verified decoded bytes when encoded Content-Length differs", async () => {
    const { fileBytes, game, manifestBytes } = createPublishedFixture();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ schemaVersion: 1, games: [game] }))
      .mockResolvedValueOnce(new Response(manifestBytes, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(fileBytes, {
          status: 200,
          headers: {
            "content-encoding": "gzip",
            "content-length": String(fileBytes.byteLength + 100),
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    const response = await requestArtifact();
    expect(response.status).toBe(200);
    expect(await response.arrayBuffer()).toEqual(fileBytes);
  });

  it("rejects a manifest response above the bounded-body limit", async () => {
    const { game } = createPublishedFixture();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ schemaVersion: 1, games: [game] }))
      .mockResolvedValueOnce(
        new Response("", {
          status: 200,
          headers: {
            "content-length": String(MAX_ARTIFACT_MANIFEST_BYTES + 1),
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    const response = await requestArtifact();
    expect(response.status).toBe(502);
    expect(await response.text()).toBe(
      "Artifact manifest could not be verified\n",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
