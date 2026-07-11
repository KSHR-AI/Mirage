import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const cli = path.join(root, "node_modules/.bin/gltf-transform");
const sourcePage =
  "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept";
const sourceUrl =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb";
const output = path.join(root, "public/game-assets/models/hero-coupe.glb");
const workspace = await mkdtemp(path.join(os.tmpdir(), "mirage-car-concept-"));

const chassisNodeName = "BodyUnderside";
const wheelNodeNames = new Set([
  "WheelFrontL",
  "WheelFrontR",
  "WheelRearL",
  "WheelRearR",
]);
const runtimeNodeNames = new Set([chassisNodeName, ...wheelNodeNames]);

const removedNodeNames = new Set([
  "BodyWindshieldWipers",
  "Engine",
  "InteriorFloormats",
  "InteriorPedalAccel",
  "InteriorPedalAccelArm",
  "InteriorPedalBrake",
  "InteriorPedalBrakeArm",
  "InteriorSteeringEmblem",
  "InteriorSteeringHandleL",
  "InteriorSteeringHandleR",
  "License Plate",
  "InteriorRearHatch",
  "InteriorRearPanels",
  "BodyHoodInterior01",
  "BodyHoodInterior02",
  "BodyHoodUnder",
  "InteriorDoorR01",
  "InteriorDoorR02",
  "InteriorDoorR03",
  "InteriorDoorR04",
  "InteriorDoorR05",
  "InteriorDoorR06",
  "InteriorDoorL01",
  "InteriorDoorL02",
  "InteriorDoorL03",
  "InteriorDoorL04",
  "InteriorDoorL05",
  "InteriorDoorL06",
]);

function deleteExtension(owner, extensionName) {
  if (!owner?.extensions?.[extensionName]) return;
  delete owner.extensions[extensionName];
  if (Object.keys(owner.extensions).length === 0) delete owner.extensions;
}

function prepareDocument(source) {
  const document = structuredClone(source);
  const removedNodeIndexes = new Set();
  for (const [index, node] of (document.nodes ?? []).entries()) {
    if (removedNodeNames.has(node.name)) removedNodeIndexes.add(index);
  }

  for (const node of document.nodes ?? []) {
    if (node.children) {
      node.children = node.children.filter(
        (childIndex) => !removedNodeIndexes.has(childIndex),
      );
    }
  }

  for (const mesh of document.meshes ?? []) {
    delete mesh.name;
    for (const primitive of mesh.primitives ?? []) {
      deleteExtension(primitive, "KHR_materials_variants");
    }
  }

  for (const material of document.materials ?? []) {
    deleteExtension(material, "KHR_materials_iridescence");
    if (material.name !== "Glass") continue;
    deleteExtension(material, "KHR_materials_transmission");
    material.alphaMode = "BLEND";
    material.doubleSided = true;
    material.pbrMetallicRoughness ??= {};
    material.pbrMetallicRoughness.baseColorFactor = [0.018, 0.055, 0.065, 0.58];
    material.pbrMetallicRoughness.metallicFactor = 0.15;
    material.pbrMetallicRoughness.roughnessFactor = 0.2;
  }

  deleteExtension(document, "KHR_materials_variants");
  const removedExtensions = new Set([
    "KHR_materials_iridescence",
    "KHR_materials_transmission",
    "KHR_materials_variants",
  ]);
  document.extensionsUsed = (document.extensionsUsed ?? []).filter(
    (extension) => !removedExtensions.has(extension),
  );
  document.extensionsRequired = (document.extensionsRequired ?? []).filter(
    (extension) => !removedExtensions.has(extension),
  );
  return document;
}

function requireChassis(document) {
  const chassis = (document.nodes ?? []).find(
    (node) => node.name === chassisNodeName,
  );
  if (!chassis)
    throw new Error(`Khronos Car Concept is missing ${chassisNodeName}`);
  return chassis;
}

try {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Khronos Car Concept download failed: ${response.status}`);
  }

  const input = path.join(workspace, "CarConcept.glb");
  const extracted = path.join(workspace, "CarConcept.gltf");
  const bodyPrepared = path.join(workspace, "CarConcept-body.gltf");
  const bodyJoined = path.join(workspace, "CarConcept-body-joined.glb");
  const wheelsPrepared = path.join(workspace, "CarConcept-wheels.gltf");
  const merged = path.join(workspace, "CarConcept-merged.glb");
  await writeFile(input, new Uint8Array(await response.arrayBuffer()));
  await run(cli, ["copy", input, extracted], {
    maxBuffer: 32 * 1024 * 1024,
  });

  const sourceDocument = JSON.parse(await readFile(extracted, "utf8"));
  const sourceNodeNames = new Set(
    (sourceDocument.nodes ?? []).map((node) => node.name).filter(Boolean),
  );
  for (const required of runtimeNodeNames) {
    if (!sourceNodeNames.has(required)) {
      throw new Error(`Khronos Car Concept is missing node ${required}`);
    }
  }

  const bodyDocument = prepareDocument(sourceDocument);
  const bodyChassis = requireChassis(bodyDocument);
  bodyChassis.children = (bodyChassis.children ?? []).filter(
    (childIndex) => !wheelNodeNames.has(bodyDocument.nodes[childIndex]?.name),
  );
  for (const node of bodyDocument.nodes ?? []) {
    if (node !== bodyChassis) delete node.name;
  }

  const wheelsDocument = prepareDocument(sourceDocument);
  const wheelRig = requireChassis(wheelsDocument);
  delete wheelRig.mesh;
  wheelRig.name = "WheelRig";
  wheelRig.children = (wheelRig.children ?? []).filter((childIndex) =>
    wheelNodeNames.has(wheelsDocument.nodes[childIndex]?.name),
  );
  for (const node of wheelsDocument.nodes ?? []) {
    if (node !== wheelRig && !wheelNodeNames.has(node.name)) delete node.name;
  }

  await writeFile(bodyPrepared, `${JSON.stringify(bodyDocument)}\n`);
  await writeFile(wheelsPrepared, `${JSON.stringify(wheelsDocument)}\n`);
  const operationLogs = [];
  const bodyResult = await run(
    cli,
    ["join", bodyPrepared, bodyJoined, "--keepNamed", "true"],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  operationLogs.push(bodyResult.stdout, bodyResult.stderr);
  const mergeResult = await run(
    cli,
    ["merge", bodyJoined, wheelsPrepared, merged, "--merge-scenes"],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  operationLogs.push(mergeResult.stdout, mergeResult.stderr);

  await mkdir(path.dirname(output), { recursive: true });
  const optimizeResult = await run(
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
      "--simplify",
      "true",
      "--simplify-ratio",
      "0.45",
      "--simplify-error",
      "0.002",
      "--texture-compress",
      "webp",
      "--texture-size",
      "1024",
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  operationLogs.push(optimizeResult.stdout, optimizeResult.stderr);

  const bytes = await readFile(output);
  console.log(
    JSON.stringify(
      {
        id: "khronos-car-concept",
        sourcePage,
        sourceUrl,
        sourceFile: "CarConcept.glb",
        license: "CC-BY-4.0",
        output: path.relative(root, output),
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        logs: operationLogs.filter(Boolean).join("\n").trim(),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(workspace, { force: true, recursive: true });
}
