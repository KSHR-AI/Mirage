import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const archive = process.argv[2];
const cli = path.join(root, "node_modules/.bin/gltf-transform");
const output = path.join(
  root,
  "public/game-assets/models/downtown-buildings.glb",
);

if (!archive) {
  console.error(
    "Usage: pnpm assets:import:quaternius:city <Downtown City MegaKit[Standard].zip>",
  );
  process.exit(1);
}

try {
  await run("ktx", ["--version"]);
} catch {
  throw new Error(
    "Khronos KTX Software 4.4+ is required to encode GPU-native KTX2 textures.",
  );
}

const workspace = await mkdtemp(
  path.join(os.tmpdir(), "mirage-quaternius-city-"),
);

try {
  await run("unzip", [
    "-q",
    path.resolve(archive),
    "Exports/glTF (Godot)/Building_*",
    "Exports/glTF (Godot)/*.png",
    "-d",
    workspace,
  ]);

  const sourceRoot = path.join(workspace, "Exports/glTF (Godot)");
  const merged = path.join(workspace, "downtown-buildings-merged.glb");
  await run(cli, [
    "merge",
    path.join(sourceRoot, "Building_Large_2.gltf"),
    path.join(sourceRoot, "Building_Medium_2_001.gltf"),
    path.join(sourceRoot, "Building_Small_1.gltf"),
    merged,
    "--merge-scenes",
  ]);

  await mkdir(path.dirname(output), { recursive: true });
  const { stdout, stderr } = await run(
    cli,
    [
      "optimize",
      merged,
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
      "--texture-compress",
      "ktx2",
      "--texture-size",
      "640",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );

  const bytes = await readFile(output);
  console.log(
    JSON.stringify(
      {
        id: "downtown-buildings",
        sourcePage: "https://quaternius.com/packs/downtowncitymegakit.html",
        license: "CC0-1.0",
        sourceModels: [
          "Building_Large_2",
          "Building_Medium_2_001",
          "Building_Small_1",
        ],
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
