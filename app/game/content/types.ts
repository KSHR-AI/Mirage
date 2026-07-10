import {
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
} from "../missions/afterlight-job";

type ValueOf<T> = T[keyof T];

export type AfterlightPhaseId = ValueOf<typeof AFTERLIGHT_PHASE_IDS>;
export type AfterlightObjectiveId = ValueOf<typeof AFTERLIGHT_OBJECTIVE_IDS>;

export type AfterlightLocationKey =
  | "soma"
  | "north-beach"
  | "financial-district"
  | "potrero-grid"
  | "golden-gate"
  | "marin-safehouse";

export type AfterlightNotificationChannel =
  | "location"
  | "briefing"
  | "objective"
  | "success"
  | "checkpoint"
  | "failure"
  | "radio"
  | "debrief";

export type AfterlightNotificationPriority =
  | "ambient"
  | "standard"
  | "urgent"
  | "critical";

export type AfterlightRadioSpeaker =
  | "dispatcher"
  | "broker"
  | "guard"
  | "police";

export type AfterlightRadioEvent =
  | "mission.accepted"
  | "boost.vehicle-secured"
  | "crime.vehicle-theft-witnessed"
  | "keyholder.courier-disabled"
  | "keyholder.credential-recovered"
  | "vault.guard-alerted"
  | "vault.core-stolen"
  | "blackout.grid-lost"
  | "pursuit.engaged"
  | "pursuit.roadblock-set"
  | "pursuit.suspect-lost"
  | "mission.safehouse-reached";

export type AfterlightDebriefRankKey =
  | "ghost-wake"
  | "black-current"
  | "cold-harbor"
  | "hard-landing";

export interface AfterlightCopyLine {
  readonly id: `afterlight:${string}`;
  readonly text: string;
}

export interface AfterlightObjectivePrompt extends AfterlightCopyLine {
  readonly objectiveId: AfterlightObjectiveId;
}

export interface AfterlightPhaseContent {
  readonly id: `afterlight:phase:${string}`;
  readonly phaseId: AfterlightPhaseId;
  readonly location: AfterlightLocationKey;
  readonly briefing: AfterlightCopyLine;
  readonly activeObjectives: readonly AfterlightObjectivePrompt[];
  readonly successSting: AfterlightCopyLine;
  readonly checkpoint: AfterlightCopyLine;
  readonly failureRetry: AfterlightCopyLine;
}

export interface AfterlightLocation {
  readonly id: `afterlight:location:${string}`;
  readonly key: AfterlightLocationKey;
  readonly name: string;
  readonly hudLabel: string;
}

export interface AfterlightNotificationSpec {
  readonly id: `afterlight:notification:${string}`;
  readonly channel: AfterlightNotificationChannel;
  readonly priority: AfterlightNotificationPriority;
  readonly durationMs: number;
}

export interface AfterlightRadioCue {
  readonly id: `afterlight:radio:${string}`;
  readonly event: AfterlightRadioEvent;
  readonly speaker: AfterlightRadioSpeaker;
  readonly lines: readonly [
    AfterlightCopyLine,
    AfterlightCopyLine,
    ...AfterlightCopyLine[],
  ];
}

export interface SelectedAfterlightRadioLine {
  readonly cueId: AfterlightRadioCue["id"];
  readonly event: AfterlightRadioEvent;
  readonly speaker: AfterlightRadioSpeaker;
  readonly line: AfterlightCopyLine;
}

export interface AfterlightOptionalCallout {
  readonly id: `afterlight:debrief:optional:${string}`;
  readonly objectiveId: AfterlightObjectiveId;
  readonly completed: AfterlightCopyLine;
  readonly missed: AfterlightCopyLine;
}

export interface AfterlightDebriefRank {
  readonly id: `afterlight:rank:${string}`;
  readonly key: AfterlightDebriefRankKey;
  readonly label: string;
  readonly minScore: number;
}
