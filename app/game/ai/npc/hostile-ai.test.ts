import { describe, expect, it } from "vitest";

import type { Vec3 } from "../../core/contracts";
import {
  HostileAiSystem,
  type HostileActorFrame,
  type HostileIntent,
  type HostileTargetFrame,
} from "./hostile-ai";
import {
  CLEAR_LINE_OF_SIGHT,
  type PhysicsQueryPort,
  type PhysicsRaycastQuery,
} from "./physics-query";
import { ShooterCoordinator } from "./shooter-coordinator";

function actor(
  actorId: number,
  position: Vec3 = [0, 0, 0],
  overrides: Partial<HostileActorFrame> = {},
): HostileActorFrame {
  return { actorId, position, health: 100, maxHealth: 100, ...overrides };
}

const player: HostileTargetFrame = {
  actorId: 99,
  position: [10, 0, 0],
  velocity: [0, 0, 0],
  alive: true,
};

function obstruction(query: PhysicsRaycastQuery) {
  return {
    kind: "world" as const,
    point: query.origin,
    normal: [1, 0, 0] as const,
    distance: query.maxDistance / 2,
  };
}

function byActor(intents: readonly HostileIntent[], actorId: number) {
  return intents.find((intent) => intent.actorId === actorId);
}

describe("HostileAiSystem", () => {
  it("moves from idle through authored patrol and noise investigation", () => {
    const hostiles = new HostileAiSystem({
      seed: "patrol",
      physics: CLEAR_LINE_OF_SIGHT,
      config: { idleTicks: 1, perceptionChecksPerTick: 1 },
    });
    hostiles.spawn({ actorId: 1, patrolPoints: [[2, 0, 0]] });

    expect(
      hostiles.update({ tick: 0, actors: [actor(1)], targets: [] })[0]?.state,
    ).toBe("idle");
    expect(
      hostiles.update({ tick: 1, actors: [actor(1)], targets: [] })[0],
    ).toMatchObject({
      state: "patrol",
      move: { target: [2, 0, 0], locomotion: "walk" },
    });
    expect(
      hostiles.update({
        tick: 2,
        actors: [actor(1)],
        targets: [],
        noises: [
          {
            id: "impact",
            position: [5, 0, 0],
            createdAtTick: 2,
            expiresAtTick: 2,
          },
        ],
      })[0],
    ).toMatchObject({
      state: "investigate",
      move: { target: [5, 0, 0] },
    });
    expect(
      hostiles.update({
        tick: 3,
        actors: [actor(1, [5, 0, 0])],
        targets: [],
      })[0]?.state,
    ).toBe("patrol");
  });

  it("requires LOS and a completed reaction delay before engaging", () => {
    let queries = 0;
    const blocked: PhysicsQueryPort = {
      raycast: (query) => {
        queries += 1;
        return obstruction(query);
      },
    };
    const hostiles = new HostileAiSystem({
      seed: "blocked",
      physics: blocked,
      config: {
        perceptionChecksPerTick: 1,
        reactionMinTicks: 0,
        reactionMaxTicks: 0,
      },
    });
    hostiles.spawn({ actorId: 1 });
    hostiles.spawn({ actorId: 2 });

    const intents = hostiles.update({
      tick: 0,
      actors: [actor(1), actor(2)],
      targets: [player],
    });
    expect(intents.map((intent) => intent.state)).toEqual(["idle", "idle"]);
    expect(queries).toBe(1);
  });

  it("bounds target raycasts and evaluates nearest candidates first", () => {
    let queries = 0;
    const physics: PhysicsQueryPort = {
      raycast: () => {
        queries += 1;
        return null;
      },
    };
    const hostiles = new HostileAiSystem({
      seed: "bounded",
      physics,
      config: {
        perceptionChecksPerTick: 1,
        targetChecksPerObserver: 1,
        reactionMinTicks: 0,
        reactionMaxTicks: 0,
        seekCoverAfterTicks: 999,
      },
    });
    hostiles.spawn({ actorId: 1 });

    hostiles.update({
      tick: 0,
      actors: [actor(1)],
      targets: [
        { actorId: 98, position: [30, 0, 0] },
        { actorId: 97, position: [5, 0, 0] },
      ],
    });
    expect(queries).toBe(1);
    expect(hostiles.get(1)).toMatchObject({ state: "engage", targetId: 97 });
  });

  it("emits deterministic bursts while allowing only one simultaneous shooter", () => {
    const hostiles = new HostileAiSystem({
      seed: "squad-fire",
      physics: CLEAR_LINE_OF_SIGHT,
      config: {
        perceptionChecksPerTick: 2,
        reactionMinTicks: 2,
        reactionMaxTicks: 2,
        seekCoverAfterTicks: 999,
        flankAfterDeniedTicks: 999,
        maxSimultaneousShooters: 1,
        burstMinShots: 2,
        burstMaxShots: 2,
        shotIntervalTicks: 2,
        burstCooldownTicks: 10,
      },
    });
    hostiles.spawn({ actorId: 2 });
    hostiles.spawn({ actorId: 1 });
    const actors = [actor(2), actor(1)];

    expect(
      hostiles
        .update({ tick: 0, actors, targets: [player] })
        .every((intent) => intent.state === "idle" && !intent.fire),
    ).toBe(true);
    expect(
      hostiles
        .update({ tick: 1, actors, targets: [player] })
        .some((intent) => intent.fire),
    ).toBe(false);
    const reacted = hostiles.update({ tick: 2, actors, targets: [player] });
    expect(reacted.map((intent) => intent.state)).toEqual(["engage", "engage"]);
    expect(byActor(reacted, 1)).toMatchObject({
      burst: { shotCount: 2, shotIntervalTicks: 2 },
      fire: { shotIndex: 0, burstSize: 2 },
    });
    expect(byActor(reacted, 2)?.fire).toBeUndefined();

    const between = hostiles.update({ tick: 3, actors, targets: [player] });
    expect(between.filter((intent) => intent.fire)).toHaveLength(0);
    const completed = hostiles.update({ tick: 4, actors, targets: [player] });
    expect(completed.filter((intent) => intent.fire)).toHaveLength(1);
    expect(byActor(completed, 1)?.fire?.shotIndex).toBe(1);
    const rotated = hostiles.update({ tick: 5, actors, targets: [player] });
    expect(rotated.filter((intent) => intent.fire)).toHaveLength(1);
    expect(byActor(rotated, 2)?.fire?.shotIndex).toBe(0);
  });

  it("cancels an active burst as soon as a budgeted LOS check is blocked", () => {
    let blocked = false;
    const physics: PhysicsQueryPort = {
      raycast: (query) => (blocked ? obstruction(query) : null),
    };
    const hostiles = new HostileAiSystem({
      seed: "dynamic-los",
      physics,
      config: {
        perceptionChecksPerTick: 1,
        reactionMinTicks: 0,
        reactionMaxTicks: 0,
        seekCoverAfterTicks: 999,
        burstMinShots: 3,
        burstMaxShots: 3,
        shotIntervalTicks: 1,
      },
    });
    hostiles.spawn({ actorId: 1 });

    expect(
      hostiles.update({ tick: 0, actors: [actor(1)], targets: [player] })[0]
        ?.fire,
    ).toBeDefined();
    blocked = true;
    expect(
      hostiles.update({ tick: 1, actors: [actor(1)], targets: [player] })[0]
        ?.fire,
    ).toBeUndefined();
    expect(hostiles.shooterCoordinator.activeShooters()).toEqual([]);
  });

  it("takes reserved authored cover and fires from its peek point", () => {
    const physics: PhysicsQueryPort = {
      raycast: (query) => (query.origin[0] === 10 ? obstruction(query) : null),
    };
    const hostiles = new HostileAiSystem({
      seed: "cover",
      physics,
      coverAnchors: [
        {
          id: "crate",
          position: [2, 0, 0],
          normal: [1, 0, 0],
          peekPositions: [[2, 1.55, 1]],
        },
      ],
      config: {
        perceptionChecksPerTick: 1,
        reactionMinTicks: 0,
        reactionMaxTicks: 0,
        seekCoverAfterTicks: 999,
        burstMinShots: 1,
        burstMaxShots: 1,
      },
    });
    hostiles.spawn({ actorId: 1 });

    expect(
      hostiles.update({
        tick: 0,
        actors: [actor(1, [0, 0, 0], { suppressed: true })],
        targets: [player],
      })[0],
    ).toMatchObject({
      state: "cover",
      coverAnchorId: "crate",
      move: { target: [2, 0, 0] },
    });
    expect(hostiles.coverAnchors.reservedBy("crate")).toBe(1);

    expect(
      hostiles.update({
        tick: 1,
        actors: [actor(1, [2, 0, 0])],
        targets: [player],
      })[0],
    ).toMatchObject({
      state: "cover",
      move: undefined,
      fire: { origin: [2, 1.55, 1] },
    });
  });

  it("flanks when denied a shooter slot, then retreats and goes down", () => {
    const physics: PhysicsQueryPort = {
      raycast: (query) => (query.origin[0] === 10 ? obstruction(query) : null),
    };
    const hostiles = new HostileAiSystem({
      seed: "flank",
      physics,
      shooterCoordinator: new ShooterCoordinator(0),
      coverAnchors: [
        {
          id: "flank-crate",
          position: [3, 0, 4],
          normal: [1, 0, 0],
          peekPositions: [[3, 1.55, 5]],
        },
      ],
      config: {
        perceptionChecksPerTick: 1,
        reactionMinTicks: 0,
        reactionMaxTicks: 0,
        seekCoverAfterTicks: 999,
        flankAfterDeniedTicks: 1,
      },
    });
    hostiles.spawn({ actorId: 1 });

    expect(
      hostiles.update({ tick: 0, actors: [actor(1)], targets: [player] })[0]
        ?.state,
    ).toBe("engage");
    expect(
      hostiles.update({ tick: 1, actors: [actor(1)], targets: [player] })[0],
    ).toMatchObject({
      state: "flank",
      coverAnchorId: "flank-crate",
      move: { target: [3, 0, 4], locomotion: "run" },
    });

    expect(
      hostiles.update({
        tick: 2,
        actors: [actor(1, [0, 0, 0], { health: 10 })],
        targets: [player],
      })[0],
    ).toMatchObject({ state: "retreat", move: { locomotion: "run" } });
    expect(hostiles.coverAnchors.reservedBy("flank-crate")).toBeUndefined();
    expect(
      hostiles.update({
        tick: 3,
        actors: [actor(1, [0, 0, 0], { health: 0, down: true })],
        targets: [player],
      })[0],
    ).toMatchObject({ state: "down", move: undefined, fire: undefined });
  });
});
