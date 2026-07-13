import {
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
} from "../missions/afterlight-job";
import type {
  AfterlightCopyLine,
  AfterlightDebriefRank,
  AfterlightLocation,
  AfterlightLocationKey,
  AfterlightNotificationChannel,
  AfterlightNotificationSpec,
  AfterlightObjectiveId,
  AfterlightObjectivePrompt,
  AfterlightOptionalCallout,
  AfterlightPhaseContent,
  AfterlightPhaseId,
  AfterlightRadioCue,
  AfterlightRadioEvent,
  SelectedAfterlightRadioLine,
} from "./types";

export const AFTERLIGHT_COPY_LIMITS = Object.freeze({
  briefing: 88,
  objective: 64,
  successSting: 72,
  checkpoint: 72,
  failureRetry: 76,
  radio: 72,
  debrief: 64,
  location: 24,
});

function line(id: `afterlight:${string}`, text: string): AfterlightCopyLine {
  return { id, text };
}

function objective(
  objectiveId: AfterlightObjectiveId,
  text: string,
): AfterlightObjectivePrompt {
  return {
    id: `afterlight:objective:${objectiveId}`,
    objectiveId,
    text,
  };
}

export const AFTERLIGHT_LOCATIONS = {
  soma: {
    id: "afterlight:location:soma",
    key: "soma",
    name: "South of Market",
    hudLabel: "SOMA",
  },
  "north-beach": {
    id: "afterlight:location:north-beach",
    key: "north-beach",
    name: "North Beach",
    hudLabel: "NORTH BEACH",
  },
  "financial-district": {
    id: "afterlight:location:financial-district",
    key: "financial-district",
    name: "Financial District",
    hudLabel: "FINANCIAL",
  },
  "potrero-grid": {
    id: "afterlight:location:potrero-grid",
    key: "potrero-grid",
    name: "Potrero Grid",
    hudLabel: "POTRERO GRID",
  },
  "golden-gate": {
    id: "afterlight:location:golden-gate",
    key: "golden-gate",
    name: "Golden Gate",
    hudLabel: "GOLDEN GATE",
  },
  "marin-safehouse": {
    id: "afterlight:location:marin-safehouse",
    key: "marin-safehouse",
    name: "Marin Safehouse",
    hudLabel: "MARIN",
  },
} as const satisfies Record<AfterlightLocationKey, AfterlightLocation>;

export const AFTERLIGHT_NOTIFICATION_SPECS = {
  location: {
    id: "afterlight:notification:location",
    channel: "location",
    priority: "ambient",
    durationMs: 2200,
  },
  briefing: {
    id: "afterlight:notification:briefing",
    channel: "briefing",
    priority: "standard",
    durationMs: 5200,
  },
  objective: {
    id: "afterlight:notification:objective",
    channel: "objective",
    priority: "urgent",
    durationMs: 3600,
  },
  success: {
    id: "afterlight:notification:success",
    channel: "success",
    priority: "standard",
    durationMs: 3000,
  },
  checkpoint: {
    id: "afterlight:notification:checkpoint",
    channel: "checkpoint",
    priority: "standard",
    durationMs: 2800,
  },
  failure: {
    id: "afterlight:notification:failure",
    channel: "failure",
    priority: "critical",
    durationMs: 4800,
  },
  radio: {
    id: "afterlight:notification:radio",
    channel: "radio",
    priority: "ambient",
    durationMs: 3400,
  },
  debrief: {
    id: "afterlight:notification:debrief",
    channel: "debrief",
    priority: "standard",
    durationMs: 4800,
  },
} as const satisfies Record<
  AfterlightNotificationChannel,
  AfterlightNotificationSpec
>;

export const AFTERLIGHT_PHASE_CONTENT = {
  [AFTERLIGHT_PHASE_IDS.boost]: {
    id: "afterlight:phase:boost",
    phaseId: AFTERLIGHT_PHASE_IDS.boost,
    location: "soma",
    briefing: line(
      "afterlight:phase:boost:briefing",
      "Morning traffic is building. Take the prototype coupe before the yard locks down.",
    ),
    activeObjectives: [
      objective(AFTERLIGHT_OBJECTIVE_IDS.stealCoupe, "Steal the car."),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.learnDriving,
        "Open it up through SoMa.",
      ),
      objective(AFTERLIGHT_OBJECTIVE_IDS.cleanBoost, "Lose the cops."),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.reachMission,
        "Reach the Mission intercept.",
      ),
    ],
    successSting: line(
      "afterlight:phase:boost:success",
      "Clean ignition. The city is open.",
    ),
    checkpoint: line(
      "afterlight:phase:boost:checkpoint",
      "Boost secured. Courier route is live.",
    ),
    failureRetry: line(
      "afterlight:phase:boost:failure",
      "The yard closed around you. Reset at the coupe.",
    ),
  },
  [AFTERLIGHT_PHASE_IDS.keyholder]: {
    id: "afterlight:phase:keyholder",
    phaseId: AFTERLIGHT_PHASE_IDS.keyholder,
    location: "north-beach",
    briefing: line(
      "afterlight:phase:keyholder:briefing",
      "The courier carries the only vault credential. Fold the route, then collect.",
    ),
    activeObjectives: [
      objective(AFTERLIGHT_OBJECTIVE_IDS.disableCourier, "Ram the courier."),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards,
        "Clear the escort.",
      ),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.takeVaultCredential,
        "Recover the vault credential.",
      ),
    ],
    successSting: line(
      "afterlight:phase:keyholder:success",
      "Credential found. The tower just became a door.",
    ),
    checkpoint: line(
      "afterlight:phase:keyholder:checkpoint",
      "Credential secured. Financial District is next.",
    ),
    failureRetry: line(
      "afterlight:phase:keyholder:failure",
      "The courier escaped the net. Rewind to the intercept.",
    ),
  },
  [AFTERLIGHT_PHASE_IDS.vault]: {
    id: "afterlight:phase:vault",
    phaseId: AFTERLIGHT_PHASE_IDS.vault,
    location: "financial-district",
    briefing: line(
      "afterlight:phase:vault:briefing",
      "Afterlight sleeps below the tide line. Open the vault and leave with the core.",
    ),
    activeObjectives: [
      objective(AFTERLIGHT_OBJECTIVE_IDS.openVault, "Use the credential."),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.takeBearerBonds,
        "Take the bearer bonds.",
      ),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.takeAfterlightCore,
        "Secure the Afterlight core.",
      ),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.clearVault,
        "Get back to street level.",
      ),
    ],
    successSting: line(
      "afterlight:phase:vault:success",
      "Core in hand. Every light downtown just turned toward you.",
    ),
    checkpoint: line(
      "afterlight:phase:vault:checkpoint",
      "Core secured. Route the pursuit through Potrero.",
    ),
    failureRetry: line(
      "afterlight:phase:vault:failure",
      "Vault response sealed the floor. Retry from the reader.",
    ),
  },
  [AFTERLIGHT_PHASE_IDS.blackout]: {
    id: "afterlight:phase:blackout",
    phaseId: AFTERLIGHT_PHASE_IDS.blackout,
    location: "potrero-grid",
    briefing: line(
      "afterlight:phase:blackout:briefing",
      "Burn the substation long enough to erase your crossing.",
    ),
    activeObjectives: [
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.primeBlackout,
        "Prime the grid overload.",
      ),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.disableBackup,
        "Disable response vehicles.",
      ),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.holdBlackout,
        "Hold through the surge.",
      ),
    ],
    successSting: line(
      "afterlight:phase:blackout:success",
      "The grid is dark. The bridge window is open.",
    ),
    checkpoint: line(
      "afterlight:phase:blackout:checkpoint",
      "Blackout held. The northern route is yours.",
    ),
    failureRetry: line(
      "afterlight:phase:blackout:failure",
      "Backup power caught the surge. Reset at the substation.",
    ),
  },
  [AFTERLIGHT_PHASE_IDS.run]: {
    id: "afterlight:phase:afterlight-run",
    phaseId: AFTERLIGHT_PHASE_IDS.run,
    location: "golden-gate",
    briefing: line(
      "afterlight:phase:afterlight-run:briefing",
      "Cross under full pressure. Break their sight before Marin.",
    ),
    activeObjectives: [
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun,
        "Enter the bridge approach.",
      ),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.breakInterceptors,
        "Disable the interceptors.",
      ),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.escapeAfterlightRun,
        "Cross the Golden Gate.",
      ),
    ],
    successSting: line(
      "afterlight:phase:afterlight-run:success",
      "Cordon behind you. Marin ahead.",
    ),
    checkpoint: line(
      "afterlight:phase:afterlight-run:checkpoint",
      "Bridge cleared. Safehouse channel unlocked.",
    ),
    failureRetry: line(
      "afterlight:phase:afterlight-run:failure",
      "The cordon closed. Restart at the bridge approach.",
    ),
  },
  [AFTERLIGHT_PHASE_IDS.debrief]: {
    id: "afterlight:phase:debrief",
    phaseId: AFTERLIGHT_PHASE_IDS.debrief,
    location: "marin-safehouse",
    briefing: line(
      "afterlight:phase:debrief:briefing",
      "Bring the core inside. Keep the street clean and the handoff quiet.",
    ),
    activeObjectives: [
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.reachDebrief,
        "Leave the coupe at the safehouse.",
      ),
      objective(AFTERLIGHT_OBJECTIVE_IDS.keepBearerBonds, "Keep the bonds."),
      objective(
        AFTERLIGHT_OBJECTIVE_IDS.deliverAfterlightCore,
        "Bring the core inside.",
      ),
    ],
    successSting: line(
      "afterlight:phase:debrief:success",
      "Afterlight delivered. The city keeps the secret.",
    ),
    checkpoint: line(
      "afterlight:phase:debrief:checkpoint",
      "Job complete. The city can have what's left.",
    ),
    failureRetry: line(
      "afterlight:phase:debrief:failure",
      "The handoff was compromised. Retry from the safehouse road.",
    ),
  },
} as const satisfies Record<AfterlightPhaseId, AfterlightPhaseContent>;

export const AFTERLIGHT_RADIO_CUES = {
  "mission.accepted": {
    id: "afterlight:radio:mission-accepted",
    event: "mission.accepted",
    speaker: "broker",
    lines: [
      line(
        "afterlight:radio:mission-accepted:01",
        "Morning traffic is our cover. Move when the yard light turns green.",
      ),
      line(
        "afterlight:radio:mission-accepted:02",
        "Day shift is changing. Take the coupe before the gate rolls shut.",
      ),
    ],
  },
  "boost.vehicle-secured": {
    id: "afterlight:radio:boost-vehicle-secured",
    event: "boost.vehicle-secured",
    speaker: "broker",
    lines: [
      line(
        "afterlight:radio:boost-vehicle-secured:01",
        "Good. Keep the paint clean until Mission.",
      ),
      line(
        "afterlight:radio:boost-vehicle-secured:02",
        "Coupe is live. Thread south and stay below the sirens.",
      ),
    ],
  },
  "crime.vehicle-theft-witnessed": {
    id: "afterlight:radio:vehicle-theft-witnessed",
    event: "crime.vehicle-theft-witnessed",
    speaker: "dispatcher",
    lines: [
      line(
        "afterlight:radio:vehicle-theft-witnessed:01",
        "All units, red prototype coupe reported stolen in SoMa.",
      ),
      line(
        "afterlight:radio:vehicle-theft-witnessed:02",
        "Vehicle theft, SoMa yard. Dark coupe moving north.",
      ),
    ],
  },
  "keyholder.courier-disabled": {
    id: "afterlight:radio:courier-disabled",
    event: "keyholder.courier-disabled",
    speaker: "guard",
    lines: [
      line(
        "afterlight:radio:courier-disabled:01",
        "Courier is hit. Lock the credential and hold the street.",
      ),
      line(
        "afterlight:radio:courier-disabled:02",
        "Route is broken. Shield the case until recovery arrives.",
      ),
    ],
  },
  "keyholder.credential-recovered": {
    id: "afterlight:radio:credential-recovered",
    event: "keyholder.credential-recovered",
    speaker: "broker",
    lines: [
      line(
        "afterlight:radio:credential-recovered:01",
        "Credential is yours. The vault reader is awake.",
      ),
      line(
        "afterlight:radio:credential-recovered:02",
        "You found the key. Financial District, tide level.",
      ),
    ],
  },
  "vault.guard-alerted": {
    id: "afterlight:radio:vault-guard-alerted",
    event: "vault.guard-alerted",
    speaker: "guard",
    lines: [
      line(
        "afterlight:radio:vault-guard-alerted:01",
        "Vault breach. Close the lift and sweep the lower floor.",
      ),
      line(
        "afterlight:radio:vault-guard-alerted:02",
        "Unknown inside the vault. Seal every stairwell.",
      ),
    ],
  },
  "vault.core-stolen": {
    id: "afterlight:radio:vault-core-stolen",
    event: "vault.core-stolen",
    speaker: "dispatcher",
    lines: [
      line(
        "afterlight:radio:vault-core-stolen:01",
        "Priority alarm: Afterlight core is moving street-side.",
      ),
      line(
        "afterlight:radio:vault-core-stolen:02",
        "Financial District alert. Secure the core at any cost.",
      ),
    ],
  },
  "blackout.grid-lost": {
    id: "afterlight:radio:blackout-grid-lost",
    event: "blackout.grid-lost",
    speaker: "dispatcher",
    lines: [
      line(
        "afterlight:radio:blackout-grid-lost:01",
        "Potrero grid is down. Switch to blackout protocol.",
      ),
      line(
        "afterlight:radio:blackout-grid-lost:02",
        "City power event. All units hold major crossings.",
      ),
    ],
  },
  "pursuit.engaged": {
    id: "afterlight:radio:pursuit-engaged",
    event: "pursuit.engaged",
    speaker: "police",
    lines: [
      line(
        "afterlight:radio:pursuit-engaged:01",
        "Driver, kill the engine. This road ends here.",
      ),
      line(
        "afterlight:radio:pursuit-engaged:02",
        "Red coupe, pull over now. Do not test the bridge.",
      ),
    ],
  },
  "pursuit.roadblock-set": {
    id: "afterlight:radio:pursuit-roadblock-set",
    event: "pursuit.roadblock-set",
    speaker: "police",
    lines: [
      line(
        "afterlight:radio:pursuit-roadblock-set:01",
        "Cordon set at the north span. Funnel the coupe.",
      ),
      line(
        "afterlight:radio:pursuit-roadblock-set:02",
        "Bridge units, lock both lanes. No gap to Marin.",
      ),
    ],
  },
  "pursuit.suspect-lost": {
    id: "afterlight:radio:pursuit-suspect-lost",
    event: "pursuit.suspect-lost",
    speaker: "dispatcher",
    lines: [
      line(
        "afterlight:radio:pursuit-suspect-lost:01",
        "Visual lost beyond the north span. Hold the last known line.",
      ),
      line(
        "afterlight:radio:pursuit-suspect-lost:02",
        "No contact. Search northbound exits and waterfront access.",
      ),
    ],
  },
  "mission.safehouse-reached": {
    id: "afterlight:radio:mission-safehouse-reached",
    event: "mission.safehouse-reached",
    speaker: "broker",
    lines: [
      line(
        "afterlight:radio:mission-safehouse-reached:01",
        "Door is open. Bring the core in and leave the heat outside.",
      ),
      line(
        "afterlight:radio:mission-safehouse-reached:02",
        "You made Marin. Lights off, engine cold, straight inside.",
      ),
    ],
  },
} as const satisfies Record<AfterlightRadioEvent, AfterlightRadioCue>;

export const AFTERLIGHT_OPTIONAL_CALLOUTS = {
  [AFTERLIGHT_OBJECTIVE_IDS.cleanBoost]: {
    id: "afterlight:debrief:optional:clean-boost",
    objectiveId: AFTERLIGHT_OBJECTIVE_IDS.cleanBoost,
    completed: line(
      "afterlight:debrief:optional:clean-boost:completed",
      "Clean boost: first response shaken.",
    ),
    missed: line(
      "afterlight:debrief:optional:clean-boost:missed",
      "Clean boost: patrol stayed attached.",
    ),
  },
  [AFTERLIGHT_OBJECTIVE_IDS.takeBearerBonds]: {
    id: "afterlight:debrief:optional:take-bearer-bonds",
    objectiveId: AFTERLIGHT_OBJECTIVE_IDS.takeBearerBonds,
    completed: line(
      "afterlight:debrief:optional:take-bearer-bonds:completed",
      "Off-book bonds recovered.",
    ),
    missed: line(
      "afterlight:debrief:optional:take-bearer-bonds:missed",
      "Bearer bonds left in the vault.",
    ),
  },
  [AFTERLIGHT_OBJECTIVE_IDS.disableBackup]: {
    id: "afterlight:debrief:optional:disable-backup",
    objectiveId: AFTERLIGHT_OBJECTIVE_IDS.disableBackup,
    completed: line(
      "afterlight:debrief:optional:disable-backup:completed",
      "Backup response disabled.",
    ),
    missed: line(
      "afterlight:debrief:optional:disable-backup:missed",
      "Backup response stayed mobile.",
    ),
  },
  [AFTERLIGHT_OBJECTIVE_IDS.breakInterceptors]: {
    id: "afterlight:debrief:optional:break-interceptors",
    objectiveId: AFTERLIGHT_OBJECTIVE_IDS.breakInterceptors,
    completed: line(
      "afterlight:debrief:optional:break-interceptors:completed",
      "Bridge interceptors broken.",
    ),
    missed: line(
      "afterlight:debrief:optional:break-interceptors:missed",
      "Interceptors held the bridge line.",
    ),
  },
  [AFTERLIGHT_OBJECTIVE_IDS.keepBearerBonds]: {
    id: "afterlight:debrief:optional:keep-bearer-bonds",
    objectiveId: AFTERLIGHT_OBJECTIVE_IDS.keepBearerBonds,
    completed: line(
      "afterlight:debrief:optional:keep-bearer-bonds:completed",
      "Bearer bonds reached Marin.",
    ),
    missed: line(
      "afterlight:debrief:optional:keep-bearer-bonds:missed",
      "Bearer bonds lost before the handoff.",
    ),
  },
} as const satisfies Partial<
  Record<AfterlightObjectiveId, AfterlightOptionalCallout>
>;

export const AFTERLIGHT_DEBRIEF_RANKS = [
  {
    id: "afterlight:rank:ghost-wake",
    key: "ghost-wake",
    label: "Ghost Wake",
    minScore: 90,
  },
  {
    id: "afterlight:rank:black-current",
    key: "black-current",
    label: "Black Current",
    minScore: 70,
  },
  {
    id: "afterlight:rank:cold-harbor",
    key: "cold-harbor",
    label: "Cold Harbor",
    minScore: 50,
  },
  {
    id: "afterlight:rank:hard-landing",
    key: "hard-landing",
    label: "Hard Landing",
    minScore: 0,
  },
] as const satisfies readonly AfterlightDebriefRank[];

export function getAfterlightPhaseContent(
  phaseId: AfterlightPhaseId,
): AfterlightPhaseContent {
  return AFTERLIGHT_PHASE_CONTENT[phaseId];
}

export function getAfterlightObjectivePrompt(
  objectiveId: AfterlightObjectiveId,
): AfterlightObjectivePrompt | undefined {
  for (const phase of Object.values(AFTERLIGHT_PHASE_CONTENT)) {
    const prompt = phase.activeObjectives.find(
      (candidate) => candidate.objectiveId === objectiveId,
    );

    if (prompt) return prompt;
  }

  return undefined;
}

export function getAfterlightDebriefRank(score: number): AfterlightDebriefRank {
  const safeScore = Number.isFinite(score) ? score : 0;
  return (
    AFTERLIGHT_DEBRIEF_RANKS.find((rank) => safeScore >= rank.minScore) ??
    AFTERLIGHT_DEBRIEF_RANKS[AFTERLIGHT_DEBRIEF_RANKS.length - 1]
  );
}

function hashVariantKey(
  seed: number,
  entityId: number | string,
  event: AfterlightRadioEvent,
): number {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const entityKey =
    typeof entityId === "number" ? `number:${entityId}` : `string:${entityId}`;
  const key = `${entityKey}\u0000${event}`;
  let hash = (0x811c9dc5 ^ (safeSeed >>> 0)) >>> 0;

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function getAfterlightVariantIndex(
  seed: number,
  entityId: number | string,
  event: AfterlightRadioEvent,
  variantCount: number,
): number {
  if (!Number.isSafeInteger(variantCount) || variantCount < 1) {
    throw new RangeError("variantCount must be a positive safe integer");
  }

  return hashVariantKey(seed, entityId, event) % variantCount;
}

export function selectAfterlightRadioLine(
  seed: number,
  entityId: number | string,
  event: AfterlightRadioEvent,
): SelectedAfterlightRadioLine {
  const cue = AFTERLIGHT_RADIO_CUES[event];
  const index = getAfterlightVariantIndex(
    seed,
    entityId,
    event,
    cue.lines.length,
  );

  return {
    cueId: cue.id,
    event,
    speaker: cue.speaker,
    line: cue.lines[index],
  };
}
