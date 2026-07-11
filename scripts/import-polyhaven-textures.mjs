import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputRoot = path.join(root, "public/game-assets/textures");
const requestedIds = process.argv.slice(2);
const textureSets = {
  concrete_wall_007: {
    directory: "concrete-wall-007",
    maps: {
      "arm.jpg": "arm",
      "base-color.jpg": "Diffuse",
      "normal-gl.jpg": "nor_gl",
    },
  },
  corrugated_iron_02: {
    directory: "corrugated-iron-02",
    maps: {
      "arm.jpg": "arm",
      "base-color.jpg": "Diffuse",
      "normal-gl.jpg": "nor_gl",
    },
  },
};

if (requestedIds.length === 0) {
  console.error(
    `Usage: pnpm assets:import:polyhaven:textures ${Object.keys(textureSets).join(" ")}`,
  );
  process.exit(1);
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} while downloading ${url}`);
  }
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}

async function fileMetadata(filePath) {
  const bytes = await readFile(filePath);
  return {
    bytes: bytes.byteLength,
    path: path.relative(root, filePath),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function importTextureSet(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid asset id: ${id}`);
  }
  const config = textureSets[id];
  if (!config) throw new Error(`Unsupported texture set: ${id}`);

  const [filesResponse, infoResponse] = await Promise.all([
    fetch(`https://api.polyhaven.com/files/${id}`),
    fetch(`https://api.polyhaven.com/info/${id}`),
  ]);
  if (!filesResponse.ok || !infoResponse.ok) {
    throw new Error(`Poly Haven metadata lookup failed for ${id}`);
  }

  const files = await filesResponse.json();
  const info = await infoResponse.json();
  const outputDirectory = path.join(outputRoot, config.directory);
  await mkdir(outputDirectory, { recursive: true });

  const downloads = Object.entries(config.maps).map(
    async ([fileName, mapName]) => {
      const source = files[mapName]?.["1k"]?.jpg;
      if (!source?.url) {
        throw new Error(`${id} does not provide a 1K JPEG ${mapName} map`);
      }
      const destination = path.join(outputDirectory, fileName);
      await download(source.url, destination);
      return {
        mapName,
        sourceUrl: source.url,
        ...(await fileMetadata(destination)),
      };
    },
  );

  console.log(
    JSON.stringify(
      {
        authors: Object.keys(info.authors ?? {}),
        files: await Promise.all(downloads),
        id,
        name: info.name,
        sourcePage: `https://polyhaven.com/a/${id}`,
      },
      null,
      2,
    ),
  );
}

for (const id of requestedIds) await importTextureSet(id);
