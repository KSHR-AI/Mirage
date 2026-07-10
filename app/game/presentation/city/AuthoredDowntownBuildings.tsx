"use client";

import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { Mesh, PropertyBinding, type Object3D } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

import {
  AUTHORED_DOWNTOWN_MODEL_URL,
  AUTHORED_DOWNTOWN_PLACEMENTS,
} from "../../content/authored-downtown";

export type AuthoredDowntownBuildingsProps = {
  readonly onReady?: () => void;
  readonly shadows: boolean;
};

type AuthoredBuildingInstance = {
  readonly id: string;
  readonly model: Object3D;
  readonly position: readonly [number, number, number];
  readonly scale: number;
};

export function AuthoredDowntownBuildings({
  onReady,
  shadows,
}: AuthoredDowntownBuildingsProps) {
  const gl = useThree((state) => state.gl);
  const ktx2 = useMemo(
    () =>
      new KTX2Loader().setTranscoderPath("/vendor/basis/").detectSupport(gl),
    [gl],
  );
  const { scene } = useLoader(
    GLTFLoader,
    AUTHORED_DOWNTOWN_MODEL_URL,
    (loader) => {
      loader.setKTX2Loader(ktx2);
      loader.setMeshoptDecoder(MeshoptDecoder);
    },
  );
  const buildings = useMemo<AuthoredBuildingInstance[]>(
    () =>
      AUTHORED_DOWNTOWN_PLACEMENTS.map((placement) => {
        const runtimeNodeName = PropertyBinding.sanitizeNodeName(
          placement.nodeName,
        );
        const source = scene.getObjectByName(runtimeNodeName);
        if (!source) {
          throw new Error(
            `Downtown asset is missing node ${placement.nodeName}`,
          );
        }
        return {
          id: placement.id,
          model: source.clone(true),
          position: placement.position,
          scale: placement.scale,
        };
      }),
    [scene],
  );

  useLayoutEffect(() => {
    for (const building of buildings) {
      building.model.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = shadows;
        object.receiveShadow = true;
      });
    }
  }, [buildings, shadows]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <group
      name="authored-downtown-buildings"
      userData={{ cameraCollisionRoot: true }}
    >
      {buildings.map((building) => (
        <group
          key={building.id}
          name={building.id}
          position={building.position}
          scale={building.scale}
        >
          <primitive dispose={null} object={building.model} />
        </group>
      ))}
    </group>
  );
}
