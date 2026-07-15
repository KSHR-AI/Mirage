"use client";

import { Canvas } from "@react-three/fiber";
import {
  CircleStop,
  Gauge,
  MoveHorizontal,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace } from "three";

import { CITY_BLOCKS, ROAD_LINES, districtAtPosition } from "./map";
import { MirageScene } from "./MirageScene";
import {
  EMPTY_INPUT,
  MISSION_TARGETS,
  createMirageRunState,
  getCurrentTarget,
  getRank,
  getTimeRemaining,
} from "./simulation";
import type { MirageInput, MirageRunState } from "./types";
import styles from "./MirageGame.module.css";

type GameMode = "intro" | "playing" | "complete";

function subscribeToTouchProfile(onChange: () => void) {
  const media = window.matchMedia("(pointer: coarse)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getTouchProfile() {
  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  const hundredths = Math.floor((safe % 1) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function titleCase(value: string): string {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MiniMap({ state }: { readonly state: MirageRunState }) {
  const target = getCurrentTarget(state);
  const mapPoint = (value: number) => value + 120;
  const yawDegrees = (state.car.yaw * 180) / Math.PI;
  return (
    <div className={styles.minimap}>
      <svg aria-label="City minimap" role="img" viewBox="0 0 240 240">
        <rect width="240" height="240" fill="#173840" />
        {ROAD_LINES.map((line) => (
          <g key={line}>
            <line
              x1={mapPoint(line)}
              x2={mapPoint(line)}
              y1="8"
              y2="232"
              stroke="#708d89"
              strokeWidth="8"
            />
            <line
              x1="8"
              x2="232"
              y1={mapPoint(line)}
              y2={mapPoint(line)}
              stroke="#708d89"
              strokeWidth="8"
            />
          </g>
        ))}
        <circle
          cx={mapPoint(target.x)}
          cy={mapPoint(target.z)}
          r="8"
          fill="none"
          stroke="#d8ff55"
          strokeWidth="4"
        />
        {state.routeIndex > 0
          ? state.pursuers.map((pursuer) => (
              <circle
                key={pursuer.id}
                cx={mapPoint(pursuer.x)}
                cy={mapPoint(pursuer.z)}
                r="4"
                fill="#ff5d54"
              />
            ))
          : null}
        <g
          transform={`translate(${mapPoint(state.car.x)} ${mapPoint(state.car.z)}) rotate(${yawDegrees})`}
        >
          <path d="M 0 -9 L 6 7 L 0 4 L -6 7 Z" fill="#fff8e8" />
        </g>
      </svg>
    </div>
  );
}

function TouchControls({
  inputRef,
}: {
  readonly inputRef: MutableRefObject<MirageInput>;
}) {
  const [steer, setSteer] = useState(0);
  const [boosting, setBoosting] = useState(false);
  const [braking, setBraking] = useState(false);
  const steeringPointer = useRef<number | null>(null);

  const updateInput = useCallback(
    (patch: Partial<MirageInput>) => {
      inputRef.current = { ...inputRef.current, ...patch };
    },
    [inputRef],
  );
  const updateSteer = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const value = Math.max(
        -1,
        Math.min(
          1,
          (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.36),
        ),
      );
      setSteer(value);
      updateInput({ steer: value });
    },
    [updateInput],
  );
  const releaseSteer = useCallback(() => {
    steeringPointer.current = null;
    setSteer(0);
    updateInput({ steer: 0 });
  }, [updateInput]);
  const pressAction = useCallback(
    (
      action: "boost" | "brake",
      active: boolean,
      event?: ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (active && event) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (action === "boost") setBoosting(active);
      else setBraking(active);
      updateInput({ [action]: active });
    },
    [updateInput],
  );

  return (
    <div aria-label="Touch game controls" className={styles.touchControls}>
      <button
        aria-label="Steer"
        className={styles.steerPad}
        data-active={Math.abs(steer) > 0.08}
        onContextMenu={(event) => event.preventDefault()}
        onPointerCancel={releaseSteer}
        onPointerDown={(event) => {
          steeringPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateSteer(event);
        }}
        onPointerMove={(event) => {
          if (steeringPointer.current === event.pointerId) updateSteer(event);
        }}
        onPointerUp={releaseSteer}
        title="Steer"
        type="button"
      >
        <span
          className={styles.steerKnob}
          style={{ transform: `translateX(${steer * 35}px)` }}
        >
          <MoveHorizontal aria-hidden size={26} strokeWidth={2.4} />
        </span>
      </button>
      <div className={styles.touchActions}>
        <button
          aria-label="Boost"
          className={styles.touchAction}
          data-active={boosting}
          onPointerCancel={(event) => pressAction("boost", false, event)}
          onPointerDown={(event) => pressAction("boost", true, event)}
          onPointerUp={(event) => pressAction("boost", false, event)}
          title="Boost"
          type="button"
        >
          <Gauge aria-hidden size={27} strokeWidth={2.4} />
        </button>
        <button
          aria-label="Brake"
          className={styles.touchAction}
          data-active={braking}
          onPointerCancel={(event) => pressAction("brake", false, event)}
          onPointerDown={(event) => pressAction("brake", true, event)}
          onPointerUp={(event) => pressAction("brake", false, event)}
          title="Brake"
          type="button"
        >
          <CircleStop aria-hidden size={27} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

function GameHud({
  inputRef,
  state,
  touch,
}: {
  readonly inputRef: MutableRefObject<MirageInput>;
  readonly state: MirageRunState;
  readonly touch: boolean;
}) {
  const target = getCurrentTarget(state);
  const remaining = getTimeRemaining(state);
  const checkpointTotal = MISSION_TARGETS.filter(
    (candidate) => candidate.type === "checkpoint",
  ).length;
  const checkpointProgress = Math.max(
    0,
    Math.min(checkpointTotal, state.routeIndex - 1),
  );
  return (
    <>
      <section aria-label="Current objective" className={styles.objective}>
        <span>The Drop</span>
        <strong>{target.label}</strong>
        <small>
          {state.phase === "pickup"
            ? "Package pickup"
            : state.phase === "delivery"
              ? "Final delivery"
              : `Escape gate ${checkpointProgress + 1} / ${checkpointTotal}`}
        </small>
      </section>
      <section aria-label="Run statistics" className={styles.runStats}>
        <div
          className={`${styles.runStat} ${remaining <= 15 ? styles.timerLate : ""}`}
        >
          <span className={styles.statLabel}>Time</span>
          <strong>{formatTime(remaining)}</strong>
        </div>
        <div className={styles.runStat}>
          <span className={styles.scoreLabel}>Score</span>
          <strong>{state.score.toLocaleString("en-US")}</strong>
        </div>
      </section>
      <div aria-label={`Heat ${state.heat} of 3`} className={styles.heat}>
        <span className={styles.heatLabel}>Heat</span>
        <span className={styles.heatBars}>
          {[1, 2, 3].map((level) => (
            <span
              key={level}
              className={styles.heatBar}
              data-active={level <= state.heat}
            />
          ))}
        </span>
      </div>
      <MiniMap state={state} />
      <section aria-label="Vehicle status" className={styles.driveStats}>
        <span className={styles.district}>
          {titleCase(districtAtPosition(state.car))}
        </span>
        <div className={styles.speed}>
          <strong>
            {String(Math.round(state.car.speed * 3.6)).padStart(3, "0")}
          </strong>
          <span>KM/H</span>
        </div>
        <div
          aria-label={`Boost ${Math.round(state.car.boost * 100)} percent`}
          className={styles.boostMeter}
        >
          <div
            className={styles.boostFill}
            style={{ transform: `scaleX(${state.car.boost})` }}
          />
        </div>
      </section>
      {touch ? <TouchControls inputRef={inputRef} /> : null}
    </>
  );
}

function Debrief({
  onReplay,
  state,
}: {
  readonly onReplay: () => void;
  readonly state: MirageRunState;
}) {
  const score = state.finalScore ?? state.score;
  return (
    <section
      aria-labelledby="debrief-title"
      aria-modal="true"
      className={styles.debrief}
      role="dialog"
    >
      <div className={styles.debriefCopy}>
        <span className={styles.debriefEyebrow}>Mirage / Mission complete</span>
        <h2 id="debrief-title">The drop is clean.</h2>
        <p>Pier 11 / Package delivered</p>
      </div>
      <div>
        <div className={styles.debriefRank}>
          <span className={styles.statLabel}>Rank</span>
          <strong>{getRank(score)}</strong>
        </div>
        <div className={styles.debriefStats}>
          <div className={styles.debriefStat}>
            <span className={styles.statLabel}>Score</span>
            <strong>{score.toLocaleString("en-US")}</strong>
          </div>
          <div className={styles.debriefStat}>
            <span className={styles.statLabel}>Time</span>
            <strong>{formatTime(state.elapsed)}</strong>
          </div>
          <div className={styles.debriefStat}>
            <span className={styles.statLabel}>Near misses</span>
            <strong>{state.nearMisses}</strong>
          </div>
          <div className={styles.debriefStat}>
            <span className={styles.statLabel}>Collisions</span>
            <strong>{state.collisions}</strong>
          </div>
        </div>
        <button
          aria-label="Replay The Drop"
          className={styles.replayButton}
          onClick={onReplay}
          type="button"
        >
          <RotateCcw aria-hidden size={17} strokeWidth={2.6} />
          Replay
        </button>
      </div>
    </section>
  );
}

export function MirageGame() {
  const initial = useMemo(() => createMirageRunState(), []);
  const [mode, setMode] = useState<GameMode>("intro");
  const [renderStats, setRenderStats] = useState({
    drawCalls: 0,
    triangles: 0,
  });
  const [sceneReady, setSceneReady] = useState(false);
  const [snapshot, setSnapshot] = useState(initial);
  const touch = useSyncExternalStore(
    subscribeToTouchProfile,
    getTouchProfile,
    () => false,
  );
  const [toast, setToast] = useState("");
  const stateRef = useRef(initial);
  const inputRef = useRef<MirageInput>({ ...EMPTY_INPUT });
  const pressedKeys = useRef(new Set<string>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventId = useRef(initial.eventId);

  useEffect(() => {
    document.body.classList.add("mirage-active");
    return () => {
      document.body.classList.remove("mirage-active");
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const syncInput = () => {
      const keys = pressedKeys.current;
      const left = keys.has("a") || keys.has("arrowleft");
      const right = keys.has("d") || keys.has("arrowright");
      inputRef.current = {
        boost: keys.has(" ") || keys.has("w") || keys.has("arrowup"),
        brake: keys.has("s") || keys.has("arrowdown"),
        steer: Number(right) - Number(left),
      };
    };
    const handleKey = (event: KeyboardEvent, pressed: boolean) => {
      const key = event.key.toLowerCase();
      if (
        ![
          "a",
          "d",
          "s",
          "w",
          "arrowleft",
          "arrowright",
          "arrowup",
          "arrowdown",
          " ",
        ].includes(key)
      ) {
        return;
      }
      if (mode !== "playing") return;
      event.preventDefault();
      if (pressed) pressedKeys.current.add(key);
      else pressedKeys.current.delete(key);
      syncInput();
    };
    const down = (event: KeyboardEvent) => handleKey(event, true);
    const up = (event: KeyboardEvent) => handleKey(event, false);
    const blur = () => {
      pressedKeys.current.clear();
      inputRef.current = { ...EMPTY_INPUT };
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up, { passive: false });
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [mode]);

  const handleSnapshot = useCallback((next: MirageRunState) => {
    setSnapshot(next);
    if (next.eventId !== lastEventId.current) {
      lastEventId.current = next.eventId;
      setToast(next.eventLabel);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 2_200);
    }
    if (next.phase === "complete") setMode("complete");
  }, []);

  const startRun = useCallback(() => {
    const next = createMirageRunState();
    stateRef.current = next;
    inputRef.current = { ...EMPTY_INPUT };
    pressedKeys.current.clear();
    lastEventId.current = next.eventId;
    setSnapshot(next);
    setToast("");
    setMode("playing");
  }, []);
  const handleRenderStats = useCallback(
    (drawCalls: number, triangles: number) => {
      setRenderStats((current) =>
        current.drawCalls === drawCalls && current.triangles === triangles
          ? current
          : { drawCalls, triangles },
      );
    },
    [],
  );

  const target = getCurrentTarget(snapshot);
  return (
    <main
      className={styles.game}
      data-camera-mode="fixed-isometric"
      data-collisions={snapshot.collisions}
      data-draw-calls={renderStats.drawCalls}
      data-map-blocks={CITY_BLOCKS.length}
      data-near-misses={snapshot.nearMisses}
      data-phase={snapshot.phase}
      data-player-speed={snapshot.car.speed.toFixed(3)}
      data-player-x={snapshot.car.x.toFixed(3)}
      data-player-yaw={snapshot.car.yaw.toFixed(4)}
      data-player-z={snapshot.car.z.toFixed(3)}
      data-recoveries={snapshot.recoveries}
      data-ramp-used={snapshot.rampUsed}
      data-route-index={snapshot.routeIndex}
      data-scene-ready={sceneReady}
      data-score={snapshot.score}
      data-boost-pickups={snapshot.collectedBoosts.filter(Boolean).length}
      data-target-x={target.x}
      data-target-z={target.z}
      data-testid="mirage-game"
      data-touch={touch}
      data-triangles={renderStats.triangles}
    >
      <Canvas
        className={styles.canvas}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        id="mirage-renderer"
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.02;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = PCFShadowMap;
        }}
        performance={{ min: 0.75 }}
        shadows
      >
        <MirageScene
          inputRef={inputRef}
          onReady={() => setSceneReady(true)}
          onRenderStats={handleRenderStats}
          onSnapshot={handleSnapshot}
          running={mode === "playing"}
          stateRef={stateRef}
        />
      </Canvas>

      {mode === "intro" ? (
        <section aria-labelledby="mirage-title" className={styles.intro}>
          <header className={styles.introHeader}>
            <span>Bay City / 12:16 PM</span>
            <span>One package. One clean exit.</span>
          </header>
          <div className={styles.introContent}>
            <p className={styles.introEyebrow}>A Mirage production</p>
            <h1 id="mirage-title">Mirage</h1>
            <h2>The Drop</h2>
            <p className={styles.introBrief}>
              Grab the package downtown, break the pursuit, and reach Pier 11
              before the city closes in.
            </p>
            <button
              className={styles.startButton}
              disabled={!sceneReady}
              onClick={startRun}
              type="button"
            >
              <Play aria-hidden fill="currentColor" size={16} />
              {sceneReady ? "Start run" : "Loading city"}
            </button>
          </div>
          <footer className={styles.introFooter}>
            San Francisco, reimagined in blocks
          </footer>
        </section>
      ) : (
        <GameHud inputRef={inputRef} state={snapshot} touch={touch} />
      )}

      {toast && mode === "playing" ? (
        <div
          aria-live="polite"
          className={styles.eventToast}
          key={snapshot.eventId}
        >
          {toast}
        </div>
      ) : null}

      {mode === "complete" ? (
        <Debrief onReplay={startRun} state={snapshot} />
      ) : null}
    </main>
  );
}
