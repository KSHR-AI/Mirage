import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const cli = path.join(root, "node_modules/.bin/gltf-transform");
const sourceFileId = "1mRasAWSbbCUo74tBi_mxrNmTS74tdLr9";
const sourcePage = "https://quaternius.com/packs/zombieapocalypsekit.html";
const downloadFolder =
  "https://drive.google.com/drive/folders/1gU4EDvCbI5DCXBUskqYRzmps5Du3KUvF";
const output = path.join(root, "public/game-assets/models/hero-coupe.glb");
const workspace = await mkdtemp(
  path.join(os.tmpdir(), "mirage-quaternius-vehicle-"),
);

try {
  const sourceUrl = `https://drive.usercontent.google.com/download?id=${sourceFileId}&export=download&confirm=t`;
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Quaternius vehicle download failed: ${response.status}`);
  }

  const input = path.join(workspace, "Vehicle_Sports.gltf");
  await writeFile(input, new Uint8Array(await response.arrayBuffer()));
  const document = JSON.parse(await readFile(input, "utf8"));
  const nodeNames = new Set(
    (document.nodes ?? []).map((node) => node.name).filter(Boolean),
  );
  for (const required of [
    "Sports",
    "BackWheels",
    "FrontWheel_L",
    "FrontWheel_R",
  ]) {
    if (!nodeNames.has(required)) {
      throw new Error(`Quaternius vehicle is missing node ${required}`);
    }
  }

  await mkdir(path.dirname(output), { recursive: true });
  const { stdout, stderr } = await run(
    cli,
    [
      "optimize",
      input,
      output,
      "--compress",
      "meshopt",
      "--meshopt-level",
      "high",
      "--flatten",
      "false",
      "--join",
      "false",
      "--instance",
      "false",
      "--palette",
      "false",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const bytes = await readFile(output);
  console.log(
    JSON.stringify(
      {
        id: "quaternius-zombie-sports-vehicle",
        sourcePage,
        downloadFolder,
        sourceFile: "Vehicle_Sports.gltf",
        license: "CC0-1.0",
        output: path.relative(root, output),
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        logs: [stdout, stderr].filter(Boolean).join("\n").trim(),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(workspace, { force: true, recursive: true });
}
