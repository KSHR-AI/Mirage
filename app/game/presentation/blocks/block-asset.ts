export type BlockAssetQuality = "desktop" | "mobile";
export type BlockVec3 = readonly [number, number, number];

export type BlockShape =
  | "box"
  | "cone"
  | "cylinder"
  | "icosahedron"
  | "plane"
  | "sphere";

export type BlockMaterialId =
  | "asphalt"
  | "brass"
  | "concrete"
  | "glass"
  | "glow-cyan"
  | "ink"
  | "paint-blue"
  | "paint-red"
  | "rubber"
  | "safety-yellow"
  | "steel"
  | "white";

export type BlockPart = {
  readonly desktopOnly?: boolean;
  readonly id: string;
  readonly material: BlockMaterialId;
  readonly position: BlockVec3;
  readonly rotation?: BlockVec3;
  readonly scale: BlockVec3;
  readonly shape: BlockShape;
};

export type BlockSocket = {
  readonly id: string;
  readonly position: BlockVec3;
  readonly rotation?: BlockVec3;
};

export type BlockCollider =
  | {
      readonly center: BlockVec3;
      readonly id: string;
      readonly shape: "box";
      readonly size: BlockVec3;
    }
  | {
      readonly center: BlockVec3;
      readonly height: number;
      readonly id: string;
      readonly radius: number;
      readonly shape: "cylinder";
    };

export type BlockAssetDefinition = {
  readonly colliders: readonly BlockCollider[];
  readonly id: string;
  readonly parts: readonly BlockPart[];
  readonly sockets: readonly BlockSocket[];
};

export const BLOCK_ASSET_BUDGETS = Object.freeze({
  desktop: Object.freeze({ colliders: 8, parts: 64, sockets: 12 }),
  mobile: Object.freeze({ colliders: 4, parts: 32, sockets: 8 }),
});

function isFiniteVec3(value: BlockVec3): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function hasPositiveAxes(value: BlockVec3): boolean {
  return isFiniteVec3(value) && value.every((axis) => axis > 0);
}

function duplicateIds(values: readonly { readonly id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates];
}

export function visibleBlockParts(
  asset: BlockAssetDefinition,
  quality: BlockAssetQuality,
): readonly BlockPart[] {
  return quality === "mobile"
    ? asset.parts.filter((part) => !part.desktopOnly)
    : asset.parts;
}

export function validateBlockAsset(
  asset: BlockAssetDefinition,
  quality: BlockAssetQuality = "desktop",
): string[] {
  const errors: string[] = [];
  const budget = BLOCK_ASSET_BUDGETS[quality];
  const parts = visibleBlockParts(asset, quality);

  if (!asset.id.trim()) errors.push("asset id is required");
  if (parts.length === 0)
    errors.push(`${asset.id}: no visible ${quality} parts`);
  if (parts.length > budget.parts) {
    errors.push(
      `${asset.id}: ${parts.length} parts exceeds ${quality} budget ${budget.parts}`,
    );
  }
  if (asset.colliders.length > budget.colliders) {
    errors.push(
      `${asset.id}: ${asset.colliders.length} colliders exceeds ${quality} budget ${budget.colliders}`,
    );
  }
  if (asset.sockets.length > budget.sockets) {
    errors.push(
      `${asset.id}: ${asset.sockets.length} sockets exceeds ${quality} budget ${budget.sockets}`,
    );
  }

  for (const duplicate of duplicateIds(asset.parts)) {
    errors.push(`${asset.id}: duplicate part id ${duplicate}`);
  }
  for (const duplicate of duplicateIds(asset.colliders)) {
    errors.push(`${asset.id}: duplicate collider id ${duplicate}`);
  }
  for (const duplicate of duplicateIds(asset.sockets)) {
    errors.push(`${asset.id}: duplicate socket id ${duplicate}`);
  }

  for (const part of asset.parts) {
    if (!part.id.trim()) errors.push(`${asset.id}: part id is required`);
    if (!isFiniteVec3(part.position)) {
      errors.push(`${asset.id}/${part.id}: position must be finite`);
    }
    if (part.rotation && !isFiniteVec3(part.rotation)) {
      errors.push(`${asset.id}/${part.id}: rotation must be finite`);
    }
    if (!hasPositiveAxes(part.scale)) {
      errors.push(`${asset.id}/${part.id}: scale axes must be positive`);
    }
  }

  for (const collider of asset.colliders) {
    if (!isFiniteVec3(collider.center)) {
      errors.push(`${asset.id}/${collider.id}: collider center must be finite`);
    }
    if (collider.shape === "box" && !hasPositiveAxes(collider.size)) {
      errors.push(
        `${asset.id}/${collider.id}: collider size axes must be positive`,
      );
    }
    if (
      collider.shape === "cylinder" &&
      (!Number.isFinite(collider.height) ||
        collider.height <= 0 ||
        !Number.isFinite(collider.radius) ||
        collider.radius <= 0)
    ) {
      errors.push(
        `${asset.id}/${collider.id}: cylinder dimensions must be positive`,
      );
    }
  }

  for (const socket of asset.sockets) {
    if (!isFiniteVec3(socket.position)) {
      errors.push(`${asset.id}/${socket.id}: socket position must be finite`);
    }
    if (socket.rotation && !isFiniteVec3(socket.rotation)) {
      errors.push(`${asset.id}/${socket.id}: socket rotation must be finite`);
    }
  }

  return errors;
}

export function defineBlockAsset(
  asset: BlockAssetDefinition,
): BlockAssetDefinition {
  const errors = [
    ...validateBlockAsset(asset, "desktop"),
    ...validateBlockAsset(asset, "mobile"),
  ];
  if (errors.length > 0) throw new Error([...new Set(errors)].join("\n"));
  return Object.freeze(asset);
}

export function getBlockSocket(
  asset: BlockAssetDefinition,
  socketId: string,
): BlockSocket | undefined {
  return asset.sockets.find((socket) => socket.id === socketId);
}
