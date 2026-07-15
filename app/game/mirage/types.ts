export interface Point2 {
  readonly x: number;
  readonly z: number;
}

export interface MirageInput {
  readonly boost: boolean;
  readonly brake: boolean;
  readonly steer: number;
}

export interface MirageCarState extends Point2 {
  readonly boost: number;
  readonly jumpRemaining: number;
  readonly speed: number;
  readonly yaw: number;
}

export interface PursuerState extends Point2 {
  readonly axis: "x" | "z";
  readonly direction: -1 | 1;
  readonly id: number;
  readonly speed: number;
  readonly yaw: number;
}

export type MirageMissionPhase =
  | "pickup"
  | "checkpoints"
  | "delivery"
  | "complete";

export interface MirageRunState {
  readonly car: MirageCarState;
  readonly collectedBoosts: readonly boolean[];
  readonly collisionCooldown: number;
  readonly collisions: number;
  readonly elapsed: number;
  readonly eventId: number;
  readonly eventLabel: string;
  readonly finalScore: number | null;
  readonly heat: number;
  readonly nearMissArmed: readonly boolean[];
  readonly nearMisses: number;
  readonly phase: MirageMissionPhase;
  readonly pursuers: readonly PursuerState[];
  readonly rampUsed: boolean;
  readonly recoveries: number;
  readonly routeIndex: number;
  readonly score: number;
  readonly stuckSeconds: number;
  readonly targetHold: number;
  readonly tick: number;
  readonly trafficCooldowns: readonly number[];
}

export interface MissionTarget extends Point2 {
  readonly id: string;
  readonly label: string;
  readonly radius: number;
  readonly type: "pickup" | "checkpoint" | "finish";
}
