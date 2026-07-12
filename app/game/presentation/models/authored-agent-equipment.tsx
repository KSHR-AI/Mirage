"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  Box3,
  Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from "three";

import { MuzzleFlash } from "./effects";
import type { ModelQuality } from "./types";

export const SIGNAL_9_MODEL_URL =
  "/game-assets/models/characters/signal_9_pistol.glb";

type Signal9EquipmentProps = {
  readonly mode: "hand" | "holster";
  readonly muzzleFlash: boolean;
  readonly quality: ModelQuality;
};

type PreparedSignal9 = {
  readonly materials: readonly Material[];
  readonly scale: number;
  readonly scene: Object3D;
};

function prepareSignal9(source: Object3D): PreparedSignal9 {
  const scene = source.clone(true);
  const materials = new Map<Material, Material>();
  const bounds = new Box3().setFromObject(scene);
  const size = bounds.getSize(new Vector3());

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const replacements = sourceMaterials.map((sourceMaterial) => {
      const existing = materials.get(sourceMaterial);
      if (existing) return existing;
      const replacement = sourceMaterial.clone();
      if (replacement instanceof MeshStandardMaterial) {
        const name = replacement.name.toLowerCase();
        replacement.color.set(
          name.includes("light")
            ? "#8ba0a4"
            : name.includes("wood")
              ? "#3b2421"
              : name.includes("black")
                ? "#0b1114"
                : "#1b272d",
        );
        replacement.metalness = name.includes("wood") ? 0.06 : 0.78;
        replacement.roughness = name.includes("wood") ? 0.58 : 0.26;
        replacement.envMapIntensity = 1.35;
        replacement.dithering = true;
        replacement.needsUpdate = true;
      }
      materials.set(sourceMaterial, replacement);
      return replacement;
    });
    object.material = Array.isArray(object.material)
      ? replacements
      : replacements[0];
  });

  return {
    materials: [...materials.values()],
    scale: 0.34 / Math.max(1, size.x),
    scene,
  };
}

export function Signal9Equipment({
  mode,
  muzzleFlash,
  quality,
}: Signal9EquipmentProps) {
  const { scene } = useGLTF(SIGNAL_9_MODEL_URL);
  const prepared = useMemo(() => prepareSignal9(scene), [scene]);

  useLayoutEffect(() => {
    prepared.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = quality === "desktop";
      object.receiveShadow = true;
    });
  }, [prepared.scene, quality]);

  useEffect(
    () => () => {
      for (const material of prepared.materials) material.dispose();
    },
    [prepared.materials],
  );

  const hand = mode === "hand";
  return (
    <group
      position={hand ? [0, 0.015, 0] : [0.24, -0.08, 0.06]}
      rotation={hand ? [0, 0, Math.PI / 2] : [0.02, 0.08, -Math.PI / 2]}
    >
      <primitive
        dispose={null}
        object={prepared.scene}
        scale={prepared.scale}
      />
      {hand ? (
        <MuzzleFlash
          active={muzzleFlash}
          position={[0, 0.3, 0]}
          quality={quality}
        />
      ) : null}
    </group>
  );
}
