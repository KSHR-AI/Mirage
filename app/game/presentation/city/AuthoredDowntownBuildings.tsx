"use client";

import { useLoader } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  Color,
  Material,
  Mesh,
  MeshStandardMaterial,
  PropertyBinding,
  type Object3D,
} from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import {
  AUTHORED_DOWNTOWN_MODEL_URL,
  AUTHORED_DOWNTOWN_PLACEMENTS,
} from "../../content/authored-downtown";
import { useSharedKtx2Loader } from "../shared/use-shared-ktx2-loader";
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
  const ktx2 = useSharedKtx2Loader();
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
    } else if (powered && material.name === "MI_Concrete") {
      material.color.lerp(new Color("#9ba8a5"), 0.34);
    } else if (powered && material.name === "MI_Trim_MetalConcrete") {
      material.color.lerp(new Color("#78888a"), 0.3);
    } else if (powered && material.name === "MI_Trim_Dark") {
      material.color.lerp(new Color("#526367"), 0.28);
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

  if (material instanceof MeshStandardMaterial) {
    material.envMapIntensity = material.name === "MI_Glass" ? 1.45 : 1.05;
    if (material.name.startsWith("MI_FakeInterior_")) {
      material.emissive.set(powered ? "#ffe7bd" : "#111616");
      material.emissiveIntensity = powered ? 0.52 : 0.025;
      material.emissiveMap = material.map;
      material.metalness = 0;
      material.roughness = 0.72;
    } else if (material.name.startsWith("MI_Interior")) {
      material.emissive.set(powered ? "#6d4d35" : "#080b0b");
      material.emissiveIntensity = powered ? 0.16 : 0.015;
    } else if (material.name === "MI_Glass") {
      material.color.set(powered ? "#9fc6c5" : "#263638");
      material.metalness = 0.18;
      material.roughness = 0.16;
    }
  }

  material.needsUpdate = true;
}
