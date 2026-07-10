import { describe, expect, it } from "vitest";
import {
  AFTERLIGHT_JOB,
  AFTERLIGHT_PHASE_IDS,
} from "../missions/afterlight-job";
import {
  AFTERLIGHT_COPY_LIMITS,
  AFTERLIGHT_DEBRIEF_RANKS,
  AFTERLIGHT_LOCATIONS,
  AFTERLIGHT_NOTIFICATION_SPECS,
  AFTERLIGHT_OPTIONAL_CALLOUTS,
  AFTERLIGHT_PHASE_CONTENT,
  AFTERLIGHT_RADIO_CUES,
  getAfterlightDebriefRank,
  getAfterlightObjectivePrompt,
  getAfterlightPhaseContent,
  getAfterlightVariantIndex,
  selectAfterlightRadioLine,
} from "./afterlight-content";
import type {
  AfterlightCopyLine,
  AfterlightObjectiveId,
  AfterlightRadioEvent,
} from "./types";

const radioEvents = Object.keys(
  AFTERLIGHT_RADIO_CUES,
) as AfterlightRadioEvent[];

function expectLineWithin(line: AfterlightCopyLine, limit: number): void {
  expect(line.text.trim()).toBe(line.text);
  expect(line.text.length, line.id).toBeLessThanOrEqual(limit);
}

describe("Afterlight phase content", () => {
  it("covers all six mission phases and every active objective in order", () => {
    const missionPhaseIds = AFTERLIGHT_JOB.phases.map((phase) => phase.id);

    expect(Object.keys(AFTERLIGHT_PHASE_CONTENT)).toEqual(missionPhaseIds);
    expect(missionPhaseIds).toEqual([
      AFTERLIGHT_PHASE_IDS.boost,
      AFTERLIGHT_PHASE_IDS.keyholder,
      AFTERLIGHT_PHASE_IDS.vault,
      AFTERLIGHT_PHASE_IDS.blackout,
      AFTERLIGHT_PHASE_IDS.run,
      AFTERLIGHT_PHASE_IDS.debrief,
    ]);

    for (const phase of AFTERLIGHT_JOB.phases) {
      const content = getAfterlightPhaseContent(
        phase.id as keyof typeof AFTERLIGHT_PHASE_CONTENT,
      );

      expect(content.phaseId).toBe(phase.id);
      expect(
        content.activeObjectives.map(({ objectiveId }) => objectiveId),
      ).toEqual(phase.objectives.map(({ id }) => id));
      expect(content.briefing.text).not.toHaveLength(0);
      expect(content.successSting.text).not.toHaveLength(0);
      expect(content.checkpoint.text).not.toHaveLength(0);
      expect(content.failureRetry.text).not.toHaveLength(0);
    }
  });

  it("resolves every mission objective to a HUD prompt", () => {
    const objectiveIds = AFTERLIGHT_JOB.phases.flatMap((phase) =>
      phase.objectives.map(({ id }) => id),
    );

    for (const objectiveId of objectiveIds) {
      expect(
        getAfterlightObjectivePrompt(objectiveId as AfterlightObjectiveId)
          ?.objectiveId,
      ).toBe(objectiveId);
    }
  });

  it("keeps phase and objective copy within HUD limits", () => {
    for (const phase of Object.values(AFTERLIGHT_PHASE_CONTENT)) {
      expectLineWithin(phase.briefing, AFTERLIGHT_COPY_LIMITS.briefing);
      expectLineWithin(phase.successSting, AFTERLIGHT_COPY_LIMITS.successSting);
      expectLineWithin(phase.checkpoint, AFTERLIGHT_COPY_LIMITS.checkpoint);
      expectLineWithin(phase.failureRetry, AFTERLIGHT_COPY_LIMITS.failureRetry);

      for (const prompt of phase.activeObjectives) {
        expectLineWithin(prompt, AFTERLIGHT_COPY_LIMITS.objective);
      }
    }
  });
});

describe("Afterlight radio content", () => {
  it("covers every radio role with short subtitle-safe variants", () => {
    const speakers = new Set(
      Object.values(AFTERLIGHT_RADIO_CUES).map(({ speaker }) => speaker),
    );

    expect(speakers).toEqual(
      new Set(["dispatcher", "broker", "guard", "police"]),
    );

    for (const [event, cue] of Object.entries(AFTERLIGHT_RADIO_CUES)) {
      expect(cue.event).toBe(event);
      expect(cue.lines.length).toBeGreaterThanOrEqual(2);
      cue.lines.forEach((radioLine) =>
        expectLineWithin(radioLine, AFTERLIGHT_COPY_LIMITS.radio),
      );
    }
  });

  it("selects variants deterministically from seed, entity, and event", () => {
    const event = "pursuit.engaged" as const;
    const first = selectAfterlightRadioLine(2407, 301, event);

    expect(selectAfterlightRadioLine(2407, 301, event)).toEqual(first);
    expect(first.event).toBe(event);
    expect(first.speaker).toBe("police");
    expect(AFTERLIGHT_RADIO_CUES[event].lines).toContain(first.line);
    expect(selectAfterlightRadioLine(Number.NaN, 301, event)).toEqual(
      selectAfterlightRadioLine(0, 301, event),
    );

    const seedVariants = new Set(
      Array.from({ length: 64 }, (_, seed) =>
        getAfterlightVariantIndex(seed, 301, event, 17),
      ),
    );
    const entityVariants = new Set(
      Array.from({ length: 64 }, (_, entityId) =>
        getAfterlightVariantIndex(2407, entityId, event, 17),
      ),
    );
    const eventVariants = new Set(
      radioEvents.map((radioEvent) =>
        getAfterlightVariantIndex(2407, 301, radioEvent, 17),
      ),
    );

    expect(seedVariants.size).toBeGreaterThan(1);
    expect(entityVariants.size).toBeGreaterThan(1);
    expect(eventVariants.size).toBeGreaterThan(1);
    expect(() => getAfterlightVariantIndex(0, 0, event, 0)).toThrow(RangeError);
  });
});

describe("Afterlight presentation metadata", () => {
  it("provides named locations and bounded notification timing", () => {
    const locations = Object.values(AFTERLIGHT_LOCATIONS);

    expect(new Set(locations.map(({ name }) => name)).size).toBe(
      locations.length,
    );
    for (const location of locations) {
      expect(location.name.length).toBeLessThanOrEqual(
        AFTERLIGHT_COPY_LIMITS.location,
      );
      expect(location.hudLabel.length).toBeLessThanOrEqual(
        AFTERLIGHT_COPY_LIMITS.location,
      );
    }

    for (const [channel, spec] of Object.entries(
      AFTERLIGHT_NOTIFICATION_SPECS,
    )) {
      expect(spec.channel).toBe(channel);
      expect(spec.durationMs).toBeGreaterThanOrEqual(1800);
      expect(spec.durationMs).toBeLessThanOrEqual(6000);
      expect(["ambient", "standard", "urgent", "critical"]).toContain(
        spec.priority,
      );
    }
  });

  it("covers every optional objective and assigns score ranks", () => {
    const missionOptionalIds = AFTERLIGHT_JOB.phases.flatMap((phase) =>
      phase.objectives.filter(({ optional }) => optional).map(({ id }) => id),
    );

    expect(Object.keys(AFTERLIGHT_OPTIONAL_CALLOUTS)).toEqual(
      missionOptionalIds,
    );
    for (const callout of Object.values(AFTERLIGHT_OPTIONAL_CALLOUTS)) {
      expectLineWithin(callout.completed, AFTERLIGHT_COPY_LIMITS.debrief);
      expectLineWithin(callout.missed, AFTERLIGHT_COPY_LIMITS.debrief);
    }

    expect(AFTERLIGHT_DEBRIEF_RANKS.map(({ minScore }) => minScore)).toEqual([
      90, 70, 50, 0,
    ]);
    expect(getAfterlightDebriefRank(100).label).toBe("Ghost Wake");
    expect(getAfterlightDebriefRank(89).label).toBe("Black Current");
    expect(getAfterlightDebriefRank(49).label).toBe("Hard Landing");
    expect(getAfterlightDebriefRank(Number.NaN).label).toBe("Hard Landing");
  });

  it("keeps every authored content ID unique", () => {
    const ids: string[] = [];

    ids.push(
      ...Object.values(AFTERLIGHT_LOCATIONS).map(({ id }) => id),
      ...Object.values(AFTERLIGHT_NOTIFICATION_SPECS).map(({ id }) => id),
      ...AFTERLIGHT_DEBRIEF_RANKS.map(({ id }) => id),
    );

    for (const phase of Object.values(AFTERLIGHT_PHASE_CONTENT)) {
      ids.push(
        phase.id,
        phase.briefing.id,
        phase.successSting.id,
        phase.checkpoint.id,
        phase.failureRetry.id,
        ...phase.activeObjectives.map(({ id }) => id),
      );
    }

    for (const cue of Object.values(AFTERLIGHT_RADIO_CUES)) {
      ids.push(cue.id, ...cue.lines.map(({ id }) => id));
    }

    for (const callout of Object.values(AFTERLIGHT_OPTIONAL_CALLOUTS)) {
      ids.push(callout.id, callout.completed.id, callout.missed.id);
    }

    expect(ids.every((id) => id.startsWith("afterlight:"))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
