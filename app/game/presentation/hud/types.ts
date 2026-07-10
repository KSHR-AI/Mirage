import type {
  KeyboardLayout,
  RemappableKeyboardAction,
} from "../../input/input-buffer";

export type HudQuality = "low" | "medium" | "high";
export type HudRank = "S" | "A" | "B" | "C";
export type HudNotificationTone = "neutral" | "success" | "danger" | "reward";

export interface HudObjectiveProgress {
  readonly current: number;
  readonly total: number;
}

export interface HudObjective {
  readonly id: string;
  readonly label: string;
  readonly completed: boolean;
  readonly optional?: boolean;
  readonly active?: boolean;
  readonly progress?: HudObjectiveProgress;
}

export type HudObjectiveProgressById = Readonly<
  Record<string, HudObjectiveProgress>
>;

export interface HudMission {
  readonly title: string;
  readonly chapter: string;
  readonly chapterIndex: number;
  readonly chapterCount: number;
  readonly location: string;
  readonly objectives: readonly HudObjective[];
}

export interface HudWeapon {
  readonly name?: string;
  readonly magazine: number;
  readonly magazineSize: number;
  readonly reserve: number;
  readonly reloading?: boolean;
  readonly reloadProgress?: number;
}

export interface HudVehicle {
  readonly name?: string;
  readonly integrity: number;
  readonly maxIntegrity?: number;
}

export interface HudMapPoint {
  /** Horizontal map position normalized from 0 to 1. */
  readonly x: number;
  /** Vertical map position normalized from 0 to 1. */
  readonly y: number;
}

export interface HudMapRoad {
  readonly id: string;
  readonly from: HudMapPoint;
  readonly to: HudMapPoint;
  readonly kind?: "street" | "arterial" | "bridge";
}

export interface HudMapBlip extends HudMapPoint {
  readonly id: string;
  readonly label?: string;
}

export interface HudMinimap {
  readonly player: HudMapPoint;
  readonly headingDegrees: number;
  readonly target?: HudMapBlip;
  readonly police?: readonly HudMapBlip[];
  readonly roads?: readonly HudMapRoad[];
  readonly district?: string;
}

export interface HudNotification {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly tone?: HudNotificationTone;
}

export interface AfterlightHudProps {
  readonly mission: HudMission;
  readonly cash: number;
  readonly health: number;
  readonly maxHealth?: number;
  readonly vehicle?: HudVehicle;
  readonly weapon: HudWeapon;
  readonly wantedLevel: 0 | 1 | 2 | 3;
  readonly speedKph: number;
  readonly location: string;
  readonly minimap: HudMinimap;
  readonly notifications?: readonly HudNotification[];
  readonly muted?: boolean;
  readonly touchControlsVisible?: boolean;
  readonly onPause?: () => void;
  readonly onToggleMute?: () => void;
  readonly className?: string;
}

export interface MirageIntroOverlayProps {
  readonly visible?: boolean;
  readonly inputMode?: "desktop" | "touch";
  readonly canContinue?: boolean;
  readonly onStart: () => void;
  readonly onContinue?: () => void;
}

export interface AfterlightSettingsValue {
  readonly muted: boolean;
  readonly reducedMotion: boolean;
  readonly quality: HudQuality;
  readonly lookSensitivity: number;
  readonly invertLookY: boolean;
  readonly keyboardBindings: KeyboardLayout;
}

export interface AfterlightSettingsProps {
  readonly value: AfterlightSettingsValue;
  readonly onMutedChange: (muted: boolean) => void;
  readonly onReducedMotionChange: (reducedMotion: boolean) => void;
  readonly onQualityChange: (quality: HudQuality) => void;
  readonly onLookSensitivityChange: (sensitivity: number) => void;
  readonly onInvertLookYChange: (invert: boolean) => void;
  readonly onKeyboardBindingChange: (
    action: RemappableKeyboardAction,
    code: string,
  ) => void;
}

export interface PauseMenuProps extends AfterlightSettingsProps {
  readonly open: boolean;
  readonly checkpointLabel?: string;
  readonly onResume: () => void;
  readonly onRestartCheckpoint: () => void;
  readonly onRestartMission: () => void;
  readonly onQuit?: () => void;
}

export interface DeathCheckpointOverlayProps {
  readonly visible: boolean;
  readonly mode: "death" | "checkpoint";
  readonly checkpointLabel: string;
  readonly countdownSeconds?: number;
  readonly onRetry?: () => void;
  readonly onContinue?: () => void;
}

export interface DebriefStat {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}

export interface MissionDebriefOverlayProps {
  readonly visible: boolean;
  readonly rank: HudRank;
  readonly elapsedTicks: number;
  readonly earnedCash: number;
  readonly optionalCompleted: number;
  readonly optionalTotal: number;
  readonly stats?: readonly DebriefStat[];
  readonly unlockLabel?: string;
  readonly isPersonalBest?: boolean;
  readonly onReplay: () => void;
  readonly onContinue: () => void;
}

export type TouchVector = readonly [x: number, y: number];

export interface TouchControlsProps {
  readonly mode: "foot" | "vehicle";
  readonly disabled?: boolean;
  readonly interactionAvailable?: boolean;
  readonly onMove: (vector: TouchVector) => void;
  readonly onLook: (vector: TouchVector) => void;
  readonly onInteract: () => void;
  readonly onEnterExit: () => void;
  readonly onFireChange: (pressed: boolean) => void;
  readonly onAimChange: (pressed: boolean) => void;
  readonly onSprintBoostChange: (pressed: boolean) => void;
  readonly onBrakeJumpChange: (pressed: boolean) => void;
  readonly className?: string;
}
