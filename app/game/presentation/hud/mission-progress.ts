import { LOST_SIGHT_TICKS } from "../../ai/police/heat";
import type {
  GameEvent,
  MissionDefinition,
  ObjectiveDefinition,
  ObjectiveTrigger,
  RenderSnapshot,
  Tick,
} from "../../core/contracts";
import {
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_TAGS,
} from "../../missions/afterlight-job";
import type { HudObjectiveProgress, HudObjectiveProgressById } from "./types";

export const EMPTY_HUD_OBJECTIVE_PROGRESS = Object.freeze(
  {},
) as HudObjectiveProgressById;

function eventTag(event: GameEvent): string | undefined {
  switch (event.type) {
    case "crime-witnessed":
      return event.crime;
    case "interaction":
      return event.tag;
    case "item-collected":
      return event.itemId;
    case "objective-completed":
      return event.objectiveId;
    case "checkpoint-reached":
      return event.checkpointId;
    case "setpiece-triggered":
      return event.setpieceId;
    default:
      return undefined;
  }
}

function findTrigger<T extends ObjectiveTrigger["type"]>(
  trigger: ObjectiveTrigger,
  type: T,
  predicate: (
    candidate: Extract<ObjectiveTrigger, { type: T }>,
  ) => boolean = () => true,
): Extract<ObjectiveTrigger, { type: T }> | undefined {
  if (trigger.type === type) {
    const candidate = trigger as Extract<ObjectiveTrigger, { type: T }>;
    return predicate(candidate) ? candidate : undefined;
  }
  if (trigger.type !== "all" && trigger.type !== "any") return undefined;
  for (const child of trigger.children) {
    const candidate = findTrigger(child, type, predicate);
    if (candidate) return candidate;
  }
  return undefined;
}

function activeObjectives(
  definition: MissionDefinition,
  snapshot: RenderSnapshot,
): readonly ObjectiveDefinition[] {
  const phase = definition.phases[snapshot.mission.phaseIndex];
  if (!phase) return [];
  const completed = new Set(snapshot.mission.completedObjectiveIds);
  const activeRequired = phase.objectives.find(
    (objective) => !objective.optional && !completed.has(objective.id),
  );
  return phase.objectives.filter(
    (objective) =>
      !completed.has(objective.id) &&
      (objective.optional || objective.id === activeRequired?.id),
  );
}

function progress(current: number, total: number): HudObjectiveProgress {
  return Object.freeze({
    current: Math.min(total, Math.max(0, current)),
    total,
  });
}

export class AfterlightHudProgressTracker {
  private phaseIndex: number | undefined;
  private readonly eventCounts = new Map<string, number>();
  private readonly startedAtTicks = new Map<string, Tick>();

  reset(): void {
    this.phaseIndex = undefined;
    this.eventCounts.clear();
    this.startedAtTicks.clear();
  }

  sample(
    definition: MissionDefinition,
    snapshot: RenderSnapshot,
    events: readonly GameEvent[] = [],
  ): HudObjectiveProgressById {
    const changedPhase =
      this.phaseIndex !== undefined &&
      this.phaseIndex !== snapshot.mission.phaseIndex;
    if (this.phaseIndex !== snapshot.mission.phaseIndex) {
      this.eventCounts.clear();
      this.startedAtTicks.clear();
      this.phaseIndex = snapshot.mission.phaseIndex;
    }

    const objectives = activeObjectives(definition, snapshot);
    const activeIds = new Set(objectives.map((objective) => objective.id));

    for (const event of events) {
      if (
        event.type === "setpiece-triggered" &&
        event.setpieceId === AFTERLIGHT_TAGS.blackoutTriggered &&
        activeIds.has(AFTERLIGHT_OBJECTIVE_IDS.holdBlackout)
      ) {
        this.startedAtTicks.set(
          AFTERLIGHT_OBJECTIVE_IDS.holdBlackout,
          event.tick,
        );
      }
    }

    if (!changedPhase) {
      for (const objective of objectives) {
        const trigger = findTrigger(
          objective.trigger,
          "event",
          (candidate) => (candidate.count ?? 1) > 1,
        );
        if (!trigger) continue;
        const matches = events.filter(
          (event) =>
            event.type === trigger.event &&
            (trigger.tag === undefined || eventTag(event) === trigger.tag),
        ).length;
        if (matches > 0) {
          this.eventCounts.set(
            objective.id,
            (this.eventCounts.get(objective.id) ?? 0) + matches,
          );
        }
      }
    }

    const result: Record<string, HudObjectiveProgress> = {};
    for (const objective of objectives) {
      const elapsed = findTrigger(objective.trigger, "elapsed");
      const startedAtTick = this.startedAtTicks.get(objective.id);
      if (elapsed && startedAtTick !== undefined) {
        result[objective.id] = progress(
          snapshot.currentTick - startedAtTick,
          elapsed.ticks,
        );
        continue;
      }

      const countedEvent = findTrigger(
        objective.trigger,
        "event",
        (candidate) => (candidate.count ?? 1) > 1,
      );
      if (countedEvent) {
        result[objective.id] = progress(
          this.eventCounts.get(objective.id) ?? 0,
          countedEvent.count ?? 1,
        );
        continue;
      }

      const searchGate = findTrigger(
        objective.trigger,
        "heat-mode",
        (candidate) =>
          candidate.mode === "search" || candidate.mode === "return",
      );
      if (searchGate) {
        result[objective.id] = progress(
          snapshot.heat.unseenTicks,
          LOST_SIGHT_TICKS,
        );
      }
    }

    return Object.freeze(result);
  }
}
