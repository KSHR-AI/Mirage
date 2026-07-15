import { describe, expect, it } from "vitest";
import {
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_LANDMARKS,
  createInitialAfterlightState,
} from "../../core/afterlight-state";
import type { GameState, Vec3 } from "../../core/contracts";
import {
  AFTERLIGHT_OBJECTIVE_IDS,
  AFTERLIGHT_PHASE_IDS,
} from "../../missions/afterlight-job";
import { createAfterlightMission } from "../../missions/afterlight-contracts";
import { resolveAfterlightMissionTarget } from "./mission-target";

const definition = createAfterlightMission("afterlight-job", 2407);

function phaseIndex(phaseId: string): number {
  return definition.phases.findIndex((phase) => phase.id === phaseId);
}

function withMission(
  state: GameState,
  phaseId: string,
  completedObjectiveIds: readonly string[],
): GameState {
  return {
    ...state,
    mission: {
      ...state.mission,
      phaseIndex: phaseIndex(phaseId),
      completedObjectiveIds,
    },
  };
}

function moveVehicle(state: GameState, id: number, position: Vec3): GameState {
  const vehicles = new Map(state.vehicles);
  const vehicle = vehicles.get(id);
  if (!vehicle) throw new Error(`missing vehicle ${id}`);
  vehicles.set(id, { ...vehicle, pose: { ...vehicle.pose, position } });
  return { ...state, vehicles };
}

describe("Afterlight mission target", () => {
  it("points the default Hot Ride at the downtown buyer", () => {
    const state = createInitialAfterlightState();
    const hotRide = createAfterlightMission(
      state.mission.missionId,
      state.seed,
    );

    expect(resolveAfterlightMissionTarget(state, hotRide)).toEqual({
      label: "Deliver the coupe to the downtown buyer.",
      objectiveId: AFTERLIGHT_OBJECTIVE_IDS.deliverCoupe,
      position: AFTERLIGHT_LANDMARKS.hotRideDrop,
    });
  });

  it("tracks the live courier and then its physical credential", () => {
    const courierPosition: Vec3 = [32, 0.72, -7];
    const keyholder = withMission(
      moveVehicle(
        createInitialAfterlightState(),
        AFTERLIGHT_ENTITY_IDS.courier,
        courierPosition,
      ),
      AFTERLIGHT_PHASE_IDS.keyholder,
      [
        AFTERLIGHT_OBJECTIVE_IDS.stealCoupe,
        AFTERLIGHT_OBJECTIVE_IDS.learnDriving,
        AFTERLIGHT_OBJECTIVE_IDS.reachMission,
      ],
    );

    expect(resolveAfterlightMissionTarget(keyholder, definition)).toMatchObject(
      {
        label: "Ram the courier.",
        objectiveId: AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
        position: courierPosition,
      },
    );

    const credential = withMission(keyholder, AFTERLIGHT_PHASE_IDS.keyholder, [
      ...keyholder.mission.completedObjectiveIds,
      AFTERLIGHT_OBJECTIVE_IDS.disableCourier,
      AFTERLIGHT_OBJECTIVE_IDS.defeatKeyholderGuards,
    ]);
    expect(
      resolveAfterlightMissionTarget(credential, definition),
    ).toMatchObject({
      objectiveId: AFTERLIGHT_OBJECTIVE_IDS.takeVaultCredential,
      position: [34.6, 0.82, -6.2],
    });
  });

  it("switches from the reader to the core and then the street exit", () => {
    const vault = withMission(
      createInitialAfterlightState(),
      AFTERLIGHT_PHASE_IDS.vault,
      [],
    );
    expect(resolveAfterlightMissionTarget(vault, definition).position).toBe(
      AFTERLIGHT_LANDMARKS.vaultReader,
    );

    const opened = withMission(vault, AFTERLIGHT_PHASE_IDS.vault, [
      AFTERLIGHT_OBJECTIVE_IDS.openVault,
    ]);
    expect(resolveAfterlightMissionTarget(opened, definition).position).toBe(
      AFTERLIGHT_LANDMARKS.vaultCore,
    );

    const carryingCore = withMission(opened, AFTERLIGHT_PHASE_IDS.vault, [
      AFTERLIGHT_OBJECTIVE_IDS.openVault,
      AFTERLIGHT_OBJECTIVE_IDS.takeAfterlightCore,
    ]);
    expect(
      resolveAfterlightMissionTarget(carryingCore, definition).position,
    ).toBe(AFTERLIGHT_LANDMARKS.vaultExit);
  });
});
