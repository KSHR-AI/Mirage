import type { Vec3 } from "../../core/contracts";
import type { AfterlightEncounterVariant } from "../../missions/afterlight-job";
import type { GameQualityTier } from "../../performance";
import type { ModelQuality } from "../models";

export type MissionStringCollection = readonly string[] | ReadonlySet<string>;

export type InteractionCueKind = "interact" | "target" | "destination";
export type InteractionCueTone = "lime" | "coral" | "white";

export interface InteractionCuePlan {
  readonly id: string;
  readonly kind: InteractionCueKind;
  readonly tone: InteractionCueTone;
  readonly position: Vec3;
  readonly radius: number;
  readonly interactionTag?: string;
}

export interface SetpieceLightPlan {
  readonly id: string;
  readonly color: string;
  readonly position: Vec3;
  readonly intensity: number;
  readonly distance: number;
}

export interface SetpieceQualityBudget {
  readonly quality: GameQualityTier;
  readonly modelQuality: ModelQuality;
  readonly decorationLevel: 0 | 1 | 2;
  readonly maxDrawCalls: number;
  readonly maxLights: number;
}

interface SetpiecePlanBase {
  readonly phaseId: string;
  readonly anchor: Vec3;
  readonly encounter: AfterlightEncounterVariant;
  readonly quality: SetpieceQualityBudget;
  readonly reducedMotion: boolean;
  readonly cues: readonly InteractionCuePlan[];
  readonly lights: readonly SetpieceLightPlan[];
  readonly estimatedDrawCalls: number;
}

export interface BoostSetpiecePlan extends SetpiecePlanBase {
  readonly kind: "boost";
  readonly heroCoupeVisible: boolean;
  readonly routeGateVisible: boolean;
}

export interface CourierSetpiecePlan extends SetpiecePlanBase {
  readonly kind: "courier";
  readonly courierPosition: Vec3;
  readonly courierDisabled: boolean;
  readonly credentialVisible: boolean;
  readonly dressing: AfterlightEncounterVariant["id"];
}

export interface VaultSetpiecePlan extends SetpiecePlanBase {
  readonly kind: "vault";
  readonly doorOpen: boolean;
  readonly readerReady: boolean;
  readonly bearerBondsVisible: boolean;
  readonly coreVisible: boolean;
  readonly exitGateVisible: boolean;
}

export interface BlackoutSetpiecePlan extends SetpiecePlanBase {
  readonly kind: "blackout";
  readonly primed: boolean;
  readonly blackout: boolean;
  readonly overloadComplete: boolean;
}

export interface PursuitRoadblockPlan {
  readonly id: string;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly blockedLane: "west" | "center" | "east";
}

export interface PursuitSetpiecePlan extends SetpiecePlanBase {
  readonly kind: "pursuit";
  readonly launched: boolean;
  readonly escaped: boolean;
  readonly roadblocks: readonly PursuitRoadblockPlan[];
}

export interface SafehouseSetpiecePlan extends SetpiecePlanBase {
  readonly kind: "safehouse";
  readonly reached: boolean;
  readonly carryingCore: boolean;
  readonly delivered: boolean;
  readonly bondsRetained: boolean;
}

export interface EmptySetpiecePlan {
  readonly kind: "none";
  readonly phaseId: string;
  readonly encounter: AfterlightEncounterVariant;
  readonly quality: SetpieceQualityBudget;
  readonly reducedMotion: boolean;
  readonly cues: readonly [];
  readonly lights: readonly [];
  readonly estimatedDrawCalls: 0;
}

export type AfterlightMissionSetpiecePlan =
  | BoostSetpiecePlan
  | CourierSetpiecePlan
  | VaultSetpiecePlan
  | BlackoutSetpiecePlan
  | PursuitSetpiecePlan
  | SafehouseSetpiecePlan
  | EmptySetpiecePlan;

export interface CreateAfterlightSetpiecePlanOptions {
  readonly phaseId: string;
  readonly completedObjectiveIds: MissionStringCollection;
  readonly inventory: MissionStringCollection;
  readonly blackout: boolean;
  readonly encounterVariant:
    | AfterlightEncounterVariant
    | AfterlightEncounterVariant["id"];
  readonly quality: GameQualityTier;
  readonly reducedMotion: boolean;
}

export interface AfterlightMissionSetpiecesProps extends CreateAfterlightSetpiecePlanOptions {
  readonly interactionCuesVisible?: boolean;
  readonly visible?: boolean;
}
