"use client";

import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { Color, Material, Mesh, PropertyBinding, type Object3D } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

import {
  AUTHORED_DOWNTOWN_MODEL_URL,
  AUTHORED_DOWNTOWN_PLACEMENTS,
} from "../../content/authored-downtown";
import { isCityLightPowered, type CityPowerState } from "./power";

export type AuthoredDowntownBuildingsProps = {
  readonly onReady?: () => void;
  readonly powerState: CityPowerState;
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
  powerState,
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
      const powered = isCityLightPowered(
        building.id,
        building.position,
        powerState,
      );
      building.model.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = shadows;
        object.receiveShadow = true;
        object.material = prepareMaterial(object.material);
        for (const material of toMaterialList(object.material)) {
          applyBlackoutMaterialState(material, powered);
        }
      });
    }
  }, [buildings, powerState, shadows]);

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

function prepareMaterial(
  material: Material | Material[],
): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((entry) => prepareOneMaterial(entry));
  }
  return prepareOneMaterial(material);
}

function prepareOneMaterial(material: Material): Material {
  if (material.userData.cityPowerPrepared) return material;
  const clone = material.clone();
  clone.userData.cityPowerPrepared = true;
  return clone;
}

function toMaterialList(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function applyBlackoutMaterialState(material: Material, powered: boolean) {
  if ("color" in material && material.color instanceof Color) {
    const baseColorHex =
      typeof material.userData.baseColorHex === "number"
        ? material.userData.baseColorHex
        : material.color.getHex();
    material.userData.baseColorHex = baseColorHex;
    material.color.setHex(baseColorHex);
    if (material.name.startsWith("MI_FakeInterior_")) {
      material.color.multiplyScalar(powered ? 1 : 0.12);
    }
  }

  if ("opacity" in material && typeof material.opacity === "number") {
    const baseOpacity =
      typeof material.userData.baseOpacity === "number"
        ? material.userData.baseOpacity
        : material.opacity;
    material.userData.baseOpacity = baseOpacity;
    if (material.name === "MI_Glass") {
      material.opacity = powered
        ? baseOpacity
        : Math.max(0.24, baseOpacity * 0.6);
      material.transparent = material.opacity < 1;
    }
  }

  material.needsUpdate = true;
}
