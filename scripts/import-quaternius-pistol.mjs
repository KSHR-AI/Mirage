import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const cli = path.join(root, "node_modules/.bin/gltf-transform");
const output = path.join(
  root,
  "public/game-assets/models/characters/signal_9_pistol.glb",
);
const sourceUrl =
  "https://opengameart.org/sites/default/files/ultimate_gun_pack_by_quaternius.zip";
const sourcePath = "Ultimate Gun Pack - July 2019/FBX/Pistol_3.fbx";

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} while downloading ${url}`);
  }
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}

try {
  await run("assimp", ["version"]);
} catch {
  throw new Error(
    "Assimp 6+ is required. Install it with `brew install assimp`.",
  );
}

const workspace = await mkdtemp(
  path.join(os.tmpdir(), "mirage-quaternius-pistol-"),
);

try {
  const archive = path.join(workspace, "ultimate-guns.zip");
  const source = path.join(workspace, "Pistol_3.fbx");
  const intermediate = path.join(workspace, "Pistol_3.glb");
  await download(sourceUrl, archive);
  await run("unzip", ["-j", "-o", archive, sourcePath, "-d", workspace]);
  await run("assimp", ["export", source, intermediate, "-f", "glb2"]);
  await mkdir(path.dirname(output), { recursive: true });
  const { stdout, stderr } = await run(
    cli,
    [
      "optimize",
      intermediate,
      output,
      "--compress",
      "meshopt",
      "--meshopt-level",
      "high",
      "--palette",
      "false",
      "--texture-compress",
      "false",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const bytes = await readFile(output);
  console.log(
    JSON.stringify(
      {
        id: "signal_9_pistol",
        sourceAsset: "Pistol_3.fbx",
        sourcePage: "https://quaternius.com/packs/ultimategun.html",
        sourceMirror: "https://opengameart.org/content/low-poly-guns-pack",
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
