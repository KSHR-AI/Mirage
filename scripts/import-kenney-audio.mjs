import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const outputRoot = path.join(root, "public/game-assets/audio");
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

const SOURCES = Object.freeze({
  kenneyImpact: Object.freeze({
    url: "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip",
    archive: "kenney-impact-sounds.zip",
  }),
  kenneyRpg: Object.freeze({
    url: "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip",
    archive: "kenney-rpg-audio.zip",
  }),
  kenneyInterface: Object.freeze({
    url: "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
    archive: "kenney-interface-sounds.zip",
  }),
  firearmLibrary: Object.freeze({
    url: "https://opengameart.org/sites/default/files/Prepared%20SFX%20Library.7z",
    archive: "prepared-firearm-library.7z",
  }),
  pistolReload: Object.freeze({
    url: "https://opengameart.org/sites/default/files/gunreload1.wav",
    archive: "gunreload1.wav",
  }),
  carDoorOpen: Object.freeze({
    url: "https://opengameart.org/sites/default/files/door_opening.wav",
    archive: "door_opening.wav",
  }),
  carDoorClose: Object.freeze({
    url: "https://opengameart.org/sites/default/files/door_closing.wav",
    archive: "door_closing.wav",
  }),
  engineIdle: Object.freeze({
    url: "https://opengameart.org/sites/default/files/loop_0.wav",
    archive: "engine-idle.wav",
  }),
  engineDrive: Object.freeze({
    url: "https://opengameart.org/sites/default/files/loop_3_0.wav",
    archive: "engine-drive.wav",
  }),
  policeSiren: Object.freeze({
    url: "https://bigsoundbank.com/UPLOAD/ogg/0886.ogg",
    archive: "gendarmerie-siren.ogg",
  }),
  rain: Object.freeze({
    url: "https://opengameart.org/sites/default/files/Ove%20Melaa%20-%20Rainy%20%28NOT%20loopable%29.ogg",
    archive: "rain.ogg",
  }),
});

const ONE_SHOT_FORMAT =
  "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono";
const ONE_SHOT_TARGET_PEAK_DB = -4;
const ONE_SHOT_LIMIT = "0.707946";
const LOOP_NORMALIZATION =
  "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,loudnorm=I=-22:TP=-2:LRA=8";

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} while downloading ${url}`);
  }
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(destination),
  );
}

async function encodeOneShot(input, relativeOutput, filter = "") {
  const output = path.join(outputRoot, relativeOutput);
  await mkdir(path.dirname(output), { recursive: true });
  const preFilters = [filter, ONE_SHOT_FORMAT].filter(Boolean).join(",");
  const analysis = await run(
    ffmpeg,
    [
      "-nostdin",
      "-hide_banner",
      "-i",
      input,
      "-vn",
      "-af",
      `${preFilters},volumedetect`,
      "-f",
      "null",
      "-",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const measuredPeak = analysis.stderr.match(
    /max_volume:\s*(-?\d+(?:\.\d+)?) dB/,
  )?.[1];
  if (measuredPeak === undefined) {
    throw new Error(`Could not measure the peak level of ${input}`);
  }
  const gain = ONE_SHOT_TARGET_PEAK_DB - Number(measuredPeak);
  const filters = [
    preFilters,
    `volume=${gain.toFixed(2)}dB`,
    `alimiter=limit=${ONE_SHOT_LIMIT}:attack=5:release=50:level=false`,
  ].join(",");
  await run(
    ffmpeg,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-map_metadata",
      "-1",
      "-vn",
      "-af",
      filters,
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "libvorbis",
      "-q:a",
      "3",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      output,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
}

async function encodeLoop(
  input,
  relativeOutput,
  { start, duration, crossfade },
) {
  const output = path.join(outputRoot, relativeOutput);
  await mkdir(path.dirname(output), { recursive: true });
  const end = start + duration;
  const middleEnd = duration - crossfade;
  const filter = [
    `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,${LOOP_NORMALIZATION},asplit=3[segment][head][tail]`,
    `[segment]atrim=start=${crossfade}:end=${middleEnd},asetpts=PTS-STARTPTS[mid]`,
    `[head]atrim=start=0:end=${crossfade},asetpts=PTS-STARTPTS[headtrim]`,
    `[tail]atrim=start=${middleEnd}:end=${duration},asetpts=PTS-STARTPTS[tailtrim]`,
    `[tailtrim][headtrim]acrossfade=d=${crossfade}:c1=tri:c2=tri[seam]`,
    "[mid][seam]concat=n=2:v=0:a=1[out]",
  ].join(";");
  await run(
    ffmpeg,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-map_metadata",
      "-1",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "libvorbis",
      "-q:a",
      "3",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      output,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
}

async function metadata(relativePath) {
  const absolute = path.join(root, relativePath);
  const bytes = await readFile(absolute);
  return {
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

try {
  await run(ffmpeg, ["-version"]);
} catch {
  throw new Error(
    "FFmpeg with libvorbis support is required. Set FFMPEG to its executable path if it is not on PATH.",
  );
}

const workspace = await mkdtemp(path.join(os.tmpdir(), "mirage-cc0-audio-"));

try {
  await Promise.all(
    Object.values(SOURCES).map((source) =>
      download(source.url, path.join(workspace, source.archive)),
    ),
  );

  for (const source of [
    SOURCES.kenneyImpact,
    SOURCES.kenneyRpg,
    SOURCES.kenneyInterface,
  ]) {
    await run("unzip", [
      "-q",
      path.join(workspace, source.archive),
      "-d",
      path.join(workspace, path.parse(source.archive).name),
    ]);
  }

  await run("bsdtar", [
    "-xf",
    path.join(workspace, SOURCES.firearmLibrary.archive),
    "-C",
    workspace,
    "Prepared SFX Library/1911/A_42P.wav",
  ]);

  const impactRoot = path.join(workspace, "kenney-impact-sounds/Audio");
  const rpgRoot = path.join(workspace, "kenney-rpg-audio/Audio");
  const interfaceRoot = path.join(workspace, "kenney-interface-sounds/Audio");
  const firearm = path.join(workspace, "Prepared SFX Library/1911/A_42P.wav");

  for (let index = 0; index < 5; index += 1) {
    await encodeOneShot(
      path.join(
        impactRoot,
        `footstep_concrete_${String(index).padStart(3, "0")}.ogg`,
      ),
      `footsteps/concrete-${String(index + 1).padStart(2, "0")}.ogg`,
    );
  }

  for (let index = 0; index < 3; index += 1) {
    await encodeOneShot(
      path.join(
        impactRoot,
        `impactGeneric_light_${String(index).padStart(3, "0")}.ogg`,
      ),
      `impacts/generic-${String(index + 1).padStart(2, "0")}.ogg`,
    );
  }

  for (let index = 0; index < 2; index += 1) {
    await encodeOneShot(
      path.join(
        impactRoot,
        `impactMetal_medium_${String(index).padStart(3, "0")}.ogg`,
      ),
      `impacts/metal-${String(index + 1).padStart(2, "0")}.ogg`,
    );
  }

  await Promise.all([
    encodeOneShot(
      firearm,
      "weapons/pistol-fire-01.ogg",
      "atrim=start=0.88:end=1.78,asetpts=PTS-STARTPTS,afade=t=out:st=0.75:d=0.15",
    ),
    encodeOneShot(
      firearm,
      "weapons/pistol-fire-02.ogg",
      "atrim=start=4.94:end=5.84,asetpts=PTS-STARTPTS,afade=t=out:st=0.75:d=0.15",
    ),
    encodeOneShot(
      path.join(rpgRoot, "metalClick.ogg"),
      "weapons/pistol-empty.ogg",
    ),
    encodeOneShot(
      path.join(workspace, SOURCES.pistolReload.archive),
      "weapons/pistol-reload.ogg",
    ),
    encodeOneShot(
      path.join(workspace, SOURCES.carDoorOpen.archive),
      "vehicles/door-enter.ogg",
    ),
    encodeOneShot(
      path.join(workspace, SOURCES.carDoorClose.archive),
      "vehicles/door-exit.ogg",
    ),
    encodeOneShot(
      path.join(interfaceRoot, "open_001.ogg"),
      "ui/objective-start.ogg",
    ),
    encodeOneShot(
      path.join(interfaceRoot, "confirmation_002.ogg"),
      "ui/objective-complete.ogg",
    ),
    encodeOneShot(
      path.join(interfaceRoot, "error_006.ogg"),
      "ui/objective-failed.ogg",
    ),
    encodeOneShot(path.join(interfaceRoot, "select_003.ogg"), "ui/select.ogg"),
  ]);

  await Promise.all([
    encodeLoop(
      path.join(workspace, SOURCES.engineIdle.archive),
      "vehicles/engine-idle-loop.ogg",
      { start: 0, duration: 0.84, crossfade: 0.08 },
    ),
    encodeLoop(
      path.join(workspace, SOURCES.engineDrive.archive),
      "vehicles/engine-drive-loop.ogg",
      { start: 0, duration: 0.6, crossfade: 0.06 },
    ),
    encodeLoop(
      path.join(workspace, SOURCES.policeSiren.archive),
      "vehicles/police-siren-loop.ogg",
      { start: 2, duration: 6.2, crossfade: 0.2 },
    ),
    encodeLoop(
      path.join(workspace, SOURCES.rain.archive),
      "ambience/urban-rain-loop.ogg",
      { start: 10, duration: 12.5, crossfade: 0.5 },
    ),
  ]);

  const outputs = [
    ...Array.from(
      { length: 5 },
      (_, index) =>
        `public/game-assets/audio/footsteps/concrete-${String(index + 1).padStart(2, "0")}.ogg`,
    ),
    ...Array.from(
      { length: 3 },
      (_, index) =>
        `public/game-assets/audio/impacts/generic-${String(index + 1).padStart(2, "0")}.ogg`,
    ),
    ...Array.from(
      { length: 2 },
      (_, index) =>
        `public/game-assets/audio/impacts/metal-${String(index + 1).padStart(2, "0")}.ogg`,
    ),
    "public/game-assets/audio/weapons/pistol-fire-01.ogg",
    "public/game-assets/audio/weapons/pistol-fire-02.ogg",
    "public/game-assets/audio/weapons/pistol-empty.ogg",
    "public/game-assets/audio/weapons/pistol-reload.ogg",
    "public/game-assets/audio/vehicles/door-enter.ogg",
    "public/game-assets/audio/vehicles/door-exit.ogg",
    "public/game-assets/audio/vehicles/engine-idle-loop.ogg",
    "public/game-assets/audio/vehicles/engine-drive-loop.ogg",
    "public/game-assets/audio/vehicles/police-siren-loop.ogg",
    "public/game-assets/audio/ui/objective-start.ogg",
    "public/game-assets/audio/ui/objective-complete.ogg",
    "public/game-assets/audio/ui/objective-failed.ogg",
    "public/game-assets/audio/ui/select.ogg",
    "public/game-assets/audio/ambience/urban-rain-loop.ogg",
  ];

  console.log(
    JSON.stringify(
      {
        sources: SOURCES,
        files: await Promise.all(outputs.map(metadata)),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(workspace, { force: true, recursive: true });
}
