import type { BlockMaterialId } from "./block-asset";

export type BlockMaterialDefinition = {
  readonly color: string;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly metalness: number;
  readonly opacity?: number;
  readonly roughness: number;
};

export const BLOCK_MATERIALS: Readonly<
  Record<BlockMaterialId, BlockMaterialDefinition>
> = Object.freeze({
  asphalt: Object.freeze({
    color: "#394448",
    metalness: 0.08,
    roughness: 0.92,
  }),
  brass: Object.freeze({ color: "#c6923e", metalness: 0.72, roughness: 0.3 }),
  concrete: Object.freeze({
    color: "#7b8585",
    metalness: 0.02,
    roughness: 0.9,
  }),
  glass: Object.freeze({
    color: "#93c3c6",
    metalness: 0.16,
    opacity: 0.64,
    roughness: 0.12,
  }),
  "glow-cyan": Object.freeze({
    color: "#8ff5ef",
    emissive: "#49cfc9",
    emissiveIntensity: 2.2,
    metalness: 0.06,
    roughness: 0.24,
  }),
  ink: Object.freeze({ color: "#151b1e", metalness: 0.18, roughness: 0.68 }),
  "paint-blue": Object.freeze({
    color: "#2e6871",
    metalness: 0.32,
    roughness: 0.48,
  }),
  "paint-red": Object.freeze({
    color: "#a83f36",
    metalness: 0.28,
    roughness: 0.52,
  }),
  rubber: Object.freeze({ color: "#101416", metalness: 0.02, roughness: 0.88 }),
  "safety-yellow": Object.freeze({
    color: "#e0b247",
    metalness: 0.18,
    roughness: 0.52,
  }),
  steel: Object.freeze({ color: "#697678", metalness: 0.68, roughness: 0.34 }),
  white: Object.freeze({ color: "#d8dfdc", metalness: 0.08, roughness: 0.64 }),
});
