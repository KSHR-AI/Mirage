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
  readonly laneOffset: number;
  readonly laneTarget: number;
  readonly routeDistance: number;
  readonly speed: number;
  readonly yaw: number;
}

export interface PursuerState extends Point2 {
  readonly id: number;
  readonly laneOffset: number;
  readonly routeDistance: number;
  readonly yaw: number;
}

export type MirageMissionPhase =
  | "pickup"
  | "checkpoints"
  | "delivery"
  | "complete"
  | "busted";

export type TrafficResult = "pending" | "hit" | "near" | "clear";

export interface MirageRunState {
  readonly car: MirageCarState;
  readonly collectedBoosts: readonly boolean[];
  readonly combo: number;
  readonly collisions: number;
  readonly elapsed: number;
  readonly eventId: number;
  readonly eventLabel: string;
  readonly finalScore: number | null;
  readonly impactCooldown: number;
  readonly nearMisses: number;
  readonly phase: MirageMissionPhase;
  readonly pursuers: readonly PursuerState[];
  readonly rampUsed: boolean;
  readonly routeIndex: number;
  readonly score: number;
  readonly steerLatch: -1 | 0 | 1;
  readonly styleScore: number;
  readonly tick: number;
  readonly trafficResults: readonly TrafficResult[];
}

export interface MissionTarget extends Point2 {
  readonly id: string;
  readonly label: string;
  readonly routeDistance: number;
  readonly type: "pickup" | "checkpoint" | "finish";
}
