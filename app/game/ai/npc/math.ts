import type { Vec3 } from "../../core/contracts";

export const NPC_EPSILON = 1e-6;

function addVec3(first: Vec3, second: Vec3): Vec3 {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]];
}

export function subtractVec3(first: Vec3, second: Vec3): Vec3 {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

function scaleVec3(vector: Vec3, scalar: number): Vec3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

export function dotVec3(first: Vec3, second: Vec3): number {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

export function lengthVec3(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

export function distanceVec3(first: Vec3, second: Vec3): number {
  return lengthVec3(subtractVec3(first, second));
}

export function distanceSquaredXZ(first: Vec3, second: Vec3): number {
  return (first[0] - second[0]) ** 2 + (first[2] - second[2]) ** 2;
}

export function normalizeVec3(vector: Vec3): Vec3 {
  const length = lengthVec3(vector);
  if (length <= NPC_EPSILON) return [0, 0, 0];
  return scaleVec3(vector, 1 / length);
}

export function withHeight(position: Vec3, height: number): Vec3 {
  return [position[0], position[1] + height, position[2]];
}

export function moveAwayXZ(
  position: Vec3,
  threatPosition: Vec3,
  distance: number,
): Vec3 {
  let direction = normalizeVec3([
    position[0] - threatPosition[0],
    0,
    position[2] - threatPosition[2],
  ]);
  if (lengthVec3(direction) <= NPC_EPSILON) direction = [1, 0, 0];
  return addVec3(position, scaleVec3(direction, distance));
}
