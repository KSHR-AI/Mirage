import type {
  MissionDefinition,
  MissionPhaseDefinition,
  Vec3,
} from "../core/contracts";

export const AFTERLIGHT_JOB_ID = "afterlight-job" as const;
export const AFTERLIGHT_DEFAULT_SEED = 2407;

export const AFTERLIGHT_PHASE_IDS = {
  boost: "boost",
  keyholder: "keyholder",
  vault: "vault",
  blackout: "blackout",
  run: "afterlight-run",
  debrief: "debrief",
} as const;

export const AFTERLIGHT_OBJECTIVE_IDS = {
  deliverCoupe: "deliver-coupe",
  stealCoupe: "steal-coupe",
  learnDriving: "learn-driving",
  cleanBoost: "clean-boost",
  reachMission: "reach-mission",
  disableCourier: "disable-courier",
  defeatKeyholderGuards: "defeat-keyholder-guards",
  takeVaultCredential: "take-vault-credential",
  openVault: "open-vault",
  takeBearerBonds: "take-bearer-bonds",
  takeAfterlightCore: "take-afterlight-core",
  clearVault: "clear-vault",
  primeBlackout: "prime-blackout",
  disableBackup: "disable-backup",
  holdBlackout: "hold-blackout",
  startAfterlightRun: "start-afterlight-run",
  breakInterceptors: "break-interceptors",
  escapeAfterlightRun: "escape-afterlight-run",
  reachDebrief: "reach-debrief",
  keepBearerBonds: "keep-bearer-bonds",
  deliverAfterlightCore: "deliver-afterlight-core",
} as const;

export const AFTERLIGHT_CHECKPOINT_IDS = {
  keyholder: "afterlight:checkpoint:keyholder",
  vault: "afterlight:checkpoint:vault",
  blackout: "afterlight:checkpoint:blackout",
  run: "afterlight:checkpoint:run",
  debrief: "afterlight:checkpoint:debrief",
} as const;

export const AFTERLIGHT_ITEMS = {
  vaultCredential: "afterlight-vault-credential",
  afterlightCore: "afterlight-core",
  bearerBonds: "afterlight-bearer-bonds",
  keyholderSecured: "afterlight-keyholder-secured",
} as const;

export const AFTERLIGHT_TAGS = {
  stealCoupe: "afterlight:boost:steal-coupe",
  drivingTutorial: "afterlight:boost:driving-tutorial",
  courierDisabled: "afterlight:keyholder:courier-disabled",
  openVault: "afterlight:vault:open",
  primeBlackout: "afterlight:blackout:prime",
  blackoutTriggered: "afterlight:blackout:triggered",
  startRun: "afterlight:run:start",
  deliverCore: "afterlight:debrief:deliver-core",
} as const;

export type AfterlightEncounterVariantId =
  | "embarcadero-switch"
  | "mission-decoy"
  | "north-beach-transfer";

export interface AfterlightEncounterVariant {
  readonly id: AfterlightEncounterVariantId;
  readonly courierRouteId: string;
  readonly courierSpawn: Vec3;
  readonly keyholderSetpieceId: string;
  readonly vaultGuardSetpieceId: string;
  readonly blackoutResponseSetpieceId: string;
  readonly pursuitSetpieceId: string;
  readonly vaultGuardCount: number;
  readonly interceptorCount: number;
}

export interface AfterlightJobDefinition extends MissionDefinition {
  readonly encounter: AfterlightEncounterVariant;
}

export const AFTERLIGHT_ENCOUNTER_VARIANTS = [
  {
    id: "embarcadero-switch",
    courierRouteId: "courier-embarcadero",
    courierSpawn: [70, 1.35, 42],
    keyholderSetpieceId: "afterlight:keyholder:hotel-lobby",
    vaultGuardSetpieceId: "afterlight:vault:split-patrol",
    blackoutResponseSetpieceId: "afterlight:blackout:police-cordon",
    pursuitSetpieceId: "afterlight:run:bridge-interceptors",
    vaultGuardCount: 4,
    interceptorCount: 3,
  },
  {
    id: "mission-decoy",
    courierRouteId: "courier-mission-decoy",
    courierSpawn: [76, 1.35, 42],
    keyholderSetpieceId: "afterlight:keyholder:alley-exchange",
    vaultGuardSetpieceId: "afterlight:vault:roving-pair",
    blackoutResponseSetpieceId: "afterlight:blackout:private-response",
    pursuitSetpieceId: "afterlight:run:tunnel-pincer",
    vaultGuardCount: 5,
    interceptorCount: 2,
  },
  {
    id: "north-beach-transfer",
    courierRouteId: "courier-north-beach",
    courierSpawn: [64, 1.35, 42],
    keyholderSetpieceId: "afterlight:keyholder:club-balcony",
    vaultGuardSetpieceId: "afterlight:vault:locked-shift",
    blackoutResponseSetpieceId: "afterlight:blackout:drone-search",
    pursuitSetpieceId: "afterlight:run:waterfront-box",
    vaultGuardCount: 3,
    interceptorCount: 4,
  },
] as const satisfies readonly AfterlightEncounterVariant[];

export function selectAfterlightEncounter(
  seed: number,
): AfterlightEncounterVariant {
  const integerSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const index =
    ((integerSeed % AFTERLIGHT_ENCOUNTER_VARIANTS.length) +
      AFTERLIGHT_ENCOUNTER_VARIANTS.length) %
    AFTERLIGHT_ENCOUNTER_VARIANTS.length;

  return AFTERLIGHT_ENCOUNTER_VARIANTS[index];
}

function createPhases(
  encounter: AfterlightEncounterVariant,
): readonly MissionPhaseDefinition[] {
  return [
    {
      id: AFTERLIGHT_PHASE_IDS.boost,
      chapter: "Boost",
      location: "SoMa",
      heatFloor: 0,
      checkpointAfter: AFTERLIGHT_CHECKPOINT_IDS.keyholder,
      onEnterEvents: [
        {
          type: "setpiece-triggered",
          tick: 0,
          setpieceId: "afterlight:boost:hero-coupe",
        },
      ],
      objectives: [
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
          label: "Steal the prototype coupe.",
          trigger: {
            type: "event",
            event: "interaction",
            tag: AFTERLIGHT_TAGS.stealCoupe,
          },
          reward: 500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.learnDriving,
          label: "Open it up through the SoMa streets.",
          trigger: {
            type: "event",
            event: "interaction",
            tag: AFTERLIGHT_TAGS.drivingTutorial,
          },
          reward: 500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.cleanBoost,
          label: "Lose the first response unit.",
          optional: true,
          trigger: { type: "heat-mode", mode: "search" },
          reward: 500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.reachMission,
          label: "Reach the Mission District intercept.",
          trigger: {
            type: "volume",
            center: [70, 1.35, 42],
            radius: 9,
            actor: "hero",
            dwellTicks: 30,
          },
          reward: 1500,
        },
      ],
    },
    {
      id: AFTERLIGHT_PHASE_IDS.keyholder,
      chapter: "Keyholder",
      location: "North Beach",
      heatFloor: 0,
      checkpointAfter: AFTERLIGHT_CHECKPOINT_IDS.vault,
      onEnterEvents: [
        {
          type: "setpiece-triggered",
          tick: 0,
          setpieceId: encounter.keyholderSetpieceId,
        },
      ],
      objectives: [
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
          label: "Ram the courier off its route.",
          trigger: {
            type: "event",
            event: "interaction",
            tag: AFTERLIGHT_TAGS.courierDisabled,
          },
          reward: 1000,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards,
          label: "Defeat the courier's two guards.",
          trigger: {
            type: "inventory",
            itemId: AFTERLIGHT_ITEMS.keyholderSecured,
          },
          reward: 1500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.takeVaultCredential,
          label: "Take the vault credential.",
          trigger: {
            type: "inventory",
            itemId: AFTERLIGHT_ITEMS.vaultCredential,
          },
          reward: 1500,
        },
      ],
    },
    {
      id: AFTERLIGHT_PHASE_IDS.vault,
      chapter: "Vault",
      location: "Financial District",
      heatFloor: 1,
      checkpointAfter: AFTERLIGHT_CHECKPOINT_IDS.blackout,
      onEnterEvents: [
        {
          type: "setpiece-triggered",
          tick: 0,
          setpieceId: encounter.vaultGuardSetpieceId,
        },
      ],
      objectives: [
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.openVault,
          label: "Open the Afterlight vault.",
          trigger: {
            type: "all",
            children: [
              {
                type: "inventory",
                itemId: AFTERLIGHT_ITEMS.vaultCredential,
              },
              {
                type: "event",
                event: "interaction",
                tag: AFTERLIGHT_TAGS.openVault,
              },
            ],
          },
          reward: 500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.takeBearerBonds,
          label: "Lift the unmarked bearer bonds.",
          optional: true,
          trigger: {
            type: "inventory",
            itemId: AFTERLIGHT_ITEMS.bearerBonds,
          },
          reward: 1500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.takeAfterlightCore,
          label: "Take the Afterlight core.",
          trigger: {
            type: "all",
            children: [
              {
                type: "event",
                event: "item-collected",
                tag: AFTERLIGHT_ITEMS.afterlightCore,
              },
              {
                type: "inventory",
                itemId: AFTERLIGHT_ITEMS.afterlightCore,
              },
            ],
          },
          reward: 2500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.clearVault,
          label: "Clear the vault with the core.",
          trigger: {
            type: "volume",
            center: [14, 1.1, -30],
            radius: 9,
            actor: "player",
          },
          reward: 2000,
        },
      ],
    },
    {
      id: AFTERLIGHT_PHASE_IDS.blackout,
      chapter: "Blackout",
      location: "Potrero Substation",
      heatFloor: 2,
      checkpointAfter: AFTERLIGHT_CHECKPOINT_IDS.run,
      onEnterEvents: [
        {
          type: "setpiece-triggered",
          tick: 0,
          setpieceId: encounter.blackoutResponseSetpieceId,
        },
      ],
      objectives: [
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.primeBlackout,
          label: "Prime the substation overload.",
          trigger: {
            type: "event",
            event: "interaction",
            tag: AFTERLIGHT_TAGS.primeBlackout,
          },
          reward: 1000,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.disableBackup,
          label: "Disable two response vehicles.",
          optional: true,
          trigger: {
            type: "event",
            event: "vehicle-disabled",
            count: 2,
          },
          reward: 1000,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.holdBlackout,
          label: "Hold the substation through the blackout.",
          trigger: {
            type: "all",
            children: [
              {
                type: "event",
                event: "setpiece-triggered",
                tag: AFTERLIGHT_TAGS.blackoutTriggered,
              },
              { type: "elapsed", ticks: 120 },
            ],
          },
          reward: 2000,
        },
      ],
    },
    {
      id: AFTERLIGHT_PHASE_IDS.run,
      chapter: "Afterlight Run",
      location: "Golden Gate",
      heatFloor: 3,
      checkpointAfter: AFTERLIGHT_CHECKPOINT_IDS.debrief,
      onEnterEvents: [
        {
          type: "setpiece-triggered",
          tick: 0,
          setpieceId: encounter.pursuitSetpieceId,
        },
      ],
      objectives: [
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun,
          label: "Launch the Afterlight run.",
          trigger: {
            type: "event",
            event: "interaction",
            tag: AFTERLIGHT_TAGS.startRun,
          },
          reward: 1000,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.breakInterceptors,
          label: "Break two pursuit interceptors.",
          optional: true,
          trigger: {
            type: "event",
            event: "vehicle-disabled",
            count: 2,
          },
          reward: 1500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.escapeAfterlightRun,
          label: "Cross the bridge before the cordon closes.",
          trigger: {
            type: "volume",
            center: [0, 1.1, -218],
            radius: 12,
            actor: "hero",
            dwellTicks: 15,
          },
          reward: 4000,
        },
      ],
    },
    {
      id: AFTERLIGHT_PHASE_IDS.debrief,
      chapter: "Debrief",
      location: "Marin Safehouse",
      heatFloor: 0,
      onEnterEvents: [
        {
          type: "setpiece-triggered",
          tick: 0,
          setpieceId: "afterlight:debrief:safehouse",
        },
      ],
      objectives: [
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.reachDebrief,
          label: "Reach the Marin safehouse.",
          trigger: {
            type: "volume",
            center: [0, 1.1, -232],
            radius: 10,
            actor: "player",
            dwellTicks: 30,
          },
          reward: 500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.keepBearerBonds,
          label: "Keep the bearer bonds off the books.",
          optional: true,
          trigger: {
            type: "inventory",
            itemId: AFTERLIGHT_ITEMS.bearerBonds,
          },
          reward: 500,
        },
        {
          id: AFTERLIGHT_OBJECTIVE_IDS.deliverAfterlightCore,
          label: "Deliver the Afterlight core.",
          trigger: {
            type: "all",
            children: [
              {
                type: "inventory",
                itemId: AFTERLIGHT_ITEMS.afterlightCore,
              },
              {
                type: "event",
                event: "interaction",
                tag: AFTERLIGHT_TAGS.deliverCore,
              },
            ],
          },
          reward: 2500,
        },
      ],
    },
  ];
}

export function createAfterlightJob(seed: number): AfterlightJobDefinition {
  const encounter = selectAfterlightEncounter(seed);

  return {
    id: AFTERLIGHT_JOB_ID,
    title: "The Afterlight Job",
    encounter,
    phases: createPhases(encounter),
  } satisfies AfterlightJobDefinition;
}

export const AFTERLIGHT_JOB = createAfterlightJob(AFTERLIGHT_DEFAULT_SEED);
