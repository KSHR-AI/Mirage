import { describe, expect, it } from "vitest";
import { GAME_IFRAME_SANDBOX } from "../player/sandbox";
import type { PublishedGame } from "../registry/schema";
import {
  ARTIFACT_CONTENT_SECURITY_POLICY,
  getRawArtifactManifestUrl,
  getRawArtifactUrl,
  getSafeContentType,
  matchArtifactRequest,
  MAX_ARTIFACT_FILE_BYTES,
  parseAndVerifyArtifactManifest,
  sha256Digest,
  verifyArtifactFile,
  type ArtifactManifestFile,
} from "./artifact-proxy";

const COMMIT = "1".repeat(40);
const ARTIFACT_DIGEST = `sha256:${"a".repeat(64)}` as const;
const REGISTRY_URL =
  "https://raw.githubusercontent.com/KSHR-AI/Mirage/mirage-artifacts/registry.json";

function toArrayBuffer(value: string) {
  const bytes = new TextEncoder().encode(value);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function createFixture() {
  const javascript = toArrayBuffer("console.log('ok');\n");
  const html = toArrayBuffer(
    '<!doctype html><script src="./assets/game.js"></script>\n',
  );
  const files: ArtifactManifestFile[] = [
    {
      path: "assets/game.js",
      bytes: javascript.byteLength,
      sha256: sha256Digest(javascript),
    },
    {
      path: "index.html",
      bytes: html.byteLength,
      sha256: sha256Digest(html),
    },
  ];
  const manifestValue = {
    schemaVersion: 1,
    artifactDigest: ARTIFACT_DIGEST,
    fileCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  const manifestBytes = toArrayBuffer(
    `${JSON.stringify(manifestValue, null, 2)}\n`,
  );
  const game: PublishedGame = {
    id: "night-drive-001",
    title: "Night Drive",
    tagline: "Drive",
    description: "A browser game.",
    model: "example-model",
    builtOn: "2026-07-29",
    source: {
      repositoryUrl: "https://github.com/example/night-drive",
      commit: COMMIT,
    },
    artifact: {
      digest: ARTIFACT_DIGEST,
      manifestDigest: sha256Digest(manifestBytes),
      entryPath: "index.html",
      fileCount: files.length,
      bytes: manifestValue.bytes,
    },
    lineage: {
      kind: "independent",
      seedDigest: `sha256:${"b".repeat(64)}`,
    },
    provenance: {},
    licenses: {},
    features: ["Driving"],
    presentation: {
      coverPath: "assets/cover.webp",
      coverAlt: "A procedural car driving at night",
      controls: ["WASD"],
      limitations: ["Touch controls are not implemented"],
      protocolVersion: 1,
    },
  };
  return { game, files, javascript, html, manifestBytes, manifestValue };
}

describe("artifact proxy trust boundary", () => {
  it("matches only the registry-allowlisted id, commit, digest, and path", () => {
    const { game } = createFixture();
    const valid = {
      id: game.id,
      commit: game.source.commit,
      digest: game.artifact.digest.slice("sha256:".length),
      path: ["assets", "game.js"],
    };

    expect(matchArtifactRequest([game], valid)).toMatchObject({
      game,
      path: "assets/game.js",
    });
    expect(
      matchArtifactRequest([game], { ...valid, commit: "2".repeat(40) }),
    ).toBeNull();
    expect(
      matchArtifactRequest([game], { ...valid, path: ["..", "game.js"] }),
    ).toBeNull();
    expect(
      matchArtifactRequest([game], { ...valid, path: ["server.php"] }),
    ).toBeNull();
  });

  it("derives exact raw-branch manifest and artifact URLs", () => {
    const { game } = createFixture();
    const match = matchArtifactRequest([game], {
      id: game.id,
      commit: game.source.commit,
      digest: game.artifact.digest.slice("sha256:".length),
      path: ["assets", "game.js"],
    });
    expect(match).not.toBeNull();
    if (!match) throw new Error("Expected artifact match");

    expect(getRawArtifactManifestUrl(REGISTRY_URL, game).toString()).toBe(
      `https://raw.githubusercontent.com/KSHR-AI/Mirage/mirage-artifacts/manifests/${game.id}/${COMMIT}/${"a".repeat(64)}.json`,
    );
    expect(getRawArtifactUrl(REGISTRY_URL, match).toString()).toBe(
      `https://raw.githubusercontent.com/KSHR-AI/Mirage/mirage-artifacts/artifacts/${game.id}/${COMMIT}/${"a".repeat(64)}/assets/game.js`,
    );
  });

  it("verifies exact manifest bytes, metadata, sorting, and totals", () => {
    const { game, manifestBytes, manifestValue } = createFixture();
    expect(parseAndVerifyArtifactManifest(manifestBytes, game)).toMatchObject({
      artifactDigest: game.artifact.digest,
      fileCount: 2,
      bytes: game.artifact.bytes,
    });

    const changedBytes = toArrayBuffer(
      new TextDecoder()
        .decode(manifestBytes)
        .replace('"fileCount": 2', '"fileCount": 3'),
    );
    expect(() => parseAndVerifyArtifactManifest(changedBytes, game)).toThrow(
      /digest mismatch/,
    );

    const unsortedValue = {
      ...manifestValue,
      files: [...manifestValue.files].reverse(),
    };
    const unsortedBytes = toArrayBuffer(
      `${JSON.stringify(unsortedValue, null, 2)}\n`,
    );
    const unsortedGame: PublishedGame = {
      ...game,
      artifact: {
        ...game.artifact,
        manifestDigest: sha256Digest(unsortedBytes),
      },
    };
    expect(() =>
      parseAndVerifyArtifactManifest(unsortedBytes, unsortedGame),
    ).toThrow(/sorted/);
  });

  it("rejects a file above the verified proxy response limit", () => {
    const { game } = createFixture();
    const oversizedBytes = MAX_ARTIFACT_FILE_BYTES + 1;
    const manifestValue = {
      schemaVersion: 1,
      artifactDigest: game.artifact.digest,
      fileCount: 1,
      bytes: oversizedBytes,
      files: [
        {
          path: "index.html",
          bytes: oversizedBytes,
          sha256: `sha256:${"c".repeat(64)}`,
        },
      ],
    };
    const manifestBytes = toArrayBuffer(
      `${JSON.stringify(manifestValue, null, 2)}\n`,
    );
    const oversizedGame: PublishedGame = {
      ...game,
      artifact: {
        ...game.artifact,
        manifestDigest: sha256Digest(manifestBytes),
        fileCount: 1,
        bytes: oversizedBytes,
      },
    };

    expect(() =>
      parseAndVerifyArtifactManifest(manifestBytes, oversizedGame),
    ).toThrow(/file 0/);
  });

  it("verifies each fetched file against the signed manifest record", () => {
    const { files, javascript } = createFixture();
    expect(verifyArtifactFile(javascript, files[0])).toBe(true);
    expect(
      verifyArtifactFile(toArrayBuffer("console.log('tampered');"), files[0]),
    ).toBe(false);
  });

  it("serves only explicit MIME types under an opaque least-privilege sandbox", () => {
    expect(getSafeContentType("index.html")).toBe("text/html; charset=utf-8");
    expect(getSafeContentType("audio/theme.aac")).toBe("audio/aac");
    expect(getSafeContentType("site.webmanifest")).toBe(
      "application/manifest+json",
    );
    expect(getSafeContentType("metadata.xml")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(getSafeContentType("server.php")).toBeNull();
    expect(GAME_IFRAME_SANDBOX).toBe("allow-scripts allow-pointer-lock");
    expect(GAME_IFRAME_SANDBOX).not.toMatch(
      /allow-same-origin|allow-forms|allow-popups|allow-top-navigation|allow-downloads/,
    );
    expect(ARTIFACT_CONTENT_SECURITY_POLICY).toContain(
      "sandbox allow-scripts allow-pointer-lock",
    );
    expect(ARTIFACT_CONTENT_SECURITY_POLICY).toContain("worker-src 'none'");
  });
});
