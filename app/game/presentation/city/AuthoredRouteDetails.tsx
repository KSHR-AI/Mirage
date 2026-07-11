"use client";

import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  Mesh,
  MeshStandardMaterial,
  PropertyBinding,
  type Material,
  type Object3D,
} from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

import {
  InstancedModelParts,
  prepareInstancedModelParts,
  type InstancedModelPart,
} from "../models/InstancedModelParts";
import { useSharedKtx2Loader } from "../shared/use-shared-ktx2-loader";
import {
  AUTHORED_ROUTE_FACADE_NODES,
  type AuthoredFacadePlacement,
  type AuthoredRouteFacadeNodeName,
  type AuthoredRoutePlan,
} from "./authored-route-layout";

const ROUTE_ASSET_URLS = [
  "/game-assets/models/modular_urban_apartments_facade.glb",
  "/game-assets/models/modular_fire_escape.glb",
  "/game-assets/models/street_lamp_02.glb",
  "/game-assets/models/metal_trash_can.glb",
  "/game-assets/models/concrete_road_barrier.glb",
] as const;

const FACADE_NODE_NAMES = Object.freeze(
  Object.values(AUTHORED_ROUTE_FACADE_NODES),
) as readonly AuthoredRouteFacadeNodeName[];

export function AuthoredRouteDetails({
  onReady,
  plan,
  shadows,
}: {
  readonly onReady?: () => void;
  readonly plan: AuthoredRoutePlan;
  readonly shadows: boolean;
}) {
  const ktx2 = useSharedKtx2Loader();
  const models = useLoader(GLTFLoader, ROUTE_ASSET_URLS, (loader) => {
    loader.setKTX2Loader(ktx2);
    loader.setMeshoptDecoder(MeshoptDecoder);
  }) as unknown as GLTF[];
  const [
    facadeModel,
    fireEscapeModel,
    streetlightModel,
    binModel,
    barrierModel,
  ] = models;

  if (
    !facadeModel ||
    !fireEscapeModel ||
    !streetlightModel ||
    !binModel ||
    !barrierModel
  ) {
    throw new Error("Authored route asset set is incomplete");
  }

  const facadeParts = useMemo(
    () => prepareFacadeParts(facadeModel.scene),
    [facadeModel.scene],
  );
  const facadeInstances = useMemo(
    () => groupFacadePlacements(plan.facade),
    [plan.facade],
  );
  const fireEscapeParts = useMemo(
    () => prepareInstancedModelParts(fireEscapeModel.scene),
    [fireEscapeModel.scene],
  );
  const streetlightParts = useMemo(
    () => prepareInstancedModelParts(streetlightModel.scene),
    [streetlightModel.scene],
  );
  const binParts = useMemo(
    () => prepareInstancedModelParts(binModel.scene),
    [binModel.scene],
  );
  const barrierParts = useMemo(
    () => prepareInstancedModelParts(barrierModel.scene),
    [barrierModel.scene],
  );

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <group name="authored-route-details" userData={{ cameraCollision: false }}>
      <group name="authored-apartment-facade">
        {facadeInstances.map(([nodeName, instances]) => (
          <InstancedModelParts
            castShadow={shadows}
            instances={instances}
            key={nodeName}
            parts={facadeParts.get(nodeName) ?? []}
            receiveShadow
          />
        ))}
        <InstancedModelParts
          castShadow={shadows}
          instances={plan.fireEscapes}
          parts={fireEscapeParts}
          receiveShadow
        />
      </group>
      <group name="licensed-route-street-assets">
        <InstancedModelParts
          instances={plan.streetlights}
          parts={streetlightParts}
          receiveShadow
        />
        <InstancedModelParts
          castShadow={shadows}
          instances={plan.bins}
          parts={binParts}
          receiveShadow
        />
        <InstancedModelParts
          castShadow={shadows}
          instances={plan.barriers}
          parts={barrierParts}
          receiveShadow
        />
      </group>
    </group>
  );
}

function prepareFacadeParts(
  scene: Object3D,
): ReadonlyMap<AuthoredRouteFacadeNodeName, readonly InstancedModelPart[]> {
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach(prepareFacadeMaterial);
  });
  const parts = new Map<
    AuthoredRouteFacadeNodeName,
    readonly InstancedModelPart[]
  >();
  for (const nodeName of FACADE_NODE_NAMES) {
    const runtimeName = PropertyBinding.sanitizeNodeName(nodeName);
    const source = scene.getObjectByName(runtimeName);
    if (!source) throw new Error(`Facade asset is missing node ${nodeName}`);
    parts.set(nodeName, prepareInstancedModelParts(source));
  }
  return parts;
}

function prepareFacadeMaterial(material: Material) {
  if (
    !(material instanceof MeshStandardMaterial) ||
    material.userData.authoredRoutePrepared
  ) {
    return;
  }
  material.userData.authoredRoutePrepared = true;
  const name = material.name.toLowerCase();
  material.envMapIntensity = 1.2;

  if (name.includes("glass")) {
    material.color.set("#a7c5c3");
    material.emissive.set("#557c80");
    material.emissiveIntensity = 0.24;
    material.metalness = 0.08;
    material.roughness = 0.26;
  } else if (name.includes("plaster")) {
    material.color.set("#d3b09d");
    material.emissive.set("#3d241e");
    material.emissiveIntensity = 0.16;
    material.metalness = 0.02;
    material.roughness = 0.78;
  } else if (name.includes("trim")) {
    material.color.set("#b8ad9a");
    material.emissive.set("#302821");
    material.emissiveIntensity = 0.1;
    material.metalness = 0.12;
    material.roughness = 0.58;
  } else {
    material.color.set("#9da7a5");
    material.emissive.set("#202b2b");
    material.emissiveIntensity = 0.11;
    material.metalness = 0.2;
    material.roughness = 0.5;
  }
  material.needsUpdate = true;
}

function groupFacadePlacements(
  placements: readonly AuthoredFacadePlacement[],
): Array<
  readonly [AuthoredRouteFacadeNodeName, readonly AuthoredFacadePlacement[]]
> {
  const groups = new Map<
    AuthoredRouteFacadeNodeName,
    AuthoredFacadePlacement[]
  >();
  for (const placement of placements) {
    const group = groups.get(placement.nodeName) ?? [];
    group.push(placement);
    groups.set(placement.nodeName, group);
  }
  return [...groups.entries()];
}
