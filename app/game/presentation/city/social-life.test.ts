import { describe, expect, it } from "vitest";

import {
  createSocialCivilianDefinitions,
  sampleSocialCivilianMotion,
} from "./social-life";

describe("social street life", () => {
  it("keeps a performance-bounded authored population by quality", () => {
    const mobile = createSocialCivilianDefinitions("mobile");
    const desktop = createSocialCivilianDefinitions("desktop");

    expect(mobile).toHaveLength(3);
    expect(desktop).toHaveLength(8);
    expect(
      desktop.filter(({ behavior }) => behavior === "conversation"),
    ).toHaveLength(4);
    expect(
      desktop.filter(({ behavior }) => behavior === "crossing"),
    ).toHaveLength(2);
    expect(
      desktop.filter(({ behavior }) => behavior === "waiting"),
    ).toHaveLength(2);
    expect(new Set(desktop.map(({ id }) => id)).size).toBe(desktop.length);
    expect(createSocialCivilianDefinitions("desktop")).toEqual(desktop);
  });

  it("holds crossers at the curb before traversing and returning", () => {
    const crossing = createSocialCivilianDefinitions("mobile")[2];
    const phase = crossing.phaseSeconds;
    const travelSeconds =
      Math.hypot(
        crossing.end[0] - crossing.start[0],
        crossing.end[2] - crossing.start[2],
      ) / crossing.speed;

    const waiting = sampleSocialCivilianMotion(crossing, -phase + 2);
    const outbound = sampleSocialCivilianMotion(
      crossing,
      -phase + crossing.waitSeconds + travelSeconds / 2,
    );
    const farCurb = sampleSocialCivilianMotion(
      crossing,
      -phase + crossing.waitSeconds + travelSeconds + 2,
    );
    const returning = sampleSocialCivilianMotion(
      crossing,
      -phase + crossing.waitSeconds * 2 + travelSeconds * 1.5,
    );

    expect(waiting.walking).toBe(false);
    expect(waiting.position).toEqual(crossing.start);
    expect(outbound.walking).toBe(true);
    expect(outbound.position[0]).toBeCloseTo(0, 5);
    expect(farCurb.walking).toBe(false);
    expect(farCurb.position).toEqual(crossing.end);
    expect(returning.walking).toBe(true);
    expect(returning.position[0]).toBeCloseTo(0, 5);
    expect(returning.heading).toBeCloseTo(crossing.facing + Math.PI, 5);
  });

  it("gives stationary groups subtle deterministic attention shifts", () => {
    const conversation = createSocialCivilianDefinitions("desktop")[0];
    const first = sampleSocialCivilianMotion(conversation, 0);
    const later = sampleSocialCivilianMotion(conversation, 1.4);

    expect(first.behavior).toBe("conversation");
    expect(first.walking).toBe(false);
    expect(first.position).toBe(conversation.start);
    expect(later.heading).not.toBe(first.heading);
    expect(sampleSocialCivilianMotion(conversation, Number.NaN)).toEqual(first);
  });
});
