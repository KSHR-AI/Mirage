import { describe, expect, it } from "vitest";

import { AuthoredCoverAnchors } from "./cover";
import { PerceptionBudget, evaluateThreats } from "./perception";
import {
  hasLineOfSight,
  type PhysicsQueryPort,
  type PhysicsRaycastQuery,
} from "./physics-query";
import { ShooterCoordinator } from "./shooter-coordinator";

function blockingHit(query: PhysicsRaycastQuery, entityId?: number) {
  return {
    kind: "world" as const,
    point: query.origin,
    normal: [1, 0, 0] as const,
    distance: query.maxDistance / 2,
    entityId,
  };
}

describe("NPC perception and coordination", () => {
  it("round-robins a stable perception budget independently of input order", () => {
    const budget = new PerceptionBudget(2);

    expect(budget.select(0, [3, 1, 2])).toEqual([1, 2]);
    expect(budget.select(0, [2, 3, 1])).toEqual([1, 2]);
    expect(budget.select(1, [3, 1, 2])).toEqual([3, 1]);
    expect(budget.select(2, [2, 3, 1])).toEqual([2, 3]);
  });

  it("uses PhysicsQueryPort LOS for visual threats but not audible threats", () => {
    const physics: PhysicsQueryPort = {
      raycast: (query) => blockingHit(query),
    };
    const threat = evaluateThreats(
      [
        {
          id: "blocked-player",
          position: [5, 0, 0],
          sense: "sight",
          severity: 1,
          radius: 20,
          createdAtTick: 0,
          expiresAtTick: 10,
        },
        {
          id: "gunshot",
          position: [8, 0, 0],
          sense: "sound",
          severity: 0.5,
          radius: 20,
          createdAtTick: 0,
          expiresAtTick: 10,
        },
      ],
      {
        actorId: 1,
        actorPosition: [0, 0, 0],
        tick: 0,
        physics,
      },
    );

    expect(threat?.stimulus.id).toBe("gunshot");
    expect(
      hasLineOfSight(
        { raycast: (query) => blockingHit(query, 9) },
        [0, 0, 0],
        [5, 0, 0],
        { targetEntityId: 9 },
      ),
    ).toBe(true);
  });

  it("selects and reserves authored cover with an exposed peek point", () => {
    const physics: PhysicsQueryPort = {
      raycast: (query) => (query.origin[0] === 10 ? blockingHit(query) : null),
    };
    const anchors = new AuthoredCoverAnchors([
      {
        id: "crate-a",
        position: [2, 0, 0],
        normal: [1, 0, 0],
        peekPositions: [[2, 1.5, 1]],
        quality: 2,
      },
      {
        id: "crate-b",
        position: [4, 0, 0],
        normal: [1, 0, 0],
        peekPositions: [[4, 1.5, 1]],
      },
    ]);

    const selected = anchors.select({
      actorId: 7,
      actorPosition: [0, 0, 0],
      threatPosition: [10, 0, 0],
      physics,
      mode: "flank",
      maxDistance: 10,
    });

    expect(selected?.anchor.id).toBe("crate-a");
    expect(selected?.peekPosition).toEqual([2, 1.5, 1]);
    expect(anchors.reserve("crate-a", 7)).toBe(true);
    expect(anchors.reserve("crate-a", 8)).toBe(false);
    anchors.releaseByActor(7);
    expect(anchors.reserve("crate-a", 8)).toBe(true);
  });

  it("caps overlapping shooter leases and rotates a released slot", () => {
    const coordinator = new ShooterCoordinator(1);
    const requests = [
      { shooterId: 2, priority: 1, holdTicks: 2 },
      { shooterId: 1, priority: 1, holdTicks: 2 },
    ];

    expect([...coordinator.coordinate(0, requests)]).toEqual([1]);
    expect([...coordinator.coordinate(1, requests)]).toEqual([1]);
    coordinator.release(1);
    expect([...coordinator.coordinate(2, requests)]).toEqual([2]);
    expect(coordinator.activeShooters()).toEqual([2]);
  });
});
