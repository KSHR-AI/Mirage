import { describe, expect, it } from "vitest";
import {
  AFTERLIGHT_CHECKPOINTS,
  AFTERLIGHT_LANDMARKS,
  AFTERLIGHT_START_CHECKPOINT_ID,
} from "../core/afterlight-state";
import { AFTERLIGHT_CHECKPOINT_IDS } from "../missions/afterlight-job";
import { VEHICLE_PLANAR_FOOTPRINTS } from "../vehicles/building-collision";
import {
  AFTERLIGHT_SPACE_COLLIDERS,
  afterlightSpaceCharacterObstacles,
  pointInsideAfterlightSpaceBox,
} from "./afterlight-space";

describe("Afterlight authored spaces", () => {
  it("keeps every checkpoint and interaction anchor outside solid geometry", () => {
    const points = [
      ...Object.values(AFTERLIGHT_CHECKPOINTS).flatMap((checkpoint) => [
        checkpoint.pose.position,
        ...(checkpoint.vehiclePose ? [checkpoint.vehiclePose.position] : []),
      ]),
      ...Object.values(AFTERLIGHT_LANDMARKS),
    ];

    for (const point of points) {
      expect(
        AFTERLIGHT_SPACE_COLLIDERS.some((box) =>
          pointInsideAfterlightSpaceBox(point, box, 0.46),
        ),
        `solid geometry blocks [${point.join(", ")}]`,
      ).toBe(false);
    }
  });

  it("leaves a clear centerline through the vault's north entrance", () => {
    const start =
      AFTERLIGHT_CHECKPOINTS[AFTERLIGHT_CHECKPOINT_IDS.vault].pose.position;
    const end = AFTERLIGHT_LANDMARKS.vaultReader;

    for (let step = 0; step <= 20; step += 1) {
      const progress = step / 20;
      const point: [number, number, number] = [
        start[0] + (end[0] - start[0]) * progress,
        start[1],
        start[2] + (end[2] - start[2]) * progress,
      ];
      expect(
        AFTERLIGHT_SPACE_COLLIDERS.some((box) =>
          pointInsideAfterlightSpaceBox(point, box, 0.46),
        ),
        `vault approach blocked at [${point.join(", ")}]`,
      ).toBe(false);
    }
  });

  it("keeps the opening handoff lane clear", () => {
    const player =
      AFTERLIGHT_CHECKPOINTS[AFTERLIGHT_START_CHECKPOINT_ID].pose.position;
    const coupe = AFTERLIGHT_LANDMARKS.boostYard;

    for (let step = 0; step <= 16; step += 1) {
      const progress = step / 16;
      const point: [number, number, number] = [
        player[0] + (coupe[0] - player[0]) * progress,
        player[1],
        player[2] + (coupe[2] - player[2]) * progress,
      ];
      expect(
        AFTERLIGHT_SPACE_COLLIDERS.some((box) =>
          pointInsideAfterlightSpaceBox(point, box, 0.6),
        ),
        `opening lane blocked at [${point.join(", ")}]`,
      ).toBe(false);
    }
  });

  it("keeps the opening coupe footprint clear of authored structures", () => {
    const [x, , z] = AFTERLIGHT_LANDMARKS.boostYard;
    const footprint = VEHICLE_PLANAR_FOOTPRINTS.hero;

    for (const box of AFTERLIGHT_SPACE_COLLIDERS) {
      const overlapsX =
        Math.abs(x - box.center[0]) <= box.halfExtents[0] + footprint.halfWidth;
      const overlapsZ =
        Math.abs(z - box.center[2]) <=
        box.halfExtents[2] + footprint.halfLength;
      expect(overlapsX && overlapsZ, box.id).toBe(false);
    }
  });

  it("matches the freight gantry and west perimeter collision", () => {
    expect(
      AFTERLIGHT_SPACE_COLLIDERS.find(
        (box) => box.id === "courier-gantry-west-column",
      ),
    ).toEqual({
      center: [59.55, 3.55, 49],
      coverQuality: 2,
      halfExtents: [0.21, 3.25, 0.24],
      id: "courier-gantry-west-column",
    });
    expect(
      AFTERLIGHT_SPACE_COLLIDERS.find((box) => box.id === "courier-west-fence"),
    ).toEqual({
      center: [59.96, 1.35, 46],
      coverQuality: 1,
      halfExtents: [0.07, 1.08, 5.1],
      id: "courier-west-fence",
    });
  });

  it("creates one character obstacle for every visible collider", () => {
    const obstacles = afterlightSpaceCharacterObstacles();
    expect(obstacles.map((obstacle) => obstacle.id)).toEqual(
      AFTERLIGHT_SPACE_COLLIDERS.map((box) => box.id),
    );
    expect(obstacles.every((obstacle) => obstacle.maxX > obstacle.minX)).toBe(
      true,
    );
    expect(obstacles.every((obstacle) => obstacle.maxZ > obstacle.minZ)).toBe(
      true,
    );
  });
});
