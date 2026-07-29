import { execFileSync } from "node:child_process";
import { chmod, link, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_ARTIFACT_MANIFEST_BYTES, STATIC_LIMITS } from "./constants.mjs";
import {
  assertArtifactManifestBytes,
  buildArtifactManifest,
  digestArtifactManifest,
  inspectStaticDist,
  serializeArtifactManifest,
} from "./static-dist.mjs";
import { createTemporaryDirectory, writeValidDist } from "./test-helpers.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function validFixture() {
  const root = await createTemporaryDirectory();
  temporaryRoots.push(root);
  const dist = await writeValidDist(root);
  return { root, dist };
}

describe("static artifact inspection", () => {
  it("produces deterministic aggregate and per-file integrity", async () => {
    const first = await validFixture();
    const second = await validFixture();
    const firstInspection = await inspectStaticDist(first.dist);
    const secondInspection = await inspectStaticDist(second.dist);

    expect(firstInspection.artifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(firstInspection.artifactDigest).toBe(
      secondInspection.artifactDigest,
    );
    expect(firstInspection.files.map((file) => file.path)).toEqual([
      "assets/cover.webp",
      "assets/game.css",
      "assets/game.js",
      "index.html",
    ]);
    expect(
      firstInspection.files.every((file) =>
        /^sha256:[0-9a-f]{64}$/.test(file.sha256),
      ),
    ).toBe(true);

    const manifest = buildArtifactManifest(firstInspection);
    const manifestBytes = serializeArtifactManifest(manifest);
    expect(manifest).toEqual({
      schemaVersion: 1,
      artifactDigest: firstInspection.artifactDigest,
      fileCount: 4,
      bytes: firstInspection.totalBytes,
      files: firstInspection.files.map((file) => ({
        path: file.path,
        bytes: file.byteLength,
        sha256: file.sha256,
      })),
    });
    expect(digestArtifactManifest(manifestBytes)).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(manifestBytes.at(-1)).toBe(10);
  });

  it("rejects symbolic links, hard links, FIFOs, and executable files", async () => {
    const symbolic = await validFixture();
    await symlink(
      path.join(symbolic.dist, "assets", "game.js"),
      path.join(symbolic.dist, "linked.js"),
    );
    await expect(inspectStaticDist(symbolic.dist)).rejects.toThrow(
      /symbolic link/,
    );

    const hard = await validFixture();
    await link(
      path.join(hard.dist, "assets", "game.js"),
      path.join(hard.dist, "hard.js"),
    );
    await expect(inspectStaticDist(hard.dist)).rejects.toThrow(/hard-linked/);

    const fifo = await validFixture();
    execFileSync("mkfifo", [path.join(fifo.dist, "stream.txt")]);
    await expect(inspectStaticDist(fifo.dist)).rejects.toThrow(
      /socket, device, FIFO/,
    );

    const executable = await validFixture();
    await chmod(path.join(executable.dist, "assets", "game.js"), 0o755);
    await expect(inspectStaticDist(executable.dist)).rejects.toThrow(
      /executable/,
    );
  });

  it.each([
    [
      "service-worker.js",
      "self.addEventListener('fetch', () => {});\n",
      /service worker/,
    ],
    ["vercel.json", "{}\n", /server configuration/],
    ["server.py", "print('server')\n", /executable\/server/],
    ["bundle.map", "{}\n", /executable\/server/],
    ["README.md", "# not served\n", /unsupported served extension/],
  ])("rejects forbidden output %s", async (name, contents, message) => {
    const fixture = await validFixture();
    await writeFile(path.join(fixture.dist, name), contents);
    await expect(inspectStaticDist(fixture.dist)).rejects.toThrow(message);
  });

  it("rejects server directories and service-worker registration under arbitrary names", async () => {
    const serverDirectory = await validFixture();
    await mkdir(path.join(serverDirectory.dist, "functions"));
    await writeFile(
      path.join(serverDirectory.dist, "functions", "handler.js"),
      "export default () => null;\n",
    );
    await expect(inspectStaticDist(serverDirectory.dist)).rejects.toThrow(
      /server directory/,
    );

    const registration = await validFixture();
    await writeFile(
      path.join(registration.dist, "assets", "game.js"),
      "navigator.serviceWorker.register('./worker-any-name.js');\n",
    );
    await expect(inspectStaticDist(registration.dist)).rejects.toThrow(
      /registers a service worker/,
    );
  });

  it.each([
    ["index.html", '<!doctype html><script src="/assets/game.js"></script>\n'],
    ["assets/game.css", "body{background:url(/assets/cover.webp)}\n"],
    ["assets/game.js", 'import "/assets/chunk.js";\n'],
    ["manifest.webmanifest", '{"start_url":"/"}\n'],
  ])(
    "rejects root-absolute references in %s",
    async (relativePath, contents) => {
      const fixture = await validFixture();
      const filePath = path.join(fixture.dist, ...relativePath.split("/"));
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, contents);
      await expect(inspectStaticDist(fixture.dist)).rejects.toThrow(
        /root-absolute/,
      );
    },
  );

  it("rejects leaked secrets and missing index", async () => {
    const secret = await validFixture();
    await writeFile(
      path.join(secret.dist, "assets", "game.js"),
      "const key = '-----BEGIN PRIVATE KEY-----';\n",
    );
    await expect(inspectStaticDist(secret.dist)).rejects.toThrow(/private key/);

    const missingIndex = await validFixture();
    await rm(path.join(missingIndex.dist, "index.html"));
    await expect(inspectStaticDist(missingIndex.dist)).rejects.toThrow(
      /dist\/index.html/,
    );
  });

  it("enforces file, byte, path, and depth limits", async () => {
    const files = await validFixture();
    await expect(
      inspectStaticDist(files.dist, {
        limits: {
          maxFiles: 3,
          maxTotalBytes: 1_000_000,
          maxFileBytes: 1_000_000,
          maxPathBytes: 512,
          maxDepth: 20,
        },
      }),
    ).rejects.toThrow(/exceeds 3 files/);

    const bytes = await validFixture();
    await expect(
      inspectStaticDist(bytes.dist, {
        limits: {
          maxFiles: 5_000,
          maxTotalBytes: 10,
          maxFileBytes: 1_000_000,
          maxPathBytes: 512,
          maxDepth: 20,
        },
      }),
    ).rejects.toThrow(/total bytes/);

    const pathLimit = await validFixture();
    await expect(
      inspectStaticDist(pathLimit.dist, {
        limits: {
          maxFiles: 5_000,
          maxTotalBytes: 1_000_000,
          maxFileBytes: 1_000_000,
          maxPathBytes: 5,
          maxDepth: 20,
        },
      }),
    ).rejects.toThrow(/path exceeds/);

    const depth = await validFixture();
    await mkdir(path.join(depth.dist, "a", "b", "c"), { recursive: true });
    await writeFile(path.join(depth.dist, "a", "b", "c", "file.txt"), "x");
    await expect(
      inspectStaticDist(depth.dist, {
        limits: {
          maxFiles: 5_000,
          maxTotalBytes: 1_000_000,
          maxFileBytes: 1_000_000,
          maxPathBytes: 512,
          maxDepth: 2,
        },
      }),
    ).rejects.toThrow(/maximum depth/);
  });

  it("caps every published file at four MiB for buffered delivery", async () => {
    const fixture = await validFixture();
    await writeFile(
      path.join(fixture.dist, "assets", "oversized.bin"),
      Buffer.alloc(STATIC_LIMITS.maxFileBytes + 1),
    );
    await expect(inspectStaticDist(fixture.dist)).rejects.toThrow(
      `exceeds ${4 * 1024 * 1024} bytes`,
    );
  });

  it("accepts an exact eight MiB manifest boundary and rejects one byte more", () => {
    expect(() =>
      assertArtifactManifestBytes(Buffer.alloc(MAX_ARTIFACT_MANIFEST_BYTES)),
    ).not.toThrow();
    expect(() =>
      assertArtifactManifestBytes(
        Buffer.alloc(MAX_ARTIFACT_MANIFEST_BYTES + 1),
      ),
    ).toThrow(`exceeds ${MAX_ARTIFACT_MANIFEST_BYTES} bytes`);
  });
});
