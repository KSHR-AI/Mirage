import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const cli = path.join(root, "node_modules/.bin/gltf-transform");
const outputRoot = path.join(root, "public/game-assets/models/characters");
const requested = process.argv.slice(2);

const KEEP_ANIMATIONS = Object.freeze([
  "Death",
  "Gun_Shoot",
  "Idle_Gun_Pointing",
  "Idle_Gun_Shoot",
  "Idle_Neutral",
  "Roll",
  "Run",
  "Walk",
]);

const CHARACTERS = Object.freeze({
  runner: Object.freeze({
    driveId: "1fzSq1Rr037f7QkfXPWEAzmbLMNx-FpPA",
    sourceName: "Adventurer.gltf",
  }),
  civilian: Object.freeze({
    driveId: "1em1So1xwwQNfHJYMvzKcXkZllvtxpKP5",
    sourceName: "Casual_Hoodie.gltf",
  }),
  officer: Object.freeze({
    driveId: "1VGmU5f8a43NBT22JWB507NDSLbmNxzF9",
    sourceName: "Swat.gltf",
  }),
});

const ids = requested.length > 0 ? requested : Object.keys(CHARACTERS);

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} while downloading ${url}`);
  }
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}

async function importCharacter(id) {
  const definition = CHARACTERS[id];
  if (!definition) {
    throw new Error(
      `Unknown character "${id}". Expected one of: ${Object.keys(CHARACTERS).join(", ")}`,
    );
  }

  const workspace = await mkdtemp(
    path.join(os.tmpdir(), `mirage-quaternius-${id}-`),
  );
  try {
    const source = path.join(workspace, definition.sourceName);
    await download(
      `https://drive.usercontent.google.com/download?id=${definition.driveId}&export=download&confirm=t`,
      source,
    );

    const document = JSON.parse(await readFile(source, "utf8"));
    const available = new Set(
      (document.animations ?? []).map((animation) => animation.name),
    );
    const missing = KEEP_ANIMATIONS.filter((name) => !available.has(name));
    if (missing.length > 0) {
      throw new Error(
        `${definition.sourceName} is missing: ${missing.join(", ")}`,
      );
    }
    document.animations = document.animations.filter((animation) =>
      KEEP_ANIMATIONS.includes(animation.name),
    );
    await writeFile(source, `${JSON.stringify(document)}\n`);

    await mkdir(outputRoot, { recursive: true });
    const output = path.join(outputRoot, `${id}.glb`);
    const { stdout, stderr } = await run(
      cli,
      [
        "optimize",
        source,
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
          id,
          sourceName: definition.sourceName,
          sourcePage:
            "https://quaternius.com/packs/ultimatemodularcharacters.html",
          sourceFolder:
            "https://drive.google.com/drive/folders/1USAAquX2JJWuA2m6zol0KUkFe3UkZ8zX",
          license: "CC0-1.0",
          animations: KEEP_ANIMATIONS,
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
}

for (const id of ids) await importCharacter(id);
