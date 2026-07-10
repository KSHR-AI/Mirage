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
  createAfterlightStep,
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
  InputBuffer,
  KeyboardInputAdapter,
  applyGamepadSnapshot,
} from "../game/input/input-buffer";
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
} from "../game/performance";
import type { AfterlightCameraImpulse } from "../game/presentation/camera";
import {
  AfterlightHud,
  DeathCheckpointOverlay,
  MirageIntroOverlay,
  MissionDebriefOverlay,
  PauseMenu,
  TouchControls,
  type DebriefStat,
  type HudMapRoad,
  type HudMinimap,
  type HudMission,
  type HudNotification,
} from "../game/presentation/hud";
import type { AfterlightVfxEvent } from "../game/presentation/vfx";
import { ReplayRecorder, scoreRun, type RunScore } from "../game/replay";
import { AfterlightScene, AFTERLIGHT_SCENE_TARGETS } from "./AfterlightScene";

interface SessionView {
  readonly state: GameState;
  readonly snapshot: RenderSnapshot;
  readonly input: InputFrame;
  readonly vfxEvents: readonly AfterlightVfxEvent[];
  readonly cameraImpulses: readonly AfterlightCameraImpulse[];
  readonly notifications: readonly HudNotification[];
}

interface RunStats {
  deaths: number;
  shotsFired: number;
  shotsHit: number;
  finished: boolean;
}

interface PointerDrag {
  readonly id: number;
  x: number;
  y: number;
  readonly pointerType: string;
}

const GAME_SEED = 2407;
const EMPTY_VFX_EVENTS: readonly AfterlightVfxEvent[] = Object.freeze([]);
const EMPTY_CAMERA_IMPULSES: readonly AfterlightCameraImpulse[] = Object.freeze(
  [],
);
const BLACKOUT_MARKER = "afterlight:blackout:active";

function getTouchSnapshot(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 760
  );
}

function getServerTouchSnapshot(): boolean {
  return false;
}

function subscribeToTouch(onStoreChange: () => void): () => void {
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", onStoreChange);
  window.addEventListener("resize", onStoreChange);
  return () => {
    query.removeEventListener("change", onStoreChange);
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
  state: GameState,
  definition: AfterlightJobDefinition,
): HudMission {
  const phase = definition.phases[state.mission.phaseIndex];
  const completed = new Set(state.mission.completedObjectiveIds);
  const activeRequired = phase.objectives.find(
    (objective) => !objective.optional && !completed.has(objective.id),
  );
  return {
    title: definition.title,
    chapter: phase.chapter,
    chapterIndex: state.mission.phaseIndex,
    chapterCount: definition.phases.length,
    location: phase.location,
    objectives: phase.objectives.map((objective) => ({
      id: objective.id,
      label:
        getAfterlightObjectivePrompt(
          objective.id as Parameters<typeof getAfterlightObjectivePrompt>[0],
        )?.text ?? objective.label,
      completed: completed.has(objective.id),
      optional: objective.optional,
      active: objective.optional
        ? !completed.has(objective.id)
        : objective.id === activeRequired?.id,
    })),
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
    vfxEvents: EMPTY_VFX_EVENTS,
    cameraImpulses: EMPTY_CAMERA_IMPULSES,
    notifications: [initialNotification(state)],
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
    const runtime = createGameRuntime(state, createAfterlightStep(state.seed));
    const input = new InputBuffer();
    return {
      state,
      runtime,
      input,
      keyboard: new KeyboardInputAdapter(input),
      recorder: new ReplayRecorder(state.seed),
      notification: initialNotification(state),
    };
  });
  const runtimeRef = useRef<DeterministicGameRuntime | null>(
    initialSession.runtime,
  );
  const inputRef = useRef(initialSession.input);
  const keyboardRef = useRef(initialSession.keyboard);
  const loopRef = useRef<BrowserGameLoop | null>(null);
  const audioRef = useRef(new AfterlightAudioDirector());
  const recorderRef = useRef(initialSession.recorder);
  const saveRepositoryRef = useRef<SaveGameRepository | null>(null);
  const continueSaveRef = useRef<SaveGameV1 | null>(null);
  const lastInputRef = useRef<InputFrame>(EMPTY_INPUT_FRAME);
  const touchLookRef = useRef<readonly [number, number]>([0, 0]);
  const pointerRef = useRef<PointerDrag | null>(null);
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
  const impulseSequenceRef = useRef(0);
  const qualityRef = useRef<GameQualityTier>("medium");
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
  const [muted, setMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [quality, setQuality] = useState<GameQualityTier>("medium");
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
    qualityRef.current = initialQuality;
    governorRef.current.reset(initialQuality);
    reducedMotionRef.current = profile.reducedMotion;
    saveRepositoryRef.current = new SaveGameRepository(window.localStorage);
    continueSaveRef.current = saveRepositoryRef.current.load();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setQuality(initialQuality);
      setReducedMotion(profile.reducedMotion);
      setContinueAvailable(Boolean(continueSaveRef.current));
    });
    return () => {
      cancelled = true;
      document.body.classList.remove("bay-city-active");
    };
  }, []);

  const installSession = useCallback((state: GameState, deaths = 0) => {
    loopRef.current?.stop();
    inputRef.current.reset();
    touchLookRef.current = [0, 0];
    const runtime = createGameRuntime(state, createAfterlightStep(state.seed));
    runtimeRef.current = runtime;
    recorderRef.current = new ReplayRecorder(state.seed);
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
          applyGamepadSnapshot(inputRef.current, {
            axes: [...pad.axes],
            buttons: pad.buttons.map((button) => ({
              pressed: button.pressed,
              value: button.value,
            })),
          });
        }
        if (touchLookRef.current[0] !== 0 || touchLookRef.current[1] !== 0) {
          inputRef.current.setSource("touch");
          inputRef.current.setAxis("look-x", touchLookRef.current[0] * 0.6);
          inputRef.current.setAxis("look-y", touchLookRef.current[1] * 0.45);
        }
        const input = inputRef.current.frame();
        lastInputRef.current = input;
        recorderRef.current.appendFrame(input);
        return input;
      },
      render: (frame) => {
        const state = runtime.state;
        const previousState = viewRef.current.state;
        const definition = createAfterlightJob(state.seed);
        const nextVfx = [...vfxRef.current];
        const nextImpulses = [...impulsesRef.current];
        const nextNotifications = [...notificationRef.current];

        for (const event of frame.events) {
          const vfx = vfxForEvent(event, state);
          if (vfx) nextVfx.push(vfx);
          const cue = audioCueForEvent(event, state.playerId);
          if (cue) audioRef.current.cue(cue);
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
          audioRef.current.cue("weapon-fire");
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
          audioRef.current.cue("mission-phase");
          previousPhaseRef.current = state.mission.phaseIndex;
          track("bay_city_mission", phase.id);
        }

        if (state.mission.failed && !previousState.mission.failed) {
          statsRef.current.deaths += 1;
          audioRef.current.cue("death");
        }

        if (
          state.tick > 0 &&
          state.tick % 300 === 0 &&
          state.tick !== lastHashTickRef.current
        ) {
          recorderRef.current.recordHash(state.tick, runtime.hash());
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
          recorderRef.current.finish({
            missionId: state.mission.missionId,
            status: "completed",
            completionTick: state.tick,
            deaths: statsRef.current.deaths,
            optionalObjectiveIds: optionalCompleted.map(
              (objective) => objective.id,
            ),
            optionalObjectiveCount: optionalObjectives.length,
            shotsFired: statsRef.current.shotsFired,
            shotsHit,
            vehicleDamage,
          });
          audioRef.current.cue("mission-complete");
          track("bay_city_completed");
        }

        vfxRef.current = Object.freeze(nextVfx.slice(-48));
        impulsesRef.current = Object.freeze(nextImpulses.slice(-12));
        notificationRef.current = Object.freeze(nextNotifications.slice(-3));
        const nextView: SessionView = {
          state,
          snapshot: frame.snapshot,
          input: lastInputRef.current,
          vfxEvents: vfxRef.current,
          cameraImpulses: impulsesRef.current,
          notifications: notificationRef.current,
        };
        viewRef.current = nextView;
        setView(nextView);

        const hero = state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
        const driving = hero?.occupiedBy === state.playerId;
        const player = state.actors.get(state.playerId);
        const activeVelocity = driving
          ? (hero?.velocity ?? ([0, 0, 0] as Vec3))
          : (player?.velocity ?? ([0, 0, 0] as Vec3));
        audioRef.current.update({
          mode: driving ? "vehicle" : "foot",
          speedKph: Math.hypot(activeVelocity[0], activeVelocity[2]) * 3.6,
          wantedLevel: state.heat.wantedLevel,
          health: player?.health ?? 0,
          paused: pausedRef.current,
          blackout: state.inventory.has(BLACKOUT_MARKER),
          missionIntensity: state.mission.phaseIndex / 5,
        });

        const report = governorRef.current.sample({
          frameMs: frame.elapsedSeconds * 1000,
          droppedSimulationSeconds: frame.droppedSeconds,
        });
        if (report.changed) {
          qualityRef.current = report.tier;
          setQuality(report.tier);
        }
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
  }, [muted, paused, reducedMotion, started]);

  useEffect(() => {
    const adapter = keyboardRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        if (!startedRef.current) return;
        event.preventDefault();
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
  }, []);

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
  }, []);

  const setPause = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
  }, []);

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

  const beginLook = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!startedRef.current || pausedRef.current || blocked) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType,
      };
      if (event.pointerType !== "touch") {
        if (event.button === 0) inputRef.current.setAction("fire", true);
        if (event.button === 2) inputRef.current.setAction("aim", true);
      }
    },
    [blocked],
  );

  const updateLook = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    inputRef.current.addLookDelta(dx * 0.08, -dy * 0.065);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }, []);

  const endLook = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    if (pointerRef.current.pointerType !== "touch") {
      inputRef.current.setAction("fire", false);
      inputRef.current.setAction("aim", false);
    }
    pointerRef.current = null;
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
  const settings = { muted, reducedMotion, quality };
  const canvasSettings = qualitySettings(quality);
  const activePosition = activePlayerPosition(view.state);

  return (
    <main
      className="bay-city-shell"
      data-mode={driving ? "car" : "foot"}
      data-player-x={activePosition[0].toFixed(2)}
      data-player-z={activePosition[2].toFixed(2)}
      data-speed={speedKph.toFixed(2)}
      data-tick={view.state.tick}
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
      />

      {started ? (
        <AfterlightHud
          cash={view.state.cash}
          health={player?.health ?? 0}
          location={location}
          minimap={minimapForState(view.state, definition, location)}
          mission={missionForHud(view.state, definition)}
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
