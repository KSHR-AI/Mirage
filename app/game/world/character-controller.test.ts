import { describe, expect, it } from "vitest";
import type { Vec3 } from "../core/contracts";
import {
  INITIAL_CHARACTER_MOTOR_STATE,
  stepKinematicCharacter,
  type CharacterMotorState,
  type CharacterWorld,
} from "./character-controller";

const FLAT_WORLD: CharacterWorld = Object.freeze({
  obstacles: Object.freeze([]),
  sampleGround: () => ({ height: 1, normal: [0, 1, 0] as const }),
});

function advance(
  world: CharacterWorld,
  position: Vec3,
  previous: CharacterMotorState,
  options: { velocity?: Vec3; jumpPressed?: boolean; dt?: number } = {},
) {
  return stepKinematicCharacter({
    position,
    horizontalVelocity: options.velocity ?? [0, 0, 0],
    jumpPressed: options.jumpPressed ?? false,
    dt: options.dt ?? 1 / 60,
    previous,
    world,
  });
}

describe("deterministic kinematic character controller", () => {
  it("integrates a real jump arc and lands on the sampled ground", () => {
    let position: Vec3 = [0, 1, 0];
    let state = INITIAL_CHARACTER_MOTOR_STATE;
    let peak = position[1];

    for (let tick = 0; tick < 120; tick += 1) {
      const result = advance(FLAT_WORLD, position, state, {
        jumpPressed: tick === 0,
      });
      position = result.position;
      state = result.state;
      peak = Math.max(peak, position[1]);
    }

    expect(peak).toBeGreaterThan(2);
    expect(position[1]).toBeCloseTo(1);
    expect(state).toMatchObject({ grounded: true, jumping: false });
  });

  it("permits a coyote-time jump immediately after leaving an edge", () => {
    const ledge: CharacterWorld = {
      obstacles: [],
      sampleGround: (x) => (x <= 0 ? { height: 1, normal: [0, 1, 0] } : null),
    };
    const leftEdge = advance(
      ledge,
      [-0.01, 1, 0],
      INITIAL_CHARACTER_MOTOR_STATE,
      {
        dt: 1 / 30,
        velocity: [2, 0, 0],
      },
    );
    const jumped = advance(ledge, leftEdge.position, leftEdge.state, {
      jumpPressed: true,
    });

    expect(leftEdge.state.grounded).toBe(false);
    expect(leftEdge.state.coyoteTicks).toBeGreaterThan(0);
    expect(jumped.state.jumping).toBe(true);
    expect(jumped.state.verticalVelocity).toBeGreaterThan(0);
  });

  it("buffers a late jump press through the landing frame", () => {
    const falling: CharacterMotorState = {
      grounded: false,
      jumping: false,
      verticalVelocity: -2,
      coyoteTicks: 0,
      jumpBufferTicks: 0,
    };
    const result = advance(FLAT_WORLD, [0, 1.2, 0], falling, {
      jumpPressed: true,
    });

    expect(result.position[1]).toBeGreaterThan(1);
    expect(result.state).toMatchObject({
      grounded: false,
      jumping: true,
      jumpBufferTicks: 0,
    });
    expect(result.state.verticalVelocity).toBeGreaterThan(0);
  });

  it("steps onto curbs but rejects ledges above the configured step height", () => {
    const curb: CharacterWorld = {
      obstacles: [],
      sampleGround: (x) => ({
        height: x < 0 ? 1 : 1.25,
        normal: [0, 1, 0],
      }),
    };
    const ledge: CharacterWorld = {
      obstacles: [],
      sampleGround: (x) => ({
        height: x < 0 ? 1 : 1.8,
        normal: [0, 1, 0],
      }),
    };
    const stepped = advance(
      curb,
      [-0.01, 1, 0],
      INITIAL_CHARACTER_MOTOR_STATE,
      {
        dt: 1 / 30,
        velocity: [2, 0, 0],
      },
    );
    const blocked = advance(
      ledge,
      [-0.01, 1, 0],
      INITIAL_CHARACTER_MOTOR_STATE,
      {
        dt: 1 / 30,
        velocity: [2, 0, 0],
      },
    );

    expect(stepped.position).toEqual([expect.any(Number), 1.25, 0]);
    expect(stepped.position[0]).toBeGreaterThan(0);
    expect(blocked.position[0]).toBeCloseTo(-0.01);
    expect(blocked.position[1]).toBe(1);
  });

  it("slides along walls instead of cancelling the full movement vector", () => {
    const wall: CharacterWorld = {
      obstacles: [
        {
          id: "wall",
          minX: 0,
          maxX: 1,
          minZ: -1,
          maxZ: 1,
          minY: 0,
          maxY: 4,
        },
      ],
      sampleGround: FLAT_WORLD.sampleGround,
    };
    const result = advance(wall, [-0.5, 1, 0], INITIAL_CHARACTER_MOTOR_STATE, {
      dt: 0.25,
      velocity: [4, 0, 2],
    });

    expect(result.position[0]).toBeCloseTo(-0.46);
    expect(result.position[2]).toBeCloseTo(0.5);
  });

  it("follows walkable slopes and reports the vertical component", () => {
    const slope: CharacterWorld = {
      obstacles: [],
      sampleGround: (x) => ({
        height: 1 + x * 0.2,
        normal: [-0.2, 1, 0],
      }),
    };
    const result = advance(slope, [0, 1, 0], INITIAL_CHARACTER_MOTOR_STATE, {
      dt: 0.1,
      velocity: [1, 0, 0],
    });

    expect(result.position).toEqual([0.1, 1.02, 0]);
    expect(result.velocity[1]).toBeCloseTo(0.2);
    expect(result.state.grounded).toBe(true);
    expect(result.groundNormal[1]).toBeGreaterThan(0.98);
  });

  it("rejects slopes above the configured walkable angle", () => {
    const cliff: CharacterWorld = {
      obstacles: [],
      sampleGround: (x) => ({
        height: x < 0 ? 1 : 1.1,
        normal: x < 0 ? [0, 1, 0] : [-2, 1, 0],
      }),
    };
    const result = advance(
      cliff,
      [-0.01, 1, 0],
      INITIAL_CHARACTER_MOTOR_STATE,
      {
        dt: 1 / 30,
        velocity: [2, 0, 0],
      },
    );

    expect(result.position).toEqual([-0.01, 1, 0]);
    expect(result.state.grounded).toBe(true);
  });
});
