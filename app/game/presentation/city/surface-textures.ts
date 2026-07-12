import * as THREE from "three";

export type PbrTextureSet = {
  readonly armMap: THREE.Texture;
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture;
};

export type PbrTextureSources = readonly [
  color: THREE.Texture,
  normal: THREE.Texture,
  arm: THREE.Texture,
];

function repeatedTexture(
  source: THREE.Texture,
  repeatX: number,
  repeatY: number,
  colorSpace: THREE.ColorSpace,
) {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createColorTexture(
  source: THREE.Texture,
  repeat: readonly [number, number],
): THREE.Texture {
  return repeatedTexture(source, repeat[0], repeat[1], THREE.SRGBColorSpace);
}

export function createPbrTextureSet(
  sources: PbrTextureSources,
  repeat: readonly [number, number],
): PbrTextureSet {
  return {
    armMap: repeatedTexture(
      sources[2],
      repeat[0],
      repeat[1],
      THREE.NoColorSpace,
    ),
    map: repeatedTexture(
      sources[0],
      repeat[0],
      repeat[1],
      THREE.SRGBColorSpace,
    ),
    normalMap: repeatedTexture(
      sources[1],
      repeat[0],
      repeat[1],
      THREE.NoColorSpace,
    ),
  };
}

export function disposePbrTextureSet(textureSet: PbrTextureSet) {
  textureSet.map.dispose();
  textureSet.normalMap.dispose();
  textureSet.armMap.dispose();
}

export function liftFacadeColor(color: string): string {
  return `#${new THREE.Color(color)
    .convertLinearToSRGB()
    .lerp(new THREE.Color("#d7d8d2").convertLinearToSRGB(), 0.28)
    .convertSRGBToLinear()
    .getHexString()}`;
}
