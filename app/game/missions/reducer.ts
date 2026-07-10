import type {
  GameEvent,
  GameState,
  MissionDefinition,
  MissionProgress,
  ObjectiveTrigger,
  Tick,
  Vec3,
} from "../core/contracts";

export interface VolumeDwellState {
  readonly ticks: number;
  readonly lastTick: Tick;
}

export interface ObjectiveTriggerState {
  readonly satisfied: boolean;
  readonly eventCount?: number;
  readonly dwellByEntity?: Readonly<Record<string, VolumeDwellState>>;
  readonly children?: readonly ObjectiveTriggerState[];
}

export interface ObjectiveTriggerContext {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  readonly startedAtTick: Tick;
}

export interface ObjectiveTriggerEvaluation {
  readonly satisfied: boolean;
  readonly triggerState: ObjectiveTriggerState;
}

export interface ObjectiveReducerState {
  readonly startedAtTick: Tick;
  readonly triggerState: ObjectiveTriggerState;
}

export interface MissionReducerState {
  readonly missionId: string;
  readonly phaseIndex: number;
  readonly phaseStartedAtTick: Tick;
  readonly enteredPhaseIndex?: number;
  readonly lastReducedTick?: Tick;
  readonly objectives: Readonly<Record<string, ObjectiveReducerState>>;
}

export interface CreateMissionReducerStateOptions {
  readonly phaseStartedAtTick?: Tick;
  readonly phaseEntered?: boolean;
}

export interface MissionReductionOptions {
  readonly fail?: boolean;
}

export interface MissionReduction {
  readonly state: GameState;
  readonly reducerState: MissionReducerState;
  readonly events: readonly GameEvent[];
}

export interface MissionRestore {
  readonly state: GameState;
  readonly reducerState: MissionReducerState;
}

type VolumeTrigger = Extract<ObjectiveTrigger, { type: "volume" }>;

const EMPTY_OBJECTIVE_STATES = Object.freeze({}) as Readonly<
  Record<string, ObjectiveReducerState>
>;

function freezeTriggerState(
  state: ObjectiveTriggerState,
): ObjectiveTriggerState {
  return Object.freeze(state);
}

function freezeEvaluation(
  triggerState: ObjectiveTriggerState,
): ObjectiveTriggerEvaluation {
  return Object.freeze({
    satisfied: triggerState.satisfied,
    triggerState,
  });
}

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

function requiredCount(count: number | undefined): number {
  if (count === undefined) return 1;
  if (!Number.isFinite(count)) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.ceil(count));
}

function requiredTicks(ticks: number | undefined, minimum: number): number {
  if (ticks === undefined) return minimum;
  if (!Number.isFinite(ticks)) return Number.MAX_SAFE_INTEGER;
  return Math.max(minimum, Math.ceil(ticks));
}

function distanceSquared(left: Vec3, right: Vec3): number {
  const x = left[0] - right[0];
  const y = left[1] - right[1];
  const z = left[2] - right[2];
  return x * x + y * y + z * z;
}

function entitiesInsideVolume(
  trigger: VolumeTrigger,
  state: GameState,
): readonly string[] {
  if (!Number.isFinite(trigger.radius) || trigger.radius < 0) return [];

  const radiusSquared = trigger.radius * trigger.radius;
  const entityKeys: string[] = [];

  for (const actor of state.actors.values()) {
    if (
      actor.kind === trigger.actor &&
      distanceSquared(actor.pose.position, trigger.center) <= radiusSquared
    ) {
      entityKeys.push(`actor:${actor.id}`);
    }
  }

  for (const vehicle of state.vehicles.values()) {
    if (
      vehicle.kind === trigger.actor &&
      distanceSquared(vehicle.pose.position, trigger.center) <= radiusSquared
    ) {
      entityKeys.push(`vehicle:${vehicle.id}`);
    }
  }

  return entityKeys;
}

function evaluateEventTrigger(
  trigger: Extract<ObjectiveTrigger, { type: "event" }>,
  context: ObjectiveTriggerContext,
  previousState: ObjectiveTriggerState | undefined,
): ObjectiveTriggerEvaluation {
  const matches = context.events.filter(
    (event) =>
      event.type === trigger.event &&
      (trigger.tag === undefined || eventTag(event) === trigger.tag),
  ).length;
  const eventCount = (previousState?.eventCount ?? 0) + matches;
  return freezeEvaluation(
    freezeTriggerState({
      satisfied: eventCount >= requiredCount(trigger.count),
      eventCount,
    }),
  );
}

function evaluateVolumeTrigger(
  trigger: VolumeTrigger,
  context: ObjectiveTriggerContext,
  previousState: ObjectiveTriggerState | undefined,
): ObjectiveTriggerEvaluation {
  const previousDwell = previousState?.dwellByEntity ?? {};
  const dwellByEntity: Record<string, VolumeDwellState> = {};

  for (const entityKey of entitiesInsideVolume(trigger, context.state)) {
    const previous = previousDwell[entityKey];
    const ticks =
      previous?.lastTick === context.state.tick
        ? previous.ticks
        : previous?.lastTick === context.state.tick - 1
          ? previous.ticks + 1
          : 1;
    dwellByEntity[entityKey] = Object.freeze({
      ticks,
      lastTick: context.state.tick,
    });
  }

  const dwellTarget = requiredTicks(trigger.dwellTicks, 1);
  const satisfied = Object.values(dwellByEntity).some(
    ({ ticks }) => ticks >= dwellTarget,
  );
  return freezeEvaluation(
    freezeTriggerState({
      satisfied,
      dwellByEntity: Object.freeze(dwellByEntity),
    }),
  );
}

export function evaluateObjectiveTrigger(
  trigger: ObjectiveTrigger,
  context: ObjectiveTriggerContext,
  previousState?: ObjectiveTriggerState,
): ObjectiveTriggerEvaluation {
  if (previousState?.satisfied) return freezeEvaluation(previousState);

  switch (trigger.type) {
    case "event":
      return evaluateEventTrigger(trigger, context, previousState);
    case "volume":
      return evaluateVolumeTrigger(trigger, context, previousState);
    case "inventory":
      return freezeEvaluation(
        freezeTriggerState({
          satisfied: context.state.inventory.has(trigger.itemId),
        }),
      );
    case "heat-mode":
      return freezeEvaluation(
        freezeTriggerState({
          satisfied: context.state.heat.mode === trigger.mode,
        }),
      );
    case "elapsed":
      return freezeEvaluation(
        freezeTriggerState({
          satisfied:
            context.state.tick - context.startedAtTick >=
            requiredTicks(trigger.ticks, 0),
        }),
      );
    case "all":
    case "any": {
      const children = trigger.children.map((child, index) =>
        evaluateObjectiveTrigger(
          child,
          context,
          previousState?.children?.[index],
        ),
      );
      const satisfied =
        trigger.type === "all"
          ? children.every((child) => child.satisfied)
          : children.some((child) => child.satisfied);
      return freezeEvaluation(
        freezeTriggerState({
          satisfied,
          children: Object.freeze(
            children.map((evaluation) => evaluation.triggerState),
          ),
        }),
      );
    }
  }
}

export const evaluateTrigger = evaluateObjectiveTrigger;

function assertMissionDefinition(definition: MissionDefinition): void {
  const objectiveIds = new Set<string>();
  for (const phase of definition.phases) {
    for (const objective of phase.objectives) {
      if (objectiveIds.has(objective.id)) {
        throw new Error(`Duplicate mission objective id: ${objective.id}`);
      }
      objectiveIds.add(objective.id);
    }
  }
}

function assertMissionState(
  definition: MissionDefinition,
  state: GameState,
): void {
  if (state.mission.missionId !== definition.id) {
    throw new Error(
      `Mission state ${state.mission.missionId} does not match definition ${definition.id}`,
    );
  }

  const { phaseIndex } = state.mission;
  const validEmptyMission = definition.phases.length === 0 && phaseIndex === 0;
  if (
    !Number.isInteger(phaseIndex) ||
    phaseIndex < 0 ||
    (!validEmptyMission && phaseIndex >= definition.phases.length)
  ) {
    throw new RangeError(`Invalid mission phase index: ${phaseIndex}`);
  }
}

export function createMissionProgress(
  definition: MissionDefinition,
  startedAtTick: Tick,
): MissionProgress {
  assertMissionDefinition(definition);
  return Object.freeze({
    missionId: definition.id,
    phaseIndex: 0,
    completedObjectiveIds: Object.freeze([]),
    completedCheckpointIds: Object.freeze([]),
    completed: definition.phases.length === 0,
    failed: false,
    startedAtTick,
  });
}

export function createMissionReducerState(
  definition: MissionDefinition,
  state: GameState,
  options: CreateMissionReducerStateOptions = {},
): MissionReducerState {
  assertMissionDefinition(definition);
  assertMissionState(definition, state);

  const phaseStartedAtTick =
    options.phaseStartedAtTick ??
    (state.mission.phaseIndex === 0 ? state.mission.startedAtTick : state.tick);

  return Object.freeze({
    missionId: definition.id,
    phaseIndex: state.mission.phaseIndex,
    phaseStartedAtTick,
    ...(options.phaseEntered
      ? { enteredPhaseIndex: state.mission.phaseIndex }
      : {}),
    objectives: EMPTY_OBJECTIVE_STATES,
  });
}

function normalizedReducerState(
  definition: MissionDefinition,
  state: GameState,
  reducerState: MissionReducerState | undefined,
): MissionReducerState {
  if (
    reducerState?.missionId === definition.id &&
    reducerState.phaseIndex === state.mission.phaseIndex &&
    (reducerState.lastReducedTick === undefined ||
      reducerState.lastReducedTick <= state.tick)
  ) {
    return reducerState;
  }
  return createMissionReducerState(definition, state);
}

function eventAtTick(event: GameEvent, tick: Tick): GameEvent {
  return { ...event, tick } as GameEvent;
}

function phaseEntryEvents(
  definition: MissionDefinition,
  phaseIndex: number,
  tick: Tick,
): readonly GameEvent[] {
  return (definition.phases[phaseIndex]?.onEnterEvents ?? []).map((event) =>
    eventAtTick(event, tick),
  );
}

function freezeReducerState(
  reducerState: MissionReducerState,
): MissionReducerState {
  return Object.freeze({
    ...reducerState,
    objectives: Object.freeze(reducerState.objectives),
  });
}

function reduction(
  state: GameState,
  reducerState: MissionReducerState,
  events: readonly GameEvent[],
): MissionReduction {
  return Object.freeze({
    state,
    reducerState,
    events: Object.freeze([...events]),
  });
}

export function failMission(state: GameState): GameState {
  if (state.mission.completed || state.mission.failed) return state;
  return {
    ...state,
    mission: {
      ...state.mission,
      failed: true,
    },
  };
}

export function restoreMissionState(
  definition: MissionDefinition,
  checkpointState: GameState,
): MissionRestore {
  assertMissionDefinition(definition);
  assertMissionState(definition, checkpointState);

  const state = checkpointState.mission.failed
    ? {
        ...checkpointState,
        mission: {
          ...checkpointState.mission,
          failed: false,
        },
      }
    : checkpointState;

  return Object.freeze({
    state,
    reducerState: createMissionReducerState(definition, state, {
      phaseStartedAtTick: state.tick,
    }),
  });
}

export const restoreMission = restoreMissionState;

export function reduceMissionState(
  definition: MissionDefinition,
  state: GameState,
  events: readonly GameEvent[] = [],
  previousReducerState?: MissionReducerState,
  options: MissionReductionOptions = {},
): MissionReduction {
  assertMissionDefinition(definition);
  assertMissionState(definition, state);

  const reducerState = normalizedReducerState(
    definition,
    state,
    previousReducerState,
  );

  if (options.fail) {
    return reduction(
      failMission(state),
      freezeReducerState({
        ...reducerState,
        lastReducedTick: state.tick,
      }),
      [],
    );
  }

  if (state.mission.completed || state.mission.failed) {
    return reduction(state, reducerState, []);
  }

  if (reducerState.lastReducedTick === state.tick) {
    return reduction(state, reducerState, []);
  }

  if (definition.phases.length === 0) {
    return reduction(
      {
        ...state,
        mission: { ...state.mission, completed: true },
      },
      freezeReducerState({
        ...reducerState,
        lastReducedTick: state.tick,
      }),
      [],
    );
  }

  const phaseIndex = state.mission.phaseIndex;
  const phase = definition.phases[phaseIndex];
  if (!phase)
    throw new RangeError(`Invalid mission phase index: ${phaseIndex}`);

  const emittedEvents: GameEvent[] = [];
  let enteredPhaseIndex = reducerState.enteredPhaseIndex;
  let entryEvents: readonly GameEvent[] = [];
  if (enteredPhaseIndex !== phaseIndex) {
    entryEvents = phaseEntryEvents(definition, phaseIndex, state.tick);
    emittedEvents.push(...entryEvents);
    enteredPhaseIndex = phaseIndex;
  }

  const evaluationEvents =
    entryEvents.length === 0 ? events : [...events, ...entryEvents];
  const completedObjectiveIds = [...state.mission.completedObjectiveIds];
  const completedObjectives = new Set(completedObjectiveIds);
  const completedCheckpointIds = [...state.mission.completedCheckpointIds];
  const completedCheckpoints = new Set(completedCheckpointIds);
  let objectiveStates: Record<string, ObjectiveReducerState> = {
    ...reducerState.objectives,
  };
  let reward = 0;

  const activeRequiredObjective = phase.objectives.find(
    (objective) =>
      !objective.optional && !completedObjectives.has(objective.id),
  );

  for (const objective of phase.objectives) {
    const isActive =
      !completedObjectives.has(objective.id) &&
      (objective.optional || objective.id === activeRequiredObjective?.id);
    if (!isActive) continue;

    const previousObjectiveState = objectiveStates[objective.id];
    const startedAtTick = previousObjectiveState?.startedAtTick ?? state.tick;
    const evaluation = evaluateObjectiveTrigger(
      objective.trigger,
      {
        state,
        events: evaluationEvents,
        startedAtTick,
      },
      previousObjectiveState?.triggerState,
    );
    objectiveStates[objective.id] = Object.freeze({
      startedAtTick,
      triggerState: evaluation.triggerState,
    });

    if (!evaluation.satisfied) continue;

    completedObjectives.add(objective.id);
    completedObjectiveIds.push(objective.id);
    reward += objective.reward;
    emittedEvents.push({
      type: "objective-completed",
      tick: state.tick,
      missionId: definition.id,
      objectiveId: objective.id,
    });
  }

  const phaseCompleted = phase.objectives
    .filter((objective) => !objective.optional)
    .every((objective) => completedObjectives.has(objective.id));
  let nextPhaseIndex = phaseIndex;
  let missionCompleted = false;
  let checkpointId = state.checkpointId;
  let phaseStartedAtTick = reducerState.phaseStartedAtTick;

  if (phaseCompleted) {
    if (phase.checkpointAfter) {
      checkpointId = phase.checkpointAfter;
      if (!completedCheckpoints.has(phase.checkpointAfter)) {
        completedCheckpoints.add(phase.checkpointAfter);
        completedCheckpointIds.push(phase.checkpointAfter);
        emittedEvents.push({
          type: "checkpoint-reached",
          tick: state.tick,
          checkpointId: phase.checkpointAfter,
        });
      }
    }

    if (phaseIndex === definition.phases.length - 1) {
      missionCompleted = true;
    } else {
      nextPhaseIndex += 1;
      phaseStartedAtTick = state.tick;
      objectiveStates = {};
      const nextEntryEvents = phaseEntryEvents(
        definition,
        nextPhaseIndex,
        state.tick,
      );
      emittedEvents.push(...nextEntryEvents);
      enteredPhaseIndex = nextPhaseIndex;
    }
  }

  const progressChanged =
    completedObjectiveIds.length !==
      state.mission.completedObjectiveIds.length ||
    completedCheckpointIds.length !==
      state.mission.completedCheckpointIds.length ||
    nextPhaseIndex !== phaseIndex ||
    missionCompleted !== state.mission.completed;
  const nextState =
    progressChanged || reward !== 0 || checkpointId !== state.checkpointId
      ? {
          ...state,
          mission: {
            ...state.mission,
            phaseIndex: nextPhaseIndex,
            completedObjectiveIds,
            completedCheckpointIds,
            completed: missionCompleted,
          },
          cash: state.cash + reward,
          checkpointId,
        }
      : state;

  const nextReducerState = freezeReducerState({
    missionId: definition.id,
    phaseIndex: nextPhaseIndex,
    phaseStartedAtTick,
    enteredPhaseIndex,
    lastReducedTick: state.tick,
    objectives: objectiveStates,
  });

  return reduction(nextState, nextReducerState, emittedEvents);
}

export const reduceMission = reduceMissionState;
