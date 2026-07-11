"use client";

import { Canvas } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";
import {
  AfterlightAudioDirector,
  type AfterlightAudioCue,
  resolveAfterlightWeather,
} from "../game/audio";
import {
  AFTERLIGHT_LOCATIONS,
  getAfterlightObjectivePrompt,
  getAfterlightPhaseContent,
  selectAfterlightRadioLine,
  type AfterlightRadioEvent,
} from "../game/content";
import {
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_LANDMARKS,
  createInitialAfterlightState,
  hydrateAfterlightState,
} from "../game/core/afterlight-state";
import {
  AfterlightStepController,
  restoreAfterlightCheckpointState,
} from "../game/core/afterlight-step";
import { BrowserGameLoop } from "../game/core/browser-loop";
import {
  EMPTY_INPUT_FRAME,
  type GameEvent,
  type GameState,
  type InputFrame,
  type RenderSnapshot,
  type SaveGameV1,
  type Vec3,
} from "../game/core/contracts";
import {
  createGameRuntime,
  type DeterministicGameRuntime,
} from "../game/core/runtime";
import {
  DEFAULT_INPUT_BINDINGS,
  DEFAULT_KEYBOARD_LAYOUT,
  InputBuffer,
  KeyboardInputAdapter,
  applyGamepadSnapshot,
  createKeyboardActionMap,
  normalizeKeyboardLayout,
  remapKeyboardLayout,
  type KeyboardLayout,
  type RemappableKeyboardAction,
} from "../game/input/input-buffer";
import { prefersTouchControls } from "../game/input/device-profile";
import {
  AFTERLIGHT_PHASE_IDS,
  createAfterlightJob,
  type AfterlightJobDefinition,
} from "../game/missions/afterlight-job";
import {
  SaveGameRepository,
  createCheckpointSave,
} from "../game/persistence/save-game";
import {
  PerformanceGovernor,
  qualitySettings,
  readBrowserDeviceProfile,
  selectInitialQuality,
  type GameQualityTier,
  type PerformanceReport,
} from "../game/performance";
import type { AfterlightCameraImpulse } from "../game/presentation/camera";
import {
  AfterlightHud,
  AfterlightHudProgressTracker,
  DeathCheckpointOverlay,
  EMPTY_HUD_OBJECTIVE_PROGRESS,
  MirageIntroOverlay,
  MissionDebriefOverlay,
  PauseMenu,
  TouchControls,
  type DebriefStat,
  type HudMapRoad,
  type HudMinimap,
  type HudMission,
  type HudNotification,
  type HudObjectiveProgressById,
} from "../game/presentation/hud";
import type { AfterlightVfxEvent } from "../game/presentation/vfx";
import {
  ReplaySessionRecorder,
  scoreRun,
  type ReplayTapeV1,
  type RunScore,
} from "../game/replay";
import { sampleAfterlightCharacterGround } from "../game/world/afterlight-character-world";
import { AfterlightScene, AFTERLIGHT_SCENE_TARGETS } from "./AfterlightScene";

interface SessionView {
  readonly state: GameState;
  readonly snapshot: RenderSnapshot;
  readonly input: InputFrame;
  readonly cameraYaw: number;
  readonly cameraPitch: number;
  readonly vfxEvents: readonly AfterlightVfxEvent[];
  readonly cameraImpulses: readonly AfterlightCameraImpulse[];
  readonly notifications: readonly HudNotification[];
  readonly objectiveProgress: HudObjectiveProgressById;
  readonly performance: PerformanceReport;
}

interface RunStats {
  deaths: number;
  shotsFired: number;
  shotsHit: number;
  finished: boolean;
}

interface TouchDrag {
  readonly id: number;
  x: number;
  y: number;
}

function capturePointerIfAvailable(element: HTMLElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Embedded browsers can expose pointer capture while rejecting the stream.
  }
}

const GAME_SEED = 2407;
const EMPTY_VFX_EVENTS: readonly AfterlightVfxEvent[] = Object.freeze([]);
const EMPTY_CAMERA_IMPULSES: readonly AfterlightCameraImpulse[] = Object.freeze(
  [],
);
const BLACKOUT_MARKER = "afterlight:blackout:active";
const CONTROL_SETTINGS_KEY = "mirage:controls:v1";

interface ControlSettings {
  readonly lookSensitivity: number;
  readonly invertLookY: boolean;
  readonly keyboardBindings: KeyboardLayout;
}

function clampLookSensitivity(value: number): number {
  return Math.max(0.5, Math.min(2, Number.isFinite(value) ? value : 1));
}

function readControlSettings(): ControlSettings {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(CONTROL_SETTINGS_KEY) ?? "null",
    );
    return {
      lookSensitivity: clampLookSensitivity(parsed?.lookSensitivity),
      invertLookY: parsed?.invertLookY === true,
      keyboardBindings: normalizeKeyboardLayout(parsed?.keyboardBindings),
    };
  } catch {
    return {
      lookSensitivity: 1,
      invertLookY: false,
      keyboardBindings: DEFAULT_KEYBOARD_LAYOUT,
    };
  }
}

function getTouchSnapshot(): boolean {
  return prefersTouchControls({
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    finePointer: window.matchMedia("(pointer: fine)").matches,
    viewportWidth: window.innerWidth,
  });
}

function getServerTouchSnapshot(): boolean {
  return false;
}

function subscribeToTouch(onStoreChange: () => void): () => void {
  const coarseQuery = window.matchMedia("(pointer: coarse)");
  const fineQuery = window.matchMedia("(pointer: fine)");
  coarseQuery.addEventListener("change", onStoreChange);
  fineQuery.addEventListener("change", onStoreChange);
  window.addEventListener("resize", onStoreChange);
  return () => {
    coarseQuery.removeEventListener("change", onStoreChange);
    fineQuery.removeEventListener("change", onStoreChange);
    window.removeEventListener("resize", onStoreChange);
  };
}

function track(event: string, value?: string): void {
  const payload = JSON.stringify({ event, value });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/game-event",
      new Blob([payload], { type: "application/json" }),
    );
    return;
  }
  void fetch("/api/game-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  });
}

function worldToMap(position: Vec3) {
  return {
    x: Math.max(0, Math.min(1, (position[0] + 104) / 208)),
    y: Math.max(0, Math.min(1, (104 - position[2]) / 342)),
  };
}

function createMapRoads(): readonly HudMapRoad[] {
  const lines = [-84, -56, -28, 0, 28, 56, 84] as const;
  const streets = lines.flatMap((line) => [
    {
      id: "vertical-" + line,
      from: worldToMap([line, 0, -104]),
      to: worldToMap([line, 0, 104]),
      kind: "street" as const,
    },
    {
      id: "horizontal-" + line,
      from: worldToMap([-104, 0, line]),
      to: worldToMap([104, 0, line]),
      kind: "street" as const,
    },
  ]);
  return Object.freeze([
    ...streets,
    {
      id: "northspan-bridge",
      from: worldToMap([0, 0, -96]),
      to: worldToMap([0, 0, -238]),
      kind: "bridge" as const,
    },
  ]);
}

const MAP_ROADS = createMapRoads();

function phaseTarget(
  state: GameState,
  definition: AfterlightJobDefinition,
): Vec3 {
  const phase = definition.phases[state.mission.phaseIndex];
  const completed = new Set(state.mission.completedObjectiveIds);
  if (phase.id === AFTERLIGHT_PHASE_IDS.boost) {
    return completed.has("steal-coupe")
      ? AFTERLIGHT_LANDMARKS.missionIntercept
      : AFTERLIGHT_LANDMARKS.boostYard;
  }
  if (phase.id === AFTERLIGHT_PHASE_IDS.vault) {
    return completed.has("take-afterlight-core")
      ? AFTERLIGHT_LANDMARKS.vaultExit
      : AFTERLIGHT_LANDMARKS.vaultReader;
  }
  if (phase.id === AFTERLIGHT_PHASE_IDS.run) {
    return completed.has("start-afterlight-run")
      ? AFTERLIGHT_LANDMARKS.bridgeEscape
      : AFTERLIGHT_LANDMARKS.bridgeLaunch;
  }
  return (
    AFTERLIGHT_SCENE_TARGETS[
      phase.id as keyof typeof AFTERLIGHT_SCENE_TARGETS
    ] ?? AFTERLIGHT_LANDMARKS.boostYard
  );
}

function activePlayerPosition(state: GameState): Vec3 {
  const player = state.actors.get(state.playerId);
  const hero = state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
  return hero?.occupiedBy === state.playerId
    ? hero.pose.position
    : (player?.pose.position ?? ([0, 0, 0] as Vec3));
}

function missionForHud(
  snapshot: RenderSnapshot,
  definition: AfterlightJobDefinition,
  objectiveProgress: HudObjectiveProgressById,
): HudMission {
  const phase = definition.phases[snapshot.mission.phaseIndex];
  const completed = new Set(snapshot.mission.completedObjectiveIds);
  const activeRequired = phase.objectives.find(
    (objective) => !objective.optional && !completed.has(objective.id),
  );
  return {
    title: definition.title,
    chapter: phase.chapter,
    chapterIndex: snapshot.mission.phaseIndex,
    chapterCount: definition.phases.length,
    location: phase.location,
    objectives: phase.objectives.map((objective) => {
      const objectiveCompleted = completed.has(objective.id);
      const progress = objectiveProgress[objective.id];
      return {
        id: objective.id,
        label:
          getAfterlightObjectivePrompt(
            objective.id as Parameters<typeof getAfterlightObjectivePrompt>[0],
          )?.text ?? objective.label,
        completed: objectiveCompleted,
        optional: objective.optional,
        active: objective.optional
          ? !objectiveCompleted
          : objective.id === activeRequired?.id,
        ...(!objectiveCompleted && progress ? { progress } : {}),
      };
    }),
  };
}

function minimapForState(
  state: GameState,
  definition: AfterlightJobDefinition,
  location: string,
): HudMinimap {
  const position = activePlayerPosition(state);
  const player = state.actors.get(state.playerId);
  const hero = state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
  const driving = hero?.occupiedBy === state.playerId;
  const heading = driving ? hero?.pose.rotationY : player?.pose.rotationY;
  const police = [
    AFTERLIGHT_ENTITY_IDS.policeA,
    AFTERLIGHT_ENTITY_IDS.policeB,
    AFTERLIGHT_ENTITY_IDS.policeC,
  ]
    .slice(0, state.heat.wantedLevel)
    .flatMap((id) => {
      const actor = state.actors.get(id);
      return actor
        ? [
            {
              id: "police-" + id,
              label: "Response unit",
              ...worldToMap(actor.pose.position),
            },
          ]
        : [];
    });

  return {
    player: worldToMap(position),
    headingDegrees: ((heading ?? 0) * 180) / Math.PI,
    target: {
      id: "target-" + state.mission.phaseIndex,
      label: definition.phases[state.mission.phaseIndex].chapter,
      ...worldToMap(phaseTarget(state, definition)),
    },
    police,
    roads: MAP_ROADS,
    district: location,
  };
}

function eventPosition(event: GameEvent, state: GameState): Vec3 {
  switch (event.type) {
    case "actor-damaged":
    case "actor-downed":
      return (
        state.actors.get(event.actorId)?.pose.position ??
        activePlayerPosition(state)
      );
    case "vehicle-damaged":
    case "vehicle-disabled":
      return (
        state.vehicles.get(event.vehicleId)?.pose.position ??
        activePlayerPosition(state)
      );
    case "crime-witnessed":
      return event.position;
    case "setpiece-triggered":
      return event.setpieceId.includes("blackout")
        ? AFTERLIGHT_LANDMARKS.substationControl
        : activePlayerPosition(state);
    default:
      return activePlayerPosition(state);
  }
}

function eventIdentity(event: GameEvent): string {
  if ("actorId" in event) return String(event.actorId);
  if ("vehicleId" in event) return String(event.vehicleId);
  if ("objectiveId" in event) return event.objectiveId;
  if ("setpieceId" in event) return event.setpieceId;
  return "world";
}

function vfxForEvent(
  event: GameEvent,
  state: GameState,
): AfterlightVfxEvent | null {
  const id = String(event.tick) + ":" + event.type + ":" + eventIdentity(event);
  if (event.type === "actor-damaged") {
    return {
      id,
      kind: "bullet-impact",
      tick: event.tick,
      position: eventPosition(event, state),
      intensity: Math.min(1, event.amount / 34),
    };
  }
  if (event.type === "vehicle-damaged") {
    return {
      id,
      kind: "vehicle-impact",
      tick: event.tick,
      position: eventPosition(event, state),
      intensity: Math.min(1, event.amount / 50),
    };
  }
  if (event.type === "vehicle-disabled") {
    return {
      id,
      kind: "explosion",
      tick: event.tick,
      position: eventPosition(event, state),
      intensity: 0.72,
    };
  }
  if (event.type === "objective-completed") {
    return {
      id,
      kind: "objective-complete",
      tick: event.tick,
      position: activePlayerPosition(state),
      color: 0xd8ff62,
    };
  }
  if (
    event.type === "setpiece-triggered" &&
    event.setpieceId.includes("blackout")
  ) {
    return {
      id,
      kind: "blackout-pulse",
      tick: event.tick,
      position: AFTERLIGHT_LANDMARKS.substationControl,
      intensity: 1,
    };
  }
  return null;
}

function audioCueForEvent(
  event: GameEvent,
  playerId: number,
): AfterlightAudioCue | null {
  if (event.type === "objective-completed") return "objective";
  if (event.type === "checkpoint-reached") return "mission-phase";
  if (event.type === "vehicle-damaged") return "impact";
  if (event.type === "actor-downed" && event.actorId === playerId) {
    return "death";
  }
  if (
    event.type === "setpiece-triggered" &&
    event.setpieceId.includes("blackout")
  ) {
    return "blackout";
  }
  return null;
}

function audioTokenForEvent(event: GameEvent): string {
  return `${event.tick}:${event.type}:${eventIdentity(event)}`;
}

function radioEventForGameEvent(event: GameEvent): AfterlightRadioEvent | null {
  if (event.type === "crime-witnessed" && event.crime === "vehicle-theft") {
    return "crime.vehicle-theft-witnessed";
  }
  if (event.type === "interaction" && event.tag.includes("courier-disabled")) {
    return "keyholder.courier-disabled";
  }
  if (event.type === "item-collected" && event.itemId.includes("credential")) {
    return "keyholder.credential-recovered";
  }
  if (event.type === "item-collected" && event.itemId === "afterlight-core") {
    return "vault.core-stolen";
  }
  if (
    event.type === "setpiece-triggered" &&
    event.setpieceId.includes("blackout")
  ) {
    return "blackout.grid-lost";
  }
  return null;
}

function notificationForEvent(
  event: GameEvent,
  state: GameState,
  definition: AfterlightJobDefinition,
): HudNotification | null {
  if (event.type === "objective-completed") {
    const objective = definition.phases
      .flatMap((phase) => phase.objectives)
      .find((candidate) => candidate.id === event.objectiveId);
    return {
      id: "objective-" + event.tick + "-" + event.objectiveId,
      title: "OBJECTIVE COMPLETE",
      detail: objective?.label,
      tone: "success",
    };
  }
  if (event.type === "checkpoint-reached") {
    const phase = definition.phases[state.mission.phaseIndex];
    return {
      id: "checkpoint-" + event.tick,
      title: "CHECKPOINT SECURED",
      detail: phase?.location,
      tone: "success",
    };
  }
  if (event.type === "vehicle-disabled") {
    return {
      id: "disabled-" + event.tick + "-" + event.vehicleId,
      title: "VEHICLE DISABLED",
      tone: "danger",
    };
  }
  return null;
}

function initialNotification(state: GameState): HudNotification {
  const definition = createAfterlightJob(state.seed);
  const phase = definition.phases[state.mission.phaseIndex];
  const content = getAfterlightPhaseContent(
    phase.id as Parameters<typeof getAfterlightPhaseContent>[0],
  );
  return {
    id: "briefing-" + phase.id + "-" + state.tick,
    title: phase.chapter.toUpperCase(),
    detail: content.briefing.text,
    tone: "neutral",
  };
}

function freshView(
  state: GameState,
  runtime: DeterministicGameRuntime,
): SessionView {
  return {
    state,
    snapshot: runtime.snapshot(1),
    input: EMPTY_INPUT_FRAME,
    cameraYaw: state.actors.get(state.playerId)?.pose.rotationY ?? 0,
    cameraPitch: 0,
    vfxEvents: EMPTY_VFX_EVENTS,
    cameraImpulses: EMPTY_CAMERA_IMPULSES,
    notifications: [initialNotification(state)],
    objectiveProgress: EMPTY_HUD_OBJECTIVE_PROGRESS,
    performance: {
      tier: "medium",
      changed: false,
      averageFrameMs: 0,
      slowFrameRatio: 0,
      droppedSimulationSeconds: 0,
    },
  };
}

function gamepadActive(gamepad: Gamepad): boolean {
  return (
    gamepad.axes.some((axis) => Math.abs(axis) > 0.08) ||
    gamepad.buttons.some((button) => button.pressed)
  );
}

export function AfterlightGame() {
  const touch = useSyncExternalStore(
    subscribeToTouch,
    getTouchSnapshot,
    getServerTouchSnapshot,
  );
  const [initialSession] = useState(() => {
    const state = createInitialAfterlightState(GAME_SEED);
    const stepController = new AfterlightStepController(state.seed);
    const runtime = createGameRuntime(state, stepController.step);
    const input = new InputBuffer();
    return {
      state,
      runtime,
      input,
      keyboard: new KeyboardInputAdapter(input),
      recorder: new ReplaySessionRecorder(state.seed, state.tick),
      stepController,
      notification: initialNotification(state),
    };
  });
  const runtimeRef = useRef<DeterministicGameRuntime | null>(
    initialSession.runtime,
  );
  const stepControllerRef = useRef(initialSession.stepController);
  const inputRef = useRef(initialSession.input);
  const keyboardRef = useRef(initialSession.keyboard);
  const loopRef = useRef<BrowserGameLoop | null>(null);
  const audioRef = useRef(new AfterlightAudioDirector());
  const recorderRef = useRef(initialSession.recorder);
  const completedReplayRef = useRef<ReplayTapeV1 | null>(null);
  const saveRepositoryRef = useRef<SaveGameRepository | null>(null);
  const continueSaveRef = useRef<SaveGameV1 | null>(null);
  const lastInputRef = useRef<InputFrame>(EMPTY_INPUT_FRAME);
  const touchLookRef = useRef<readonly [number, number]>([0, 0]);
  const touchDragRef = useRef<TouchDrag | null>(null);
  const inputSurfaceRef = useRef<HTMLDivElement | null>(null);
  const pointerLockedRef = useRef(false);
  const lastHashTickRef = useRef(-1);
  const previousPhaseRef = useRef(initialSession.state.mission.phaseIndex);
  const previousMagazineRef = useRef(
    initialSession.state.weapons.get("signal-9")?.magazine ?? 24,
  );
  const statsRef = useRef<RunStats>({
    deaths: 0,
    shotsFired: 0,
    shotsHit: 0,
    finished: false,
  });
  const vfxRef = useRef<readonly AfterlightVfxEvent[]>(EMPTY_VFX_EVENTS);
  const impulsesRef = useRef<readonly AfterlightCameraImpulse[]>(
    EMPTY_CAMERA_IMPULSES,
  );
  const notificationRef = useRef<readonly HudNotification[]>([
    initialSession.notification,
  ]);
  const hudProgressTrackerRef = useRef(new AfterlightHudProgressTracker());
  const impulseSequenceRef = useRef(0);
  const qualityRef = useRef<GameQualityTier>("medium");
  const lookSensitivityRef = useRef(1);
  const invertLookYRef = useRef(false);
  const keyboardBindingsRef = useRef<KeyboardLayout>(DEFAULT_KEYBOARD_LAYOUT);
  const governorRef = useRef(
    new PerformanceGovernor({ initialTier: "medium" }),
  );

  const [view, setView] = useState<SessionView>(() =>
    freshView(initialSession.state, initialSession.runtime),
  );
  const viewRef = useRef(view);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [quality, setQuality] = useState<GameQualityTier>("medium");
  const [lookSensitivity, setLookSensitivity] = useState(1);
  const [invertLookY, setInvertLookY] = useState(false);
  const [keyboardBindings, setKeyboardBindings] = useState<KeyboardLayout>(
    DEFAULT_KEYBOARD_LAYOUT,
  );
  const [continueAvailable, setContinueAvailable] = useState(false);
  const [debriefDismissed, setDebriefDismissed] = useState(false);
  const [runScore, setRunScore] = useState<RunScore | null>(null);
  const startedRef = useRef(started);
  const pausedRef = useRef(paused);
  const reducedMotionRef = useRef(reducedMotion);
  const mutedRef = useRef(muted);

  useEffect(() => {
    document.body.classList.add("bay-city-active");
    const profile = readBrowserDeviceProfile();
    const initialQuality = selectInitialQuality(profile);
    const controls = readControlSettings();
    qualityRef.current = initialQuality;
    governorRef.current.reset(initialQuality);
    reducedMotionRef.current = profile.reducedMotion;
    lookSensitivityRef.current = controls.lookSensitivity;
    invertLookYRef.current = controls.invertLookY;
    keyboardBindingsRef.current = controls.keyboardBindings;
    keyboardRef.current.setBindings({
      ...DEFAULT_INPUT_BINDINGS,
      keyboard: createKeyboardActionMap(controls.keyboardBindings),
    });
    saveRepositoryRef.current = new SaveGameRepository(window.localStorage);
    continueSaveRef.current = saveRepositoryRef.current.load();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setQuality(initialQuality);
      setReducedMotion(profile.reducedMotion);
      setLookSensitivity(controls.lookSensitivity);
      setInvertLookY(controls.invertLookY);
      setKeyboardBindings(controls.keyboardBindings);
      setContinueAvailable(Boolean(continueSaveRef.current));
    });
    return () => {
      cancelled = true;
      document.body.classList.remove("bay-city-active");
    };
  }, []);

  const requestGamePointerLock = useCallback(() => {
    const surface = inputSurfaceRef.current;
    if (
      !surface ||
      getTouchSnapshot() ||
      document.pointerLockElement === surface
    ) {
      return;
    }
    try {
      const request = surface.requestPointerLock() as Promise<void> | undefined;
      void request?.catch(() => {
        // A subsequent click retries requests denied as non-user gestures.
      });
    } catch {
      // Older browsers can throw synchronously instead of returning a promise.
    }
  }, []);

  const releaseGamePointerLock = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  useEffect(() => {
    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === inputSurfaceRef.current;
      pointerLockedRef.current = locked;
      setPointerLocked(locked);
      if (locked) {
        touchDragRef.current = null;
        return;
      }

      inputRef.current.setAction("fire", false);
      inputRef.current.setAction("aim", false);
      const state = viewRef.current.state;
      if (
        startedRef.current &&
        !pausedRef.current &&
        !state.mission.failed &&
        !state.mission.completed
      ) {
        pausedRef.current = true;
        setPaused(true);
      }
    };
    document.addEventListener("pointerlockchange", onPointerLockChange);
    return () => {
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    };
  }, []);

  const installSession = useCallback((state: GameState, deaths = 0) => {
    loopRef.current?.stop();
    inputRef.current.reset();
    touchLookRef.current = [0, 0];
    const stepController = new AfterlightStepController(state.seed);
    const runtime = createGameRuntime(state, stepController.step);
    runtimeRef.current = runtime;
    stepControllerRef.current = stepController;
    recorderRef.current = new ReplaySessionRecorder(state.seed, state.tick);
    statsRef.current = {
      deaths,
      shotsFired: 0,
      shotsHit: 0,
      finished: false,
    };
    previousMagazineRef.current = state.weapons.get("signal-9")?.magazine ?? 24;
    previousPhaseRef.current = state.mission.phaseIndex;
    lastHashTickRef.current = -1;
    vfxRef.current = EMPTY_VFX_EVENTS;
    impulsesRef.current = EMPTY_CAMERA_IMPULSES;
    notificationRef.current = [initialNotification(state)];
    hudProgressTrackerRef.current.reset();
    const nextView = freshView(state, runtime);
    viewRef.current = nextView;
    setView(nextView);
    setRunScore(null);
    setDebriefDismissed(false);
    pausedRef.current = false;
    setPaused(false);
    setSessionVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const loop = new BrowserGameLoop({
      runtime,
      readInput: () => {
        const pad = navigator.getGamepads?.()[0];
        if (pad && gamepadActive(pad)) {
          applyGamepadSnapshot(
            inputRef.current,
            {
              axes: [...pad.axes],
              buttons: pad.buttons.map((button) => ({
                pressed: button.pressed,
                value: button.value,
              })),
            },
            {
              ...DEFAULT_INPUT_BINDINGS,
              invertLookY: invertLookYRef.current,
              lookSensitivity: lookSensitivityRef.current,
            },
          );
        }
        if (touchLookRef.current[0] !== 0 || touchLookRef.current[1] !== 0) {
          inputRef.current.setSource("touch");
          inputRef.current.setAxis(
            "look-x",
            touchLookRef.current[0] * 0.6 * lookSensitivityRef.current,
          );
          inputRef.current.setAxis(
            "look-y",
            touchLookRef.current[1] *
              0.45 *
              lookSensitivityRef.current *
              (invertLookYRef.current ? -1 : 1),
          );
        }
        const input = inputRef.current.frame();
        lastInputRef.current = input;
        if (!recorderRef.current.finished) {
          recorderRef.current.appendFrame(input);
        }
        return input;
      },
      render: (frame) => {
        const state = runtime.state;
        const previousState = viewRef.current.state;
        const definition = createAfterlightJob(state.seed);
        const currentPhase = definition.phases[state.mission.phaseIndex];
        const currentPhaseContent = getAfterlightPhaseContent(
          currentPhase.id as Parameters<typeof getAfterlightPhaseContent>[0],
        );
        const nextVfx = [...vfxRef.current];
        const nextImpulses = [...impulsesRef.current];
        const nextNotifications = [...notificationRef.current];

        for (const event of frame.events) {
          const vfx = vfxForEvent(event, state);
          if (vfx) nextVfx.push(vfx);
          const cue = audioCueForEvent(event, state.playerId);
          if (cue) {
            audioRef.current.cue({
              cue,
              intensity:
                event.type === "actor-damaged" ||
                event.type === "vehicle-damaged"
                  ? Math.min(1.2, 0.6 + event.amount / 60)
                  : 1,
              position:
                cue === "impact" || cue === "blackout"
                  ? eventPosition(event, state)
                  : undefined,
              token: audioTokenForEvent(event),
            });
          }
          const notification = notificationForEvent(event, state, definition);
          if (notification) nextNotifications.push(notification);
          const radioEvent = radioEventForGameEvent(event);
          if (radioEvent) {
            const selected = selectAfterlightRadioLine(
              state.seed,
              "runner",
              radioEvent,
            );
            nextNotifications.push({
              id: selected.cueId + "-" + event.tick,
              title: selected.speaker.toUpperCase(),
              detail: selected.line.text,
              tone: selected.speaker === "police" ? "danger" : "neutral",
            });
          }
          if (
            event.type === "actor-damaged" &&
            event.sourceId === state.playerId
          ) {
            statsRef.current.shotsHit += 1;
          }
          if (
            event.type === "actor-damaged" ||
            event.type === "vehicle-damaged"
          ) {
            impulseSequenceRef.current += 1;
            nextImpulses.push({
              sequence: impulseSequenceRef.current,
              strength: Math.min(1, event.amount / 45),
              kind: event.type === "actor-damaged" ? "recoil" : "impact",
            });
          }
          if (event.type === "checkpoint-reached") {
            const save = createCheckpointSave(state);
            saveRepositoryRef.current?.save(save);
            continueSaveRef.current = save;
            setContinueAvailable(true);
          }
        }

        const magazine = state.weapons.get("signal-9")?.magazine ?? 0;
        if (magazine < previousMagazineRef.current) {
          statsRef.current.shotsFired += previousMagazineRef.current - magazine;
          audioRef.current.cue({
            cue: "weapon-fire",
            token: `weapon-fire:${state.tick}:${previousMagazineRef.current}->${magazine}`,
          });
        }
        previousMagazineRef.current = magazine;

        if (state.mission.phaseIndex !== previousPhaseRef.current) {
          const phase = definition.phases[state.mission.phaseIndex];
          const content = getAfterlightPhaseContent(
            phase.id as Parameters<typeof getAfterlightPhaseContent>[0],
          );
          nextNotifications.push({
            id: "phase-" + state.mission.phaseIndex + "-" + state.tick,
            title: phase.chapter.toUpperCase(),
            detail: content.briefing.text,
            tone: "neutral",
          });
          audioRef.current.cue({
            cue: "mission-phase",
            token: `mission-phase:${state.mission.phaseIndex}:${state.tick}`,
          });
          previousPhaseRef.current = state.mission.phaseIndex;
          track("bay_city_mission", phase.id);
        }

        if (state.mission.failed && !previousState.mission.failed) {
          statsRef.current.deaths += 1;
          audioRef.current.cue({
            cue: "death",
            token: `mission-failed:${state.tick}`,
          });
        }

        if (
          !recorderRef.current.finished &&
          state.tick > 0 &&
          state.tick % 300 === 0 &&
          state.tick !== lastHashTickRef.current
        ) {
          recorderRef.current.recordStateHash(state.tick, runtime.hash());
          lastHashTickRef.current = state.tick;
        }

        if (state.mission.completed && !statsRef.current.finished) {
          statsRef.current.finished = true;
          const optionalObjectives = definition.phases
            .flatMap((phase) => phase.objectives)
            .filter((objective) => objective.optional);
          const optionalCompleted = optionalObjectives.filter((objective) =>
            state.mission.completedObjectiveIds.includes(objective.id),
          );
          const hero = state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
          const vehicleDamage = Math.max(
            0,
            Math.min(100, 100 - (hero?.health ?? 0)),
          );
          const shotsHit = Math.min(
            statsRef.current.shotsHit,
            statsRef.current.shotsFired,
          );
          const score = scoreRun({
            status: "completed",
            completionTicks: state.tick,
            deaths: statsRef.current.deaths,
            optionalObjectivesCompleted: optionalCompleted.length,
            optionalObjectivesTotal: optionalObjectives.length,
            shotsFired: statsRef.current.shotsFired,
            shotsHit,
            vehicleDamage,
          });
          setRunScore(score);
          completedReplayRef.current = recorderRef.current.finish({
            missionId: state.mission.missionId,
            status: "completed",
            completionStateTick: state.tick,
            deaths: statsRef.current.deaths,
            optionalObjectiveIds: optionalCompleted.map(
              (objective) => objective.id,
            ),
            optionalObjectiveCount: optionalObjectives.length,
            shotsFired: statsRef.current.shotsFired,
            shotsHit,
            vehicleDamage,
          });
          audioRef.current.cue({
            cue: "mission-complete",
            token: `mission-complete:${state.tick}`,
          });
          track("bay_city_completed");
        }

        vfxRef.current = Object.freeze(nextVfx.slice(-48));
        impulsesRef.current = Object.freeze(nextImpulses.slice(-12));
        notificationRef.current = Object.freeze(nextNotifications.slice(-3));
        const performance = governorRef.current.sample({
          frameMs: frame.elapsedSeconds * 1000,
          droppedSimulationSeconds: frame.droppedSeconds,
        });
        if (performance.changed) {
          qualityRef.current = performance.tier;
          setQuality(performance.tier);
        }

        const hero = state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
        const driving = hero?.occupiedBy === state.playerId;
        const player = state.actors.get(state.playerId);
        const cameraYaw = stepControllerRef.current.getCameraYaw(
          player?.pose.rotationY ?? hero?.pose.rotationY ?? 0,
        );
        const cameraPitch = stepControllerRef.current.getCameraPitch();
        const nextView: SessionView = {
          state,
          snapshot: frame.snapshot,
          input: lastInputRef.current,
          cameraYaw,
          cameraPitch,
          vfxEvents: vfxRef.current,
          cameraImpulses: impulsesRef.current,
          notifications: notificationRef.current,
          objectiveProgress: hudProgressTrackerRef.current.sample(
            definition,
            frame.snapshot,
            frame.events,
          ),
          performance,
        };
        viewRef.current = nextView;
        setView(nextView);

        const listenerPosition = driving
          ? (hero?.pose.position ?? activePlayerPosition(state))
          : (player?.pose.position ?? activePlayerPosition(state));
        const listenerYaw = cameraYaw;
        const activeVelocity = driving
          ? (hero?.velocity ?? ([0, 0, 0] as Vec3))
          : (player?.velocity ?? ([0, 0, 0] as Vec3));
        const ground = player
          ? sampleAfterlightCharacterGround(
              player.pose.position[0],
              player.pose.position[2],
            )
          : null;
        audioRef.current.update({
          mode: driving ? "vehicle" : "foot",
          grounded:
            driving ||
            Boolean(
              player &&
              ground &&
              player.pose.position[1] <= ground.height + 0.06,
            ),
          speedKph: Math.hypot(activeVelocity[0], activeVelocity[2]) * 3.6,
          engineLoad: Math.max(
            Math.abs(lastInputRef.current.throttle),
            lastInputRef.current.brake ? 0.7 : 0,
            Math.min(1, Math.abs(lastInputRef.current.steer) * 0.45),
          ),
          wantedLevel: state.heat.wantedLevel,
          health: player?.health ?? 0,
          paused: pausedRef.current,
          blackout: state.inventory.has(BLACKOUT_MARKER),
          missionIntensity: state.mission.phaseIndex / 5,
          district: currentPhaseContent.location,
          weather: resolveAfterlightWeather(currentPhaseContent.location),
          listenerPosition,
          listenerYaw,
          police: [
            AFTERLIGHT_ENTITY_IDS.policeA,
            AFTERLIGHT_ENTITY_IDS.policeB,
            AFTERLIGHT_ENTITY_IDS.policeC,
          ]
            .slice(0, state.heat.wantedLevel)
            .flatMap((id) => {
              const actor = state.actors.get(id);
              return actor
                ? [
                    {
                      id: `police-${id}`,
                      intensity: actor.kind === "police" ? 1 : 0.85,
                      position: actor.pose.position,
                    },
                  ]
                : [];
            }),
        });
      },
    });
    loopRef.current = loop;
    return () => {
      loop.stop();
      if (loopRef.current === loop) loopRef.current = null;
    };
  }, [sessionVersion]);

  const blocked =
    view.state.mission.failed ||
    (view.state.mission.completed && !debriefDismissed);
  useEffect(() => {
    const loop = loopRef.current;
    if (!loop) return;
    if (started && !paused && !blocked) loop.start();
    else loop.stop();
  }, [blocked, paused, sessionVersion, started]);

  useEffect(() => {
    startedRef.current = started;
    pausedRef.current = paused;
    mutedRef.current = muted;
    reducedMotionRef.current = reducedMotion;
    audioRef.current.setMuted(muted);
    audioRef.current.setPaused(paused || !started || blocked);
  }, [blocked, muted, paused, reducedMotion, started]);

  useEffect(() => {
    const adapter = keyboardRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        if (!startedRef.current) return;
        event.preventDefault();
        if (document.pointerLockElement) {
          document.exitPointerLock();
          return;
        }
        const next = !pausedRef.current;
        pausedRef.current = next;
        setPaused(next);
        return;
      }
      if (!startedRef.current || pausedRef.current) return;
      if (adapter.keyDown(event.code)) event.preventDefault();
      if (event.code === "Space") {
        inputRef.current.setAction("brake", true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      adapter.keyUp(event.code);
      if (event.code === "Space") {
        inputRef.current.setAction("brake", false);
      }
    };
    const onBlur = () => adapter.blur();
    const onVisibility = () => {
      if (document.hidden && startedRef.current) {
        adapter.blur();
        pausedRef.current = true;
        setPaused(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(
    () => () => {
      loopRef.current?.stop();
      void audioRef.current.dispose();
    },
    [],
  );

  const begin = useCallback(() => {
    startedRef.current = true;
    pausedRef.current = false;
    setStarted(true);
    setPaused(false);
    requestGamePointerLock();
    void audioRef.current.start();
    const accepted = selectAfterlightRadioLine(
      viewRef.current.state.seed,
      "runner",
      "mission.accepted",
    );
    notificationRef.current = [
      {
        id: accepted.cueId + "-start",
        title: accepted.speaker.toUpperCase(),
        detail: accepted.line.text,
        tone: "neutral",
      },
    ];
    track("bay_city_started");
  }, [requestGamePointerLock]);

  const continueCheckpoint = useCallback(() => {
    const save = continueSaveRef.current;
    if (!save) return;
    installSession(hydrateAfterlightState(save));
    startedRef.current = true;
    setStarted(true);
    void audioRef.current.start();
    track("bay_city_started", "checkpoint");
  }, [installSession]);

  const retryCheckpoint = useCallback(() => {
    const deaths = statsRef.current.deaths;
    installSession(
      restoreAfterlightCheckpointState(viewRef.current.state),
      deaths,
    );
    startedRef.current = true;
    setStarted(true);
    track("bay_city_restarted", "checkpoint");
  }, [installSession]);

  const restartMission = useCallback(() => {
    installSession(createInitialAfterlightState(GAME_SEED));
    startedRef.current = true;
    setStarted(true);
    track("bay_city_restarted", "mission");
  }, [installSession]);

  const quitToTitle = useCallback(() => {
    loopRef.current?.stop();
    inputRef.current.reset();
    startedRef.current = false;
    pausedRef.current = false;
    setStarted(false);
    setPaused(false);
    releaseGamePointerLock();
  }, [releaseGamePointerLock]);

  const setPause = useCallback(
    (next: boolean) => {
      pausedRef.current = next;
      setPaused(next);
      if (next) releaseGamePointerLock();
      else requestGamePointerLock();
    },
    [releaseGamePointerLock, requestGamePointerLock],
  );

  const setMutedValue = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMuted(next);
    audioRef.current.setMuted(next);
  }, []);

  const setReducedMotionValue = useCallback((next: boolean) => {
    reducedMotionRef.current = next;
    setReducedMotion(next);
  }, []);

  const setQualityValue = useCallback((next: GameQualityTier) => {
    qualityRef.current = next;
    governorRef.current.reset(next);
    setQuality(next);
  }, []);

  const persistControlSettings = useCallback(() => {
    localStorage.setItem(
      CONTROL_SETTINGS_KEY,
      JSON.stringify({
        invertLookY: invertLookYRef.current,
        keyboardBindings: keyboardBindingsRef.current,
        lookSensitivity: lookSensitivityRef.current,
      }),
    );
  }, []);

  const setLookSensitivityValue = useCallback(
    (next: number) => {
      const clamped = clampLookSensitivity(next);
      lookSensitivityRef.current = clamped;
      setLookSensitivity(clamped);
      persistControlSettings();
    },
    [persistControlSettings],
  );

  const setInvertLookYValue = useCallback(
    (next: boolean) => {
      invertLookYRef.current = next;
      setInvertLookY(next);
      persistControlSettings();
    },
    [persistControlSettings],
  );

  const setKeyboardBindingValue = useCallback(
    (action: RemappableKeyboardAction, code: string) => {
      const next = remapKeyboardLayout(
        keyboardBindingsRef.current,
        action,
        code,
      );
      if (next === keyboardBindingsRef.current) return;
      keyboardBindingsRef.current = next;
      keyboardRef.current.setBindings({
        ...DEFAULT_INPUT_BINDINGS,
        keyboard: createKeyboardActionMap(next),
      });
      setKeyboardBindings(next);
      persistControlSettings();
    },
    [persistControlSettings],
  );

  const beginLook = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!startedRef.current || pausedRef.current || blocked) return;
      if (event.pointerType === "touch") {
        capturePointerIfAvailable(event.currentTarget, event.pointerId);
        touchDragRef.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        return;
      }

      if (!pointerLockedRef.current) {
        capturePointerIfAvailable(event.currentTarget, event.pointerId);
        touchDragRef.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        requestGamePointerLock();
        return;
      }
      inputRef.current.setSource("keyboard");
      if (event.button === 0) inputRef.current.setAction("fire", true);
      if (event.button === 2) inputRef.current.setAction("aim", true);
    },
    [blocked, requestGamePointerLock],
  );

  const updateLook = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" && pointerLockedRef.current) {
      inputRef.current.setSource("keyboard");
      inputRef.current.addLookDelta(
        event.movementX * 0.08 * lookSensitivityRef.current,
        -event.movementY *
          0.065 *
          lookSensitivityRef.current *
          (invertLookYRef.current ? -1 : 1),
      );
      return;
    }
    const pointer = touchDragRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    inputRef.current.setSource(
      event.pointerType === "touch" ? "touch" : "keyboard",
    );
    inputRef.current.addLookDelta(
      dx * 0.08 * lookSensitivityRef.current,
      -dy *
        0.065 *
        lookSensitivityRef.current *
        (invertLookYRef.current ? -1 : 1),
    );
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }, []);

  const endLook = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") {
      inputRef.current.setAction("fire", false);
      inputRef.current.setAction("aim", false);
    }
    if (touchDragRef.current?.id === event.pointerId) {
      touchDragRef.current = null;
    }
  }, []);

  const definition = useMemo(
    () => createAfterlightJob(view.state.seed),
    [view.state.seed],
  );
  const phase = definition.phases[view.state.mission.phaseIndex];
  const phaseContent = getAfterlightPhaseContent(
    phase.id as Parameters<typeof getAfterlightPhaseContent>[0],
  );
  const location = AFTERLIGHT_LOCATIONS[phaseContent.location].hudLabel;
  const player = view.state.actors.get(view.state.playerId);
  const hero = view.state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
  const driving = hero?.occupiedBy === view.state.playerId;
  const weapon = view.state.weapons.get("signal-9");
  const reloading = weapon?.reloadingUntilTick !== undefined;
  const reloadProgress = reloading
    ? 1 -
      Math.max(
        0,
        (weapon.reloadingUntilTick ?? view.state.tick) - view.state.tick,
      ) /
        120
    : 0;
  const velocity = driving ? hero?.velocity : player?.velocity;
  const speedKph = Math.hypot(velocity?.[0] ?? 0, velocity?.[2] ?? 0) * 3.6;
  const optionalObjectives = definition.phases
    .flatMap((candidate) => candidate.objectives)
    .filter((objective) => objective.optional);
  const optionalCompleted = optionalObjectives.filter((objective) =>
    view.state.mission.completedObjectiveIds.includes(objective.id),
  ).length;
  const debriefStats: readonly DebriefStat[] =
    runScore?.breakdown.map((entry) => ({
      id: entry.id,
      label: entry.label,
      value: entry.points + "/" + entry.maxPoints,
      emphasis: entry.id === "pace" || entry.id === "survival",
    })) ?? [];
  const settings = {
    invertLookY,
    keyboardBindings,
    lookSensitivity,
    muted,
    quality,
    reducedMotion,
  };
  const canvasSettings = qualitySettings(quality);
  const activePosition = activePlayerPosition(view.state);
  const playerYaw = driving
    ? (hero?.pose.rotationY ?? 0)
    : (player?.pose.rotationY ?? 0);

  return (
    <main
      className="bay-city-shell"
      data-aiming={view.input.aim ? "true" : "false"}
      data-boost={view.input.sprint ? "true" : "false"}
      data-brake={view.input.brake ? "true" : "false"}
      data-camera-yaw={view.cameraYaw.toFixed(4)}
      data-camera-pitch={view.cameraPitch.toFixed(4)}
      data-look-x={view.input.look[0].toFixed(3)}
      data-look-y={view.input.look[1].toFixed(3)}
      data-mode={driving ? "car" : "foot"}
      data-magazine={weapon?.magazine ?? 0}
      data-phase={phase.id}
      data-player-x={activePosition[0].toFixed(2)}
      data-player-y={activePosition[1].toFixed(2)}
      data-player-yaw={playerYaw.toFixed(4)}
      data-player-z={activePosition[2].toFixed(2)}
      data-pointer-locked={pointerLocked ? "true" : "false"}
      data-quality={quality}
      data-frame-ms={view.performance.averageFrameMs.toFixed(2)}
      data-slow-frame-ratio={view.performance.slowFrameRatio.toFixed(3)}
      data-dropped-seconds={view.performance.droppedSimulationSeconds.toFixed(
        3,
      )}
      data-speed={speedKph.toFixed(2)}
      data-steer={view.input.steer.toFixed(3)}
      data-throttle={view.input.throttle.toFixed(3)}
      data-tick={view.state.tick}
      data-vehicle-health={(hero?.health ?? 0).toFixed(2)}
      data-vehicle-yaw={(hero?.pose.rotationY ?? 0).toFixed(4)}
      data-testid="afterlight-game"
    >
      <div className="bay-city-canvas" aria-hidden="true">
        <Canvas
          camera={{
            far: 620,
            fov: 62,
            near: 0.08,
            position: [70, 12, 66],
          }}
          dpr={[...canvasSettings.dpr]}
          gl={{
            antialias: canvasSettings.antialias,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.domElement.id = "afterlight-renderer";
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.98;
            gl.domElement.addEventListener("webglcontextlost", (event) => {
              event.preventDefault();
              notificationRef.current = [
                {
                  id: "webgl-lost",
                  title: "RENDER LINK LOST",
                  detail: "Reload to reconnect to Bay City.",
                  tone: "danger",
                },
              ];
            });
          }}
          shadows={
            canvasSettings.shadows ? { type: THREE.PCFShadowMap } : false
          }
        >
          <Suspense fallback={null}>
            <AfterlightScene
              cameraImpulses={view.cameraImpulses}
              cameraPitch={view.cameraPitch}
              cameraYaw={view.cameraYaw}
              input={view.input}
              paused={paused || blocked}
              quality={quality}
              reducedMotion={reducedMotion}
              snapshot={view.snapshot}
              started={started}
              state={view.state}
              vfxEvents={view.vfxEvents}
            />
          </Suspense>
        </Canvas>
      </div>

      <div
        aria-hidden="true"
        className="game-input-surface"
        onContextMenu={(event) => event.preventDefault()}
        onPointerCancel={endLook}
        onPointerDown={beginLook}
        onPointerMove={updateLook}
        onPointerUp={endLook}
        ref={inputSurfaceRef}
      />

      {started && !paused ? (
        <AfterlightHud
          cash={view.state.cash}
          health={player?.health ?? 0}
          location={location}
          minimap={minimapForState(view.state, definition, location)}
          mission={missionForHud(
            view.snapshot,
            definition,
            view.objectiveProgress,
          )}
          muted={muted}
          notifications={view.notifications}
          onPause={() => setPause(true)}
          onToggleMute={() => setMutedValue(!mutedRef.current)}
          speedKph={speedKph}
          touchControlsVisible={touch}
          vehicle={
            driving && hero
              ? {
                  name: "M/01 COUPE",
                  integrity: hero.health,
                  maxIntegrity: 100,
                }
              : undefined
          }
          wantedLevel={view.state.heat.wantedLevel}
          weapon={{
            name: "SIGNAL-9",
            magazine: weapon?.magazine ?? 0,
            magazineSize: 24,
            reserve: weapon?.reserve ?? 0,
            reloading,
            reloadProgress,
          }}
        />
      ) : null}

      <MirageIntroOverlay
        canContinue={continueAvailable}
        inputMode={touch ? "touch" : "desktop"}
        onContinue={continueCheckpoint}
        onStart={begin}
        visible={!started}
      />

      <PauseMenu
        checkpointLabel={phase.location}
        onInvertLookYChange={setInvertLookYValue}
        onKeyboardBindingChange={setKeyboardBindingValue}
        onLookSensitivityChange={setLookSensitivityValue}
        onMutedChange={setMutedValue}
        onQualityChange={setQualityValue}
        onQuit={quitToTitle}
        onReducedMotionChange={setReducedMotionValue}
        onRestartCheckpoint={retryCheckpoint}
        onRestartMission={restartMission}
        onResume={() => setPause(false)}
        open={started && paused}
        value={settings}
      />

      <DeathCheckpointOverlay
        checkpointLabel={phase.location}
        mode="death"
        onRetry={retryCheckpoint}
        visible={started && view.state.mission.failed}
      />

      <MissionDebriefOverlay
        earnedCash={view.state.cash}
        elapsedTicks={view.state.tick}
        optionalCompleted={optionalCompleted}
        optionalTotal={optionalObjectives.length}
        onContinue={() => setDebriefDismissed(true)}
        onReplay={restartMission}
        rank={runScore?.rank ?? "C"}
        stats={debriefStats}
        visible={started && view.state.mission.completed && !debriefDismissed}
      />

      {touch && started && !paused && !blocked ? (
        <TouchControls
          disabled={blocked}
          interactionAvailable
          mode={driving ? "vehicle" : "foot"}
          onAimChange={(pressed) => inputRef.current.setAction("aim", pressed)}
          onBrakeJumpChange={(pressed) => {
            if (driving) inputRef.current.setAction("brake", pressed);
            else if (pressed) {
              inputRef.current.setAction("jump", true);
              inputRef.current.setAction("jump", false);
            }
          }}
          onEnterExit={() => {
            inputRef.current.setAction("interact", true);
            inputRef.current.setAction("interact", false);
          }}
          onFireChange={(pressed) =>
            inputRef.current.setAction("fire", pressed)
          }
          onInteract={() => {
            inputRef.current.setAction("interact", true);
            inputRef.current.setAction("interact", false);
          }}
          onLook={(vector) => {
            touchLookRef.current = vector;
          }}
          onMove={(vector) => {
            inputRef.current.setSource("touch");
            inputRef.current.setAxis("move-x", vector[0]);
            inputRef.current.setAxis("move-y", vector[1]);
            inputRef.current.setAxis("steer", vector[0]);
            inputRef.current.setAxis("throttle", vector[1]);
          }}
          onSprintBoostChange={(pressed) =>
            inputRef.current.setAction("sprint", pressed)
          }
        />
      ) : null}
    </main>
  );
}
