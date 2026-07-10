import { describe, expect, it } from "vitest";
import { AFTERLIGHT_LANDMARKS } from "../../core/afterlight-state";
import {
  AFTERLIGHT_ENCOUNTER_VARIANTS,
  AFTERLIGHT_ITEMS,
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
  AFTERLIGHT_TAGS,
  type AfterlightEncounterVariant,
} from "../../missions/afterlight-job";
import type { GameQualityTier } from "../../performance";
import {
  AFTERLIGHT_SETPIECE_ANCHORS,
  INTERACTION_COLORS,
  INTERACTION_MEANINGS,
  SETPIECE_QUALITY_BUDGETS,
  createAfterlightSetpiecePlan,
  resolveAfterlightEncounterVariant,
  withAfterlightCourierPosition,
} from "./plan";
import type {
  AfterlightMissionSetpiecePlan,
  CreateAfterlightSetpiecePlanOptions,
} from "./types";

const DEFAULT_ENCOUNTER = AFTERLIGHT_ENCOUNTER_VARIANTS[0];

function options(
  overrides: Partial<CreateAfterlightSetpiecePlanOptions> = {},
): CreateAfterlightSetpiecePlanOptions {
  return {
    phaseId: AFTERLIGHT_PHASE_IDS.boost,
    completedObjectiveIds: [],
    inventory: [],
    blackout: false,
    encounterVariant: DEFAULT_ENCOUNTER,
    quality: "high",
    reducedMotion: false,
    ...overrides,
  };
}

function planFor(
  phaseId: string,
  overrides: Partial<CreateAfterlightSetpiecePlanOptions> = {},
): AfterlightMissionSetpiecePlan {
  return createAfterlightSetpiecePlan(options({ phaseId, ...overrides }));
}

describe("afterlight mission setpiece plan", () => {
  it("defines a stable three-color interaction language", () => {
    expect(INTERACTION_COLORS).toEqual({
      coral: "#ff6b57",
      lime: "#d8ff62",
      white: "#f5f7f5",
    });
    expect(INTERACTION_MEANINGS).toEqual({
      coral: "action-target",
      lime: "interaction-ready",
      white: "route-or-delivery",
    });
  });

  it("anchors every chapter to the canonical Afterlight landmarks", () => {
    expect(AFTERLIGHT_SETPIECE_ANCHORS).toMatchObject({
      courierYard: [70, 0.3, 42],
      vaultReader: [14, 0.3, -42],
      substationControl: [-70, 0.3, -42],
      bridgeLaunch: [0, 0.3, -114],
      bridgeEscape: [0, 1.15, -218],
      safehouse: [0, 1.15, -232],
    });

    const boost = planFor(AFTERLIGHT_PHASE_IDS.boost);
    const courier = planFor(AFTERLIGHT_PHASE_IDS.keyholder);
    const vault = planFor(AFTERLIGHT_PHASE_IDS.vault);
    const blackout = planFor(AFTERLIGHT_PHASE_IDS.blackout);
    const run = planFor(AFTERLIGHT_PHASE_IDS.run);
    const safehouse = planFor(AFTERLIGHT_PHASE_IDS.debrief);

    expect(boost.kind).toBe("boost");
    expect("anchor" in boost ? boost.anchor : null).toBe(
      AFTERLIGHT_LANDMARKS.boostYard,
    );
    expect(courier.kind).toBe("courier");
    expect("anchor" in courier ? courier.anchor : null).toBe(
      AFTERLIGHT_SETPIECE_ANCHORS.courierYard,
    );
    expect(vault.kind).toBe("vault");
    expect("anchor" in vault ? vault.anchor : null).toBe(
      AFTERLIGHT_SETPIECE_ANCHORS.vaultReader,
    );
    expect(blackout.kind).toBe("blackout");
    expect("anchor" in blackout ? blackout.anchor : null).toBe(
      AFTERLIGHT_SETPIECE_ANCHORS.substationControl,
    );
    expect(run.kind).toBe("pursuit");
    expect("anchor" in run ? run.anchor : null).toBe(
      AFTERLIGHT_SETPIECE_ANCHORS.bridgeLaunch,
    );
    expect(safehouse.kind).toBe("safehouse");
    expect("anchor" in safehouse ? safehouse.anchor : null).toBe(
      AFTERLIGHT_SETPIECE_ANCHORS.safehouse,
    );
  });

  it("moves Boost from the coupe interaction to the Mission route gate", () => {
    const available = planFor(AFTERLIGHT_PHASE_IDS.boost);
    if (available.kind !== "boost") throw new Error("expected boost plan");
    expect(available.heroCoupeVisible).toBe(true);
    expect(available.routeGateVisible).toBe(false);
    expect(available.cues).toEqual([
      expect.objectContaining({
        id: "boost-enter-coupe",
        kind: "interact",
        tone: "lime",
        interactionTag: AFTERLIGHT_TAGS.stealCoupe,
      }),
    ]);

    const stolen = planFor(AFTERLIGHT_PHASE_IDS.boost, {
      completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.stealCoupe],
    });
    if (stolen.kind !== "boost") throw new Error("expected boost plan");
    expect(stolen.heroCoupeVisible).toBe(false);
    expect(stolen.routeGateVisible).toBe(true);
    expect(stolen.cues[0]).toMatchObject({
      id: "boost-reach-mission",
      kind: "destination",
      tone: "white",
      position: AFTERLIGHT_LANDMARKS.missionIntercept,
    });

    const complete = planFor(AFTERLIGHT_PHASE_IDS.boost, {
      completedObjectiveIds: [
        AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
        AFTERLIGHT_OBJECTIVE_IDS.reachMission,
      ],
    });
    if (complete.kind !== "boost") throw new Error("expected boost plan");
    expect(complete.cues).toEqual([]);
  });

  it.each(AFTERLIGHT_ENCOUNTER_VARIANTS)(
    "uses the authoritative runtime courier position for $id",
    (encounter: AfterlightEncounterVariant) => {
      const runtimePosition = [
        encounter.courierSpawn[0] + 3.25,
        encounter.courierSpawn[1],
        encounter.courierSpawn[2] - 5.5,
      ] as const;
      const presentationEncounter = withAfterlightCourierPosition(
        encounter,
        runtimePosition,
      );
      const plan = planFor(AFTERLIGHT_PHASE_IDS.keyholder, {
        encounterVariant: presentationEncounter,
      });
      if (plan.kind !== "courier") throw new Error("expected courier plan");
      expect(plan.anchor).toBe(AFTERLIGHT_SETPIECE_ANCHORS.courierYard);
      expect(plan.courierPosition).toBe(runtimePosition);
      expect(plan.encounter.courierRouteId).toBe(encounter.courierRouteId);
      expect(plan.dressing).toBe(encounter.id);
      expect(plan.cues[0]).toMatchObject({
        kind: "target",
        position: runtimePosition,
        tone: "coral",
      });
      expect(plan.lights[0]?.position).toEqual([
        runtimePosition[0] - 3.8,
        runtimePosition[1] + 4.6,
        runtimePosition[2] - 2.5,
      ]);
    },
  );

  it("reveals the courier credential only after the disable and guards", () => {
    const disabled = planFor(AFTERLIGHT_PHASE_IDS.keyholder, {
      completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.disableCourier],
    });
    if (disabled.kind !== "courier") throw new Error("expected courier plan");
    expect(disabled.courierDisabled).toBe(true);
    expect(disabled.credentialVisible).toBe(false);
    expect(disabled.cues).toEqual([]);

    const cleared = planFor(AFTERLIGHT_PHASE_IDS.keyholder, {
      completedObjectiveIds: [
        AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
        AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards,
      ],
    });
    if (cleared.kind !== "courier") throw new Error("expected courier plan");
    expect(cleared.credentialVisible).toBe(true);
    expect(cleared.cues[0]).toMatchObject({
      id: "courier-take-credential",
      kind: "interact",
      tone: "lime",
    });

    const collected = planFor(AFTERLIGHT_PHASE_IDS.keyholder, {
      completedObjectiveIds: [
        AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
        AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards,
      ],
      inventory: new Set([AFTERLIGHT_ITEMS.vaultCredential]),
    });
    if (collected.kind !== "courier") throw new Error("expected courier plan");
    expect(collected.credentialVisible).toBe(false);
    expect(collected.cues).toEqual([]);
  });

  it("moves the vault through reader, loot, core, and exit states", () => {
    const locked = planFor(AFTERLIGHT_PHASE_IDS.vault);
    if (locked.kind !== "vault") throw new Error("expected vault plan");
    expect(locked.readerReady).toBe(false);
    expect(locked.cues[0]).toMatchObject({
      id: "vault-reader",
      kind: "target",
      tone: "coral",
    });

    const credentialed = planFor(AFTERLIGHT_PHASE_IDS.vault, {
      inventory: [AFTERLIGHT_ITEMS.vaultCredential],
    });
    if (credentialed.kind !== "vault") throw new Error("expected vault plan");
    expect(credentialed.readerReady).toBe(true);
    expect(credentialed.cues[0]).toMatchObject({
      kind: "interact",
      tone: "lime",
      interactionTag: AFTERLIGHT_TAGS.openVault,
    });

    const opened = planFor(AFTERLIGHT_PHASE_IDS.vault, {
      completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.openVault],
      inventory: [AFTERLIGHT_ITEMS.vaultCredential],
    });
    if (opened.kind !== "vault") throw new Error("expected vault plan");
    expect(opened.doorOpen).toBe(true);
    expect(opened.bearerBondsVisible).toBe(true);
    expect(opened.coreVisible).toBe(true);
    expect(opened.cues[0]).toMatchObject({ id: "vault-core", tone: "lime" });

    const carrying = planFor(AFTERLIGHT_PHASE_IDS.vault, {
      completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.openVault],
      inventory: [
        AFTERLIGHT_ITEMS.vaultCredential,
        AFTERLIGHT_ITEMS.afterlightCore,
        AFTERLIGHT_ITEMS.bearerBonds,
      ],
    });
    if (carrying.kind !== "vault") throw new Error("expected vault plan");
    expect(carrying.coreVisible).toBe(false);
    expect(carrying.bearerBondsVisible).toBe(false);
    expect(carrying.exitGateVisible).toBe(true);
    expect(carrying.cues[0]).toMatchObject({
      id: "vault-exit",
      kind: "destination",
      tone: "white",
      position: AFTERLIGHT_SETPIECE_ANCHORS.vaultExit,
    });
  });

  it("turns off substation lights during the blackout", () => {
    const ready = planFor(AFTERLIGHT_PHASE_IDS.blackout);
    if (ready.kind !== "blackout") throw new Error("expected blackout plan");
    expect(ready.primed).toBe(false);
    expect(ready.cues[0]).toMatchObject({
      id: "substation-prime",
      tone: "lime",
      interactionTag: AFTERLIGHT_TAGS.primeBlackout,
    });
    expect(ready.lights.length).toBeGreaterThan(0);

    const dark = planFor(AFTERLIGHT_PHASE_IDS.blackout, {
      blackout: true,
      completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.primeBlackout],
    });
    if (dark.kind !== "blackout") throw new Error("expected blackout plan");
    expect(dark.primed).toBe(true);
    expect(dark.blackout).toBe(true);
    expect(dark.lights).toEqual([]);
  });

  it.each(AFTERLIGHT_ENCOUNTER_VARIANTS)(
    "builds bounded $id bridge roadblocks only after launch",
    (encounter: AfterlightEncounterVariant) => {
      const staging = planFor(AFTERLIGHT_PHASE_IDS.run, {
        encounterVariant: encounter,
      });
      if (staging.kind !== "pursuit") throw new Error("expected pursuit plan");
      expect(staging.roadblocks).toEqual([]);
      expect(staging.cues[0]).toMatchObject({
        id: "afterlight-run-launch",
        tone: "lime",
        interactionTag: AFTERLIGHT_TAGS.startRun,
      });

      const launched = planFor(AFTERLIGHT_PHASE_IDS.run, {
        completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun],
        encounterVariant: encounter,
      });
      if (launched.kind !== "pursuit") throw new Error("expected pursuit plan");
      expect(launched.roadblocks).toHaveLength(encounter.interceptorCount);
      expect(launched.cues[0]).toMatchObject({
        id: "afterlight-run-escape",
        tone: "white",
        position: AFTERLIGHT_SETPIECE_ANCHORS.bridgeEscape,
      });

      const escaped = planFor(AFTERLIGHT_PHASE_IDS.run, {
        completedObjectiveIds: [
          AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun,
          AFTERLIGHT_OBJECTIVE_IDS.escapeAfterlightRun,
        ],
        encounterVariant: encounter,
      });
      if (escaped.kind !== "pursuit") throw new Error("expected pursuit plan");
      expect(escaped.roadblocks).toEqual([]);
      expect(escaped.cues).toEqual([]);
    },
  );

  it("switches the safehouse from arrival to delivery to secured core", () => {
    const arrival = planFor(AFTERLIGHT_PHASE_IDS.debrief, {
      inventory: [AFTERLIGHT_ITEMS.afterlightCore],
    });
    if (arrival.kind !== "safehouse")
      throw new Error("expected safehouse plan");
    expect(arrival.cues[0]).toMatchObject({
      id: "safehouse-arrival",
      kind: "destination",
      tone: "white",
    });

    const delivery = planFor(AFTERLIGHT_PHASE_IDS.debrief, {
      completedObjectiveIds: [AFTERLIGHT_OBJECTIVE_IDS.reachDebrief],
      inventory: new Set([
        AFTERLIGHT_ITEMS.afterlightCore,
        AFTERLIGHT_ITEMS.bearerBonds,
      ]),
    });
    if (delivery.kind !== "safehouse")
      throw new Error("expected safehouse plan");
    expect(delivery.carryingCore).toBe(true);
    expect(delivery.bondsRetained).toBe(true);
    expect(delivery.cues[0]).toMatchObject({
      id: "safehouse-deliver-core",
      kind: "interact",
      tone: "lime",
      interactionTag: AFTERLIGHT_TAGS.deliverCore,
    });

    const delivered = planFor(AFTERLIGHT_PHASE_IDS.debrief, {
      completedObjectiveIds: [
        AFTERLIGHT_OBJECTIVE_IDS.reachDebrief,
        AFTERLIGHT_OBJECTIVE_IDS.deliverAfterlightCore,
      ],
      inventory: [AFTERLIGHT_ITEMS.afterlightCore],
    });
    if (delivered.kind !== "safehouse")
      throw new Error("expected safehouse plan");
    expect(delivered.delivered).toBe(true);
    expect(delivered.cues).toEqual([]);
  });

  it("keeps every phase inside its quality draw-call and light budgets", () => {
    const phases = Object.values(AFTERLIGHT_PHASE_IDS);
    const qualities: readonly GameQualityTier[] = ["low", "medium", "high"];

    for (const quality of qualities) {
      for (const phaseId of phases) {
        for (const reducedMotion of [false, true]) {
          const plan = planFor(phaseId, {
            quality,
            reducedMotion,
            completedObjectiveIds: [
              AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun,
            ],
          });
          expect(plan.estimatedDrawCalls).toBeLessThanOrEqual(
            SETPIECE_QUALITY_BUDGETS[quality].maxDrawCalls,
          );
          expect(plan.lights).toHaveLength(
            Math.min(
              plan.lights.length,
              SETPIECE_QUALITY_BUDGETS[quality].maxLights,
            ),
          );
          expect(plan.lights.length).toBeLessThanOrEqual(
            SETPIECE_QUALITY_BUDGETS[quality].maxLights,
          );
        }
      }
    }
  });

  it("returns a deterministic frozen plan and an empty unknown phase", () => {
    const input = options({
      phaseId: AFTERLIGHT_PHASE_IDS.run,
      quality: "medium",
      encounterVariant: "north-beach-transfer",
      completedObjectiveIds: new Set([
        AFTERLIGHT_OBJECTIVE_IDS.startAfterlightRun,
      ]),
    });
    const first = createAfterlightSetpiecePlan(input);
    const second = createAfterlightSetpiecePlan(input);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.cues)).toBe(true);
    expect(Object.isFrozen(first.lights)).toBe(true);

    const unknown = planFor("not-a-real-phase");
    expect(unknown).toEqual(
      expect.objectContaining({
        kind: "none",
        phaseId: "not-a-real-phase",
        cues: [],
        lights: [],
        estimatedDrawCalls: 0,
      }),
    );
  });

  it("resolves every variant id to its canonical encounter object", () => {
    for (const encounter of AFTERLIGHT_ENCOUNTER_VARIANTS) {
      expect(resolveAfterlightEncounterVariant(encounter.id)).toBe(encounter);
      expect(resolveAfterlightEncounterVariant(encounter)).toBe(encounter);
    }
  });
});
