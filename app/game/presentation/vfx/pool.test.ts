import { describe, expect, it } from "vitest";

import {
  VFX_EVENT_SCAN_LIMIT,
  resolveVfxBudget,
  vfxEventDuration,
  visitVfxPool,
} from "./pool";
import type { AfterlightVfxEvent } from "./types";

function event(
  id: string,
  kind: AfterlightVfxEvent["kind"],
  tick: number,
): AfterlightVfxEvent {
  return { id, kind, tick, position: [0, 0, 0] };
}

describe("VFX pool planning", () => {
  it("uses immutable quality and reduced-motion budgets", () => {
    expect(resolveVfxBudget("high", false)).toEqual({
      rain: 52,
      smoke: 24,
      sparks: 46,
      pulses: 6,
      lights: 2,
    });
    expect(resolveVfxBudget("high", true).lights).toBe(0);
    expect(resolveVfxBudget("high", true).sparks).toBeLessThan(
      resolveVfxBudget("high", false).sparks,
    );
    expect(Object.isFrozen(resolveVfxBudget("medium", false))).toBe(true);
  });

  it("lets newest active events preempt old events deterministically", () => {
    const events = [
      event("old", "vehicle-impact", 90),
      event("new", "vehicle-impact", 99),
    ];
    const visits: string[] = [];
    const count = visitVfxPool(events, "spark", 10, 100, 0, false, (current) =>
      visits.push(String(current.id)),
    );

    expect(count).toBe(10);
    expect(visits.slice(0, 8)).toEqual(Array(8).fill("new"));
    expect(visits.slice(8)).toEqual(["old", "old"]);
  });

  it("rejects future and expired events and respects per-kind pools", () => {
    const events = [
      event("expired", "bullet-impact", 10),
      event("future", "bullet-impact", 101),
      event("active", "tire-smoke", 90),
    ];
    const smoke: string[] = [];
    const sparks: string[] = [];

    visitVfxPool(events, "smoke", 20, 100, 0, false, (item) =>
      smoke.push(String(item.id)),
    );
    visitVfxPool(events, "spark", 20, 100, 0, false, (item) =>
      sparks.push(String(item.id)),
    );

    expect(smoke).toEqual(["active", "active", "active", "active"]);
    expect(sparks).toEqual([]);
  });

  it("sanitizes authored durations", () => {
    expect(vfxEventDuration(event("default", "explosion", 0))).toBe(78);
    expect(
      vfxEventDuration({
        ...event("custom", "explosion", 0),
        durationTicks: 23.8,
      }),
    ).toBe(23);
    expect(
      vfxEventDuration({
        ...event("invalid", "explosion", 0),
        durationTicks: -4,
      }),
    ).toBe(78);
  });

  it("caps event-history scans independently from GPU capacity", () => {
    const events = Array.from(
      { length: VFX_EVENT_SCAN_LIMIT + 1 },
      (_, index) => event(String(index), "bullet-impact", 100),
    );
    const visited: string[] = [];
    visitVfxPool(events, "spark", 500, 100, 0, false, (item) =>
      visited.push(String(item.id)),
    );

    expect(visited).not.toContain("0");
    expect(visited).toContain(String(VFX_EVENT_SCAN_LIMIT));
    expect(visited).toHaveLength(VFX_EVENT_SCAN_LIMIT * 4);
  });
});
