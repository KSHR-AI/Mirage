import { describe, expect, it } from "vitest";

import {
  AFTERLIGHT_ENCOUNTER_VARIANTS,
  AFTERLIGHT_ITEMS,
  AFTERLIGHT_JOB,
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
  createAfterlightJob,
  selectAfterlightEncounter,
} from "./afterlight-job";

describe("The Afterlight Job", () => {
  it("defines the complete six-beat heist in order", () => {
    expect(AFTERLIGHT_JOB.phases.map(({ id }) => id)).toEqual([
      AFTERLIGHT_PHASE_IDS.boost,
      AFTERLIGHT_PHASE_IDS.keyholder,
      AFTERLIGHT_PHASE_IDS.vault,
      AFTERLIGHT_PHASE_IDS.blackout,
      AFTERLIGHT_PHASE_IDS.run,
      AFTERLIGHT_PHASE_IDS.debrief,
    ]);
    expect(
      AFTERLIGHT_JOB.phases
        .flatMap(({ objectives }) => objectives)
        .map(({ id }) => id),
    ).toEqual(
      expect.arrayContaining([
        AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
        AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
        AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards,
        AFTERLIGHT_OBJECTIVE_IDS.takeVaultCredential,
        AFTERLIGHT_OBJECTIVE_IDS.takeAfterlightCore,
        AFTERLIGHT_OBJECTIVE_IDS.holdBlackout,
        AFTERLIGHT_OBJECTIVE_IDS.escapeAfterlightRun,
        AFTERLIGHT_OBJECTIVE_IDS.deliverAfterlightCore,
      ]),
    );
  });

  it("selects encounter variants deterministically, including negative seeds", () => {
    expect(selectAfterlightEncounter(0)).toBe(AFTERLIGHT_ENCOUNTER_VARIANTS[0]);
    expect(selectAfterlightEncounter(3)).toBe(AFTERLIGHT_ENCOUNTER_VARIANTS[0]);
    expect(selectAfterlightEncounter(-1)).toBe(
      AFTERLIGHT_ENCOUNTER_VARIANTS[2],
    );
    expect(createAfterlightJob(7).encounter).toBe(selectAfterlightEncounter(7));
  });

  it("requires the core at the debrief rather than allowing a checkpoint-only finish", () => {
    const debrief = AFTERLIGHT_JOB.phases.find(
      ({ id }) => id === AFTERLIGHT_PHASE_IDS.debrief,
    );
    const delivery = debrief?.objectives.find(
      ({ id }) => id === AFTERLIGHT_OBJECTIVE_IDS.deliverAfterlightCore,
    );
    expect(delivery?.optional).not.toBe(true);
    expect(delivery?.trigger).toEqual(
      expect.objectContaining({
        type: "all",
        children: expect.arrayContaining([
          expect.objectContaining({
            type: "inventory",
            itemId: AFTERLIGHT_ITEMS.afterlightCore,
          }),
        ]),
      }),
    );
  });
});
