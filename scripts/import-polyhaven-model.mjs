import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ids = process.argv.slice(2);
const root = process.cwd();
const outputRoot = path.join(root, "public/game-assets/models");
const cli = path.join(root, "node_modules/.bin/gltf-transform");
const apartmentFacadeNodes = new Set([
  "base_standard_01",
  "cornice_pier_standard_01",
  "cornice_standard_standard_01",
  "crown_pier_pedestal_01",
  "crown_standard_standard_01",
  "dado_door_centered_large_01",
  "dado_pier_pedestal_01",
  "dado_standard_standard_01",
  "door_centered_large_01",
  "wall_door_centered_large_01",
  "wall_pier_standard_01",
  "wall_standard_standard_01",
  "wall_window_centered_double_01",
  "wall_window_centered_large_01",
  "wall_window_centered_large_02",
  "wall_window_centered_small_01",
  "window_centered_double_01",
  "window_centered_large_01",
  "window_centered_large_02",
  "window_centered_small_01",
]);
const nodeSelectors = {
  fire_hydrant: (name) => name === "fire_hydrant_aged",
  metal_trash_can: (name) => name.startsWith("metal_trash_can_rust"),
  modular_urban_apartments_facade: (name) => apartmentFacadeNodes.has(name),
};
const simplificationOptions = {
  concrete_road_barrier: [
    "--simplify-ratio",
    "0.12",
    "--simplify-error",
    "0.01",
  ],
  fire_hydrant: ["--simplify-ratio", "0.04", "--simplify-error", "1"],
  metal_trash_can: ["--simplify-ratio", "0.45", "--simplify-error", "0.004"],
  modular_urban_apartments_facade: [
    "--simplify-ratio",
    "0.52",
    "--simplify-error",
    "0.002",
  ],
  street_lamp_02: ["--simplify-ratio", "0.45", "--simplify-error", "0.004"],
};
const hierarchyOptions = {
  modular_fire_escape: [
    "--flatten",
    "false",
    "--join",
    "false",
    "--palette",
    "false",
  ],
  modular_urban_apartments_facade: [
    "--flatten",
    "false",
    "--join",
    "false",
    "--palette",
    "false",
  ],
};
const textureSizes = {
  concrete_road_barrier: "512",
  fire_hydrant: "512",
  metal_trash_can: "512",
  modular_fire_escape: "512",
  modular_urban_apartments_facade: "512",
  street_lamp_02: "512",
};

if (ids.length === 0) {
  console.error("Usage: pnpm assets:import:polyhaven <asset-id> [...asset-id]");
  process.exit(1);
}

try {
  await run("ktx", ["--version"]);
} catch {
  throw new Error(
    "Khronos KTX Software 4.4+ is required to encode GPU-native KTX2 textures.",
  );
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`${response.status} while downloading ${url}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}

async function importModel(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Invalid asset id: ${id}`);
  const workspace = await mkdtemp(path.join(os.tmpdir(), `mirage-${id}-`));
  try {
    const [filesResponse, infoResponse] = await Promise.all([
      fetch(`https://api.polyhaven.com/files/${id}`),
      fetch(`https://api.polyhaven.com/info/${id}`),
    ]);
    if (!filesResponse.ok || !infoResponse.ok) {
      throw new Error(`Poly Haven metadata lookup failed for ${id}`);
    }
    const files = await filesResponse.json();
    const info = await infoResponse.json();
    const source = files.gltf?.["1k"]?.gltf;
    if (!source?.url || !source.include) {
      throw new Error(`${id} does not provide a 1K glTF package`);
    }

    const input = path.join(
      workspace,
      path.basename(new URL(source.url).pathname),
    );
    await Promise.all([
      download(source.url, input),
      ...Object.entries(source.include).map(([relative, file]) =>
        download(file.url, path.join(workspace, relative)),
      ),
    ]);

    const selectNode = nodeSelectors[id];
    if (selectNode) {
      const document = JSON.parse(await readFile(input, "utf8"));
      const scene = document.scenes?.[document.scene ?? 0];
      scene.nodes = (scene.nodes ?? []).filter((index) =>
        selectNode(document.nodes?.[index]?.name ?? ""),
      );
      if (scene.nodes.length === 0) {
        throw new Error(`${id} variant selection removed every scene node`);
      }
      await writeFile(input, `${JSON.stringify(document)}\n`);
    }

    await mkdir(outputRoot, { recursive: true });
    const output = path.join(outputRoot, `${id}.glb`);
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
        "--texture-compress",
        "ktx2",
        "--texture-size",
        textureSizes[id] ?? "1024",
        ...(hierarchyOptions[id] ?? []),
        ...(simplificationOptions[id] ?? []),
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const bytes = await readFile(output);
    console.log(
      JSON.stringify(
        {
          id,
          name: info.name,
          authors: Object.keys(info.authors ?? {}),
          output: path.relative(root, output),
          bytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          sourcePage: `https://polyhaven.com/a/${id}`,
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

for (const id of ids) await importModel(id);
