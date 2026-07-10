import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import {
  collectCameraCollisionRoots,
  nearestCameraCollisionDistance,
  probeCameraCollisionDistance,
} from "./collision";

function probe(root: Group) {
  root.updateMatrixWorld(true);
  return probeCameraCollisionDistance(
    new Raycaster(),
    new Vector3(0, 1, 0),
    new Vector3(0, 1, -8),
    [root],
    new Vector3(),
    [],
  );
}

describe("camera collision probes", () => {
  it("returns the nearest static obstruction along the camera boom", () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(4, 4, 1), new MeshBasicMaterial()));
    root.children[0].position.z = -3;

    expect(probe(root)).toBeCloseTo(2.5);
  });

  it("ignores descendants explicitly excluded from camera collision", () => {
    const root = new Group();
    const decoration = new Mesh(
      new BoxGeometry(4, 4, 1),
      new MeshBasicMaterial(),
    );
    decoration.position.z = -3;
    decoration.userData.cameraCollision = false;
    root.add(decoration);

    expect(probe(root)).toBeNull();
  });

  it("collects visible opt-in roots and combines probe sources", () => {
    const scene = new Group();
    const collisionRoot = new Group();
    collisionRoot.userData.cameraCollisionRoot = true;
    const hiddenRoot = new Group();
    hiddenRoot.userData.cameraCollisionRoot = true;
    hiddenRoot.visible = false;
    scene.add(collisionRoot, hiddenRoot);
    const roots: Group[] = [];

    expect(collectCameraCollisionRoots(scene, roots)).toEqual([collisionRoot]);
    expect(nearestCameraCollisionDistance(4, 2.5)).toBe(2.5);
    expect(nearestCameraCollisionDistance(null, 2.5)).toBe(2.5);
    expect(nearestCameraCollisionDistance(Number.NaN, null)).toBeNull();
  });
});
