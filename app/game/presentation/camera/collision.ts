import { Object3D, Raycaster, Vector3, type Intersection } from "three";

const CAMERA_PROBE_NEAR = 0.16;
const CAMERA_PROBE_EPSILON = 0.001;

function canBlockCamera(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.cameraCollision === false) return false;
    current = current.parent;
  }
  return true;
}

export function collectCameraCollisionRoots(
  scene: Object3D,
  output: Object3D[],
): readonly Object3D[] {
  output.length = 0;
  scene.traverse((object) => {
    if (object.userData.cameraCollisionRoot === true && object.visible) {
      output.push(object);
    }
  });
  return output;
}

export function probeCameraCollisionDistance(
  raycaster: Raycaster,
  origin: Vector3,
  target: Vector3,
  roots: Object3D[],
  direction: Vector3,
  intersections: Intersection<Object3D>[],
): number | null {
  direction.copy(target).sub(origin);
  const maxDistance = direction.length();
  if (maxDistance <= CAMERA_PROBE_EPSILON || roots.length === 0) return null;

  raycaster.near = CAMERA_PROBE_NEAR;
  raycaster.far = maxDistance;
  raycaster.set(origin, direction.multiplyScalar(1 / maxDistance));
  intersections.length = 0;
  raycaster.intersectObjects(roots, true, intersections);
  const hit = intersections.find((candidate) =>
    canBlockCamera(candidate.object),
  );
  return hit?.distance ?? null;
}

export function nearestCameraCollisionDistance(
  external: number | null | undefined,
  scene: number | null | undefined,
): number | null {
  const validExternal =
    external != null && Number.isFinite(external) && external >= 0
      ? external
      : null;
  const validScene =
    scene != null && Number.isFinite(scene) && scene >= 0 ? scene : null;
  if (validExternal == null) return validScene;
  if (validScene == null) return validExternal;
  return Math.min(validExternal, validScene);
}
