"use client";

import { Clone } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { useSharedKtx2Loader } from "../shared/use-shared-ktx2-loader";
import type { StreetProp } from "./types";

const HYDRANT_MODEL = "/game-assets/models/fire_hydrant.glb";
const MISSION_HYDRANTS: readonly StreetProp[] = Object.freeze([
  {
    color: "#8f2e28",
    id: "licensed-hydrant-boost",
    kind: "hydrant",
    position: [62.3, 0.32, 52],
    rotationY: -0.4,
  },
  {
    color: "#8f2e28",
    id: "licensed-hydrant-keyholder",
    kind: "hydrant",
    position: [62, 0.32, 34.3],
    rotationY: 0.7,
  },
  {
    color: "#8f2e28",
    id: "licensed-hydrant-vault",
    kind: "hydrant",
    position: [21.7, 0.32, -34.3],
    rotationY: -1.1,
  },
  {
    color: "#8f2e28",
    id: "licensed-hydrant-blackout",
    kind: "hydrant",
    position: [-62.3, 0.32, -34.3],
    rotationY: 0.2,
  },
  {
    color: "#8f2e28",
    id: "licensed-hydrant-bridge",
    kind: "hydrant",
    position: [6.3, 0.32, -92],
    rotationY: 1.3,
  },
]);

export function LicensedHydrants({ limit }: { readonly limit: number }) {
  const ktx2 = useSharedKtx2Loader();
  const { scene } = useLoader(GLTFLoader, HYDRANT_MODEL, (loader) => {
    loader.setKTX2Loader(ktx2);
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const model = useMemo(() => {
    const source = scene.getObjectByName("fire_hydrant_aged") ?? scene;
    const prepared = source.clone(true);
    const bounds = new THREE.Box3().setFromObject(prepared);
    const center = bounds.getCenter(new THREE.Vector3());
    prepared.position.x -= center.x;
    prepared.position.y -= bounds.min.y;
    prepared.position.z -= center.z;
    prepared.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = true;
      }
    });
    return prepared;
  }, [scene]);
  const hydrants = MISSION_HYDRANTS.slice(0, limit);

  return (
    <group name="licensed-cc0-hydrants">
      {hydrants.map((hydrant) => (
        <Clone
          key={hydrant.id}
          object={model}
          position={hydrant.position}
          rotation={[0, hydrant.rotationY, 0]}
          scale={1.05}
        />
      ))}
    </group>
  );
}
