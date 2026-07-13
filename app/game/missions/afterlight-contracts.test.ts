import { describe, expect, it } from "vitest";

import {
  AFTERLIGHT_CONTRACTS,
  afterlightContract,
  createAfterlightMission,
  isAfterlightContractId,
} from "./afterlight-contracts";

describe("Afterlight district contracts", () => {
  it("publishes one campaign and four deterministic district jobs", () => {
    expect(AFTERLIGHT_CONTRACTS).toHaveLength(5);
    expect(new Set(AFTERLIGHT_CONTRACTS.map(({ id }) => id)).size).toBe(5);
    expect(
      AFTERLIGHT_CONTRACTS.every(({ id }) => isAfterlightContractId(id)),
    ).toBe(true);
  });

  it.each([
    ["courier-jack", "keyholder"],
    ["vault-breach", "vault"],
    ["blackout-hold", "blackout"],
    ["bridge-run", "afterlight-run"],
  ] as const)(
    "builds %s from only its playable campaign phase",
    (id, phaseId) => {
      const mission = createAfterlightMission(id, 2407);
      expect(mission.id).toBe(id);
      expect(mission.phases.map((phase) => phase.id)).toEqual([phaseId]);
      expect(mission.phases[0].checkpointAfter).toBeUndefined();
      expect(mission.contract.zeroPaceTicks).toBeGreaterThan(
        mission.contract.targetCompletionTicks,
      );
    },
  );

  it("keeps the full heist as the canonical six-chapter contract", () => {
    const mission = createAfterlightMission("afterlight-job", 2407);
    expect(mission.phases).toHaveLength(6);
    expect(mission.contract).toBe(afterlightContract("afterlight-job"));
  });
});
