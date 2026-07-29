import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { FIXED_MTIME } from "./constants.mjs";
import { invariant } from "./errors.mjs";
import {
  buildArtifactManifest,
  computeArtifactDigest,
  digestArtifactManifest,
  inspectStaticDist,
  serializeArtifactManifest,
} from "./static-dist.mjs";

export async function stageArtifact({
  inspection,
  submission,
  outputDirectory,
  provenanceDirectory,
  submissionDigest,
  build,
}) {
  const digestHex = inspection.artifactDigest.slice("sha256:".length);
  const artifactRelativePath = `artifacts/${submission.id}/${submission.source.commit}/${digestHex}`;
  const artifactDirectory = path.join(
    outputDirectory,
    ...artifactRelativePath.split("/"),
  );
  await materializeStaticDirectory(artifactDirectory, inspection.files);

  const manifest = buildArtifactManifest(inspection);
  const manifestBytes = serializeArtifactManifest(manifest);
  const manifestDigest = digestArtifactManifest(manifestBytes);
  const manifestRelativePath = `manifests/${submission.id}/${submission.source.commit}/${digestHex}.json`;
  const manifestPath = path.join(
    outputDirectory,
    ...manifestRelativePath.split("/"),
  );
  await writeBytesIdempotently(manifestPath, manifestBytes);

  invariant(
    inspection.files.some(
      (file) => file.path === submission.presentation.coverPath,
    ),
    `Cover image is missing from dist/: ${submission.presentation.coverPath}`,
  );
  invariant(
    /\.(?:avif|gif|jpe?g|png|webp)$/i.test(submission.presentation.coverPath),
    "Cover image must use AVIF, GIF, JPEG, PNG, or WebP",
  );

  const record = {
    schemaVersion: 1,
    id: submission.id,
    title: submission.title,
    tagline: submission.tagline,
    description: submission.description,
    model: submission.provenance.model,
    builtOn: submission.provenance.builtOn,
    features: submission.features,
    source: submission.source,
    lineage: submission.lineage,
    provenance: submission.provenance,
    licenses: submission.licenses,
    presentation: submission.presentation,
    artifact: {
      entryPath: "index.html",
      digest: inspection.artifactDigest,
      manifestDigest,
      fileCount: inspection.fileCount,
      bytes: inspection.totalBytes,
    },
    publication: {
      contract: {
        node: "24.x",
        pnpm: "11.7.0",
        command: "pnpm run build:mirage",
        output: "dist/index.html",
      },
      submissionDigest,
      build,
    },
  };

  await mkdir(provenanceDirectory, { recursive: true });
  await writeBytesIdempotently(
    path.join(provenanceDirectory, `${submission.id}.json`),
    Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8"),
  );

  return Object.freeze({ record, manifest, manifestBytes });
}

export async function materializeStaticDirectory(targetDirectory, files) {
  await assertNoSymlinkParents(targetDirectory);
  const parent = path.dirname(targetDirectory);
  await mkdir(parent, { recursive: true });

  if (await pathExists(targetDirectory)) {
    const existing = await inspectStaticDist(targetDirectory);
    const expected = buildArtifactManifest({
      artifactDigest: existing.artifactDigest,
      fileCount: existing.fileCount,
      totalBytes: existing.totalBytes,
      files: existing.files,
    });
    const incoming = buildArtifactManifest({
      artifactDigest: computeArtifactDigest(files),
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
      files,
    });
    invariant(
      JSON.stringify(existingManifestShape(expected)) ===
        JSON.stringify(existingManifestShape(incoming)),
      `Refusing to overwrite divergent artifact directory: ${targetDirectory}`,
    );
    return;
  }

  const temporaryDirectory = path.join(
    parent,
    `.mirage-${path.basename(targetDirectory)}-${randomUUID()}.tmp`,
  );
  await mkdir(temporaryDirectory, { recursive: false, mode: 0o755 });

  try {
    const directories = new Set([""]);
    for (const file of files) {
      let directory = path.posix.dirname(file.path);
      while (directory !== ".") {
        directories.add(directory);
        directory = path.posix.dirname(directory);
      }
    }
    for (const directory of [...directories].sort(compareUtf8)) {
      if (!directory) continue;
      const directoryPath = path.join(
        temporaryDirectory,
        ...directory.split("/"),
      );
      await mkdir(directoryPath, { recursive: true, mode: 0o755 });
    }
    for (const file of files) {
      const destination = path.join(
        temporaryDirectory,
        ...file.path.split("/"),
      );
      await writeFile(destination, file.bytes, { flag: "wx", mode: 0o644 });
      await chmod(destination, 0o644);
      await utimes(destination, FIXED_MTIME, FIXED_MTIME);
    }
    for (const directory of [...directories].sort(compareUtf8).reverse()) {
      const directoryPath = directory
        ? path.join(temporaryDirectory, ...directory.split("/"))
        : temporaryDirectory;
      await chmod(directoryPath, 0o755);
      await utimes(directoryPath, FIXED_MTIME, FIXED_MTIME);
    }
    await rename(temporaryDirectory, targetDirectory);
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function writeBytesIdempotently(filePath, bytes) {
  await assertNoSymlinkParents(filePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  if (await pathExists(filePath)) {
    const stats = await lstat(filePath);
    invariant(
      stats.isFile() && !stats.isSymbolicLink() && stats.nlink === 1,
      `Refusing to replace non-regular output: ${filePath}`,
    );
    const existing = await readFile(filePath);
    invariant(
      existing.equals(bytes),
      `Refusing to overwrite divergent immutable output: ${filePath}`,
    );
    return;
  }

  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o644 });
    await chmod(temporaryPath, 0o644);
    await utimes(temporaryPath, FIXED_MTIME, FIXED_MTIME);
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function assertNoSymlinkParents(filePath) {
  let current = path.dirname(path.resolve(filePath));
  while (true) {
    try {
      const stats = await lstat(current);
      invariant(
        stats.isDirectory() && !stats.isSymbolicLink(),
        `Output parent must be a real directory: ${current}`,
      );
      return;
    } catch (error) {
      if (error?.code === "ENOENT") {
        const parent = path.dirname(current);
        invariant(
          parent !== current,
          `Could not establish output root for ${filePath}`,
        );
        current = parent;
        continue;
      }
      throw error;
    }
  }
}

function existingManifestShape(manifest) {
  return {
    artifactDigest: manifest.artifactDigest,
    fileCount: manifest.fileCount,
    bytes: manifest.bytes,
    files: manifest.files,
  };
}

function compareUtf8(left, right) {
  return Buffer.from(left).compare(Buffer.from(right));
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
