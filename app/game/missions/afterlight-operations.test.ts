import { describe, expect, it } from "vitest";

import {
  AFTERLIGHT_ENCOUNTER_VARIANTS,
  AFTERLIGHT_PHASE_IDS,
  selectAfterlightEncounter,
} from "./afterlight-job";
import {
  AFTERLIGHT_OPERATIONS,
  activeAfterlightPoliceCount,
  afterlightSeedForOperation,
  nextAfterlightOperationId,
} from "./afterlight-operations";

describe("Afterlight operations", () => {
  it("maps every operation to its encounter across run cycles", () => {
    for (const [index, operation] of AFTERLIGHT_OPERATIONS.entries()) {
      const firstSeed = afterlightSeedForOperation(operation.id, 0);
      const laterSeed = afterlightSeedForOperation(operation.id, 9);

      expect(selectAfterlightEncounter(firstSeed).id).toBe(operation.id);
      expect(selectAfterlightEncounter(laterSeed).id).toBe(operation.id);
      expect(laterSeed - firstSeed).toBe(
        9 * AFTERLIGHT_ENCOUNTER_VARIANTS.length,
      );
      expect(nextAfterlightOperationId(operation.id)).toBe(
        AFTERLIGHT_OPERATIONS[(index + 1) % AFTERLIGHT_OPERATIONS.length].id,
      );
    }
  });

  it("uses the authored response cap and adds the fourth pursuit unit", () => {
    const lightResponse = AFTERLIGHT_ENCOUNTER_VARIANTS[1];
    const heavyResponse = AFTERLIGHT_ENCOUNTER_VARIANTS[2];

    expect(
      activeAfterlightPoliceCount(
        lightResponse,
        AFTERLIGHT_PHASE_IDS.run,
        3,
        "pursue",
      ),
    ).toBe(2);
    expect(
      activeAfterlightPoliceCount(
        heavyResponse,
        AFTERLIGHT_PHASE_IDS.run,
        3,
        "pursue",
      ),
    ).toBe(4);
    expect(
      activeAfterlightPoliceCount(
        heavyResponse,
        AFTERLIGHT_PHASE_IDS.vault,
        2,
        "search",
      ),
    ).toBe(2);
  });
});
