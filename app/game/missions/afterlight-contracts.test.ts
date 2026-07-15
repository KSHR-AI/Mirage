import { describe, expect, it } from "vitest";

import {
  AFTERLIGHT_CONTRACTS,
  DEFAULT_AFTERLIGHT_CONTRACT_ID,
  HOT_RIDE_CONTRACT_ID,
  afterlightContract,
  createAfterlightMission,
  isAfterlightContractId,
} from "./afterlight-contracts";

describe("Afterlight district contracts", () => {
  it("publishes the simple default, campaign, and four district jobs", () => {
    expect(AFTERLIGHT_CONTRACTS).toHaveLength(6);
    expect(new Set(AFTERLIGHT_CONTRACTS.map(({ id }) => id)).size).toBe(6);
    expect(
      AFTERLIGHT_CONTRACTS.every(({ id }) => isAfterlightContractId(id)),
    ).toBe(true);
  });

  it("builds Hot Ride as one forgiving vehicle delivery", () => {
    const mission = createAfterlightMission(HOT_RIDE_CONTRACT_ID, 2407);
    expect(DEFAULT_AFTERLIGHT_CONTRACT_ID).toBe(HOT_RIDE_CONTRACT_ID);
    expect(mission.phases).toHaveLength(1);
    expect(mission.phases[0].objectives).toEqual([
      expect.objectContaining({
        id: "deliver-coupe",
        trigger: expect.objectContaining({ actor: "hero", type: "volume" }),
      }),
    ]);
    expect(mission.contract).toMatchObject({
      allowsVehicleExit: false,
      combatEnabled: false,
      startsInVehicle: true,
      vehicleInvulnerable: true,
    });
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
