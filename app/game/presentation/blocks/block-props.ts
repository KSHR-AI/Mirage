import { defineBlockAsset } from "./block-asset";

export const BLOCK_HYDRANT = defineBlockAsset({
  colliders: [
    {
      center: [0, 0.48, 0],
      height: 0.96,
      id: "body",
      radius: 0.34,
      shape: "cylinder",
    },
  ],
  id: "street-hydrant",
  parts: [
    {
      id: "foot",
      material: "ink",
      position: [0, 0.07, 0],
      scale: [0.68, 0.14, 0.68],
      shape: "cylinder",
    },
    {
      id: "body",
      material: "paint-red",
      position: [0, 0.48, 0],
      scale: [0.5, 0.82, 0.5],
      shape: "cylinder",
    },
    {
      id: "shoulder",
      material: "paint-red",
      position: [0, 0.82, 0],
      scale: [0.62, 0.36, 0.62],
      shape: "sphere",
    },
    {
      id: "cap",
      material: "paint-red",
      position: [0, 1.05, 0],
      scale: [0.52, 0.28, 0.52],
      shape: "cone",
    },
    {
      id: "cap-bolt",
      material: "brass",
      position: [0, 1.19, 0],
      scale: [0.14, 0.12, 0.14],
      shape: "cylinder",
    },
    {
      id: "left-outlet",
      material: "steel",
      position: [-0.34, 0.72, 0],
      rotation: [0, 0, Math.PI / 2],
      scale: [0.28, 0.34, 0.28],
      shape: "cylinder",
    },
    {
      id: "right-outlet",
      material: "steel",
      position: [0.34, 0.72, 0],
      rotation: [0, 0, Math.PI / 2],
      scale: [0.28, 0.34, 0.28],
      shape: "cylinder",
    },
    {
      desktopOnly: true,
      id: "left-bolt",
      material: "brass",
      position: [-0.52, 0.72, 0],
      rotation: [0, 0, Math.PI / 2],
      scale: [0.12, 0.06, 0.12],
      shape: "cylinder",
    },
    {
      desktopOnly: true,
      id: "right-bolt",
      material: "brass",
      position: [0.52, 0.72, 0],
      rotation: [0, 0, Math.PI / 2],
      scale: [0.12, 0.06, 0.12],
      shape: "cylinder",
    },
  ],
  sockets: [{ id: "top", position: [0, 1.25, 0] }],
});

export const BLOCK_BARREL = defineBlockAsset({
  colliders: [
    {
      center: [0, 0.48, 0],
      height: 0.96,
      id: "body",
      radius: 0.32,
      shape: "cylinder",
    },
  ],
  id: "industrial-barrel",
  parts: [
    {
      id: "body",
      material: "paint-blue",
      position: [0, 0.48, 0],
      scale: [0.62, 0.9, 0.62],
      shape: "cylinder",
    },
    {
      id: "bottom-ring",
      material: "steel",
      position: [0, 0.1, 0],
      scale: [0.67, 0.1, 0.67],
      shape: "cylinder",
    },
    {
      id: "middle-ring",
      material: "steel",
      position: [0, 0.48, 0],
      scale: [0.66, 0.08, 0.66],
      shape: "cylinder",
    },
    {
      id: "top-ring",
      material: "steel",
      position: [0, 0.86, 0],
      scale: [0.67, 0.1, 0.67],
      shape: "cylinder",
    },
    {
      id: "lid",
      material: "ink",
      position: [0, 0.94, 0],
      scale: [0.57, 0.05, 0.57],
      shape: "cylinder",
    },
    {
      desktopOnly: true,
      id: "warning-band",
      material: "safety-yellow",
      position: [0, 0.62, 0],
      scale: [0.635, 0.07, 0.635],
      shape: "cylinder",
    },
  ],
  sockets: [{ id: "stack", position: [0, 0.98, 0] }],
});

export const BLOCK_PROP_ASSETS = Object.freeze([BLOCK_HYDRANT, BLOCK_BARREL]);
