"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import baseStyles from "../game/HotDrop.module.css";
import { VEHICLE_3D_PROFILES, FIXED_TIMESTEP } from "./config";
import { createMissionState, objectiveForMission } from "./gameplay";
import styles from "./HotDrop3D.module.css";
import { HotDropPresentation } from "./presentation";
import {
  HotDropSimulation,
  type Game3DInput,
  type SimulationSnapshot,
} from "./simulation";

const EMPTY_INPUT: Game3DInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  handbrake: false,
  action: false,
};

const initialMission = createMissionState();
const initialProfile = VEHICLE_3D_PROFILES.muscle;
const INITIAL_SNAPSHOT: SimulationSnapshot = {
  mission: initialMission,
  objective: objectiveForMission(initialMission.phase),
  speedMph: 0,
  interaction: "",
  vehicleLabel: initialProfile.label,
  vehicleTrait: initialProfile.trait,
  vehicleClass: "muscle",
  vehicleHealthPercent: 100,
  policeCount: 0,
  playerY: 1.1,
  drifting: false,
};

export function HotDrop3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const inputRef = useRef<Game3DInput>({ ...EMPTY_INPUT });
  const simulationRef = useRef<HotDropSimulation | null>(null);
  const hasStartedRef = useRef(false);
  const [snapshot, setSnapshot] =
    useState<SimulationSnapshot>(INITIAL_SNAPSHOT);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [runNumber, setRunNumber] = useState(0);

  const beginRun = useCallback(() => {
    if (!runtimeReady) return;
    hasStartedRef.current = true;
    setHasStarted(true);
    requestAnimationFrame(() => shellRef.current?.focus());
  }, [runtimeReady]);

  const restartRun = useCallback(() => {
    inputRef.current = { ...EMPTY_INPUT };
    hasStartedRef.current = true;
    setHasStarted(true);
    setRuntimeReady(false);
    setRuntimeError("");
    setSnapshot(INITIAL_SNAPSHOT);
    setRunNumber((current) => current + 1);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let presentation: HotDropPresentation | null = null;
    let simulation: HotDropSimulation | null = null;
    let previousTime = performance.now();
    let accumulator = 0;
    let lastHudUpdate = 0;

    const initialize = async () => {
      try {
        simulation = await HotDropSimulation.create();
        if (cancelled) {
          simulation.dispose();
          return;
        }
        simulationRef.current = simulation;
        presentation = new HotDropPresentation(canvas, simulation);
        const resize = () => {
          const bounds = canvas.getBoundingClientRect();
          presentation?.resize(bounds.width, bounds.height);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resize();
        setSnapshot(simulation.snapshot());
        setRuntimeReady(true);

        const frame = (time: number) => {
          if (!simulation || !presentation) return;
          const frameDelta = Math.min((time - previousTime) / 1000, 0.1);
          previousTime = time;

          if (hasStartedRef.current) {
            accumulator += frameDelta;
            while (accumulator >= FIXED_TIMESTEP) {
              simulation.step(inputRef.current);
              accumulator -= FIXED_TIMESTEP;
            }
          }

          presentation.render(time);
          if (time - lastHudUpdate > 70) {
            lastHudUpdate = time;
            setSnapshot(simulation.snapshot());
          }
          animationFrame = requestAnimationFrame(frame);
        };
        animationFrame = requestAnimationFrame(frame);
      } catch (error) {
        if (!cancelled) {
          setRuntimeError(
            error instanceof Error
              ? error.message
              : "3D runtime failed to load",
          );
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      presentation?.dispose();
      simulation?.dispose();
      if (simulationRef.current === simulation) simulationRef.current = null;
    };
  }, [runNumber]);

  useEffect(() => {
    const keyMap: Record<string, keyof Game3DInput | "restart"> = {
      ArrowUp: "up",
      KeyW: "up",
      ArrowDown: "down",
      KeyS: "down",
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      Space: "handbrake",
      KeyE: "action",
      Enter: "action",
      KeyR: "restart",
    };

    const handleKey = (event: KeyboardEvent, pressed: boolean) => {
      if (
        !hasStarted &&
        pressed &&
        (event.code === "Enter" || event.code === "Space")
      ) {
        event.preventDefault();
        beginRun();
        return;
      }
      const control = keyMap[event.code];
      if (!control) return;
      event.preventDefault();
      if (control === "restart") {
        if (pressed) restartRun();
        return;
      }
      inputRef.current[control] = pressed;
    };

    const down = (event: KeyboardEvent) => handleKey(event, true);
    const up = (event: KeyboardEvent) => handleKey(event, false);
    const clear = () => {
      inputRef.current = { ...EMPTY_INPUT };
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up, { passive: false });
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [beginRun, hasStarted, restartRun]);

  const setTouchControl = (
    control: keyof Game3DInput,
    pressed: boolean,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    inputRef.current[control] = pressed;
    if (pressed) event.currentTarget.setPointerCapture(event.pointerId);
  };

  const mission = snapshot.mission;
  const terminal = mission.phase === "won" || mission.phase === "busted";
  const canInteract = hasStarted && !terminal && Boolean(snapshot.interaction);

  return (
    <main
      ref={shellRef}
      className={baseStyles.shell}
      tabIndex={-1}
      aria-label="Hot Drop 3D game"
    >
      <canvas
        ref={canvasRef}
        className={baseStyles.canvas}
        aria-label="Third-person 3D city driving game"
      />
      <div className={baseStyles.scanlines} aria-hidden="true" />

      <header className={baseStyles.topHud}>
        <div className={baseStyles.brand}>
          <span>Hot</span>
          <strong>Drop</strong>
          <small>Bay City · 3D build</small>
        </div>
        <div className={baseStyles.objectivePanel}>
          <span>Current move</span>
          <strong>{snapshot.objective}</strong>
          <div className={baseStyles.objectiveRule} />
        </div>
        <div className={baseStyles.scorePanel}>
          <div>
            <span>Score</span>
            <strong>{mission.score.toString().padStart(6, "0")}</strong>
          </div>
          <div>
            <span>Clock</span>
            <strong
              className={mission.timeLeft < 20 ? baseStyles.dangerText : ""}
            >
              {formatTime(mission.timeLeft)}
            </strong>
          </div>
        </div>
      </header>

      <div
        className={baseStyles.heat}
        aria-label={`Heat level ${mission.heat}`}
      >
        <span>Heat</span>
        <div>
          {[1, 2, 3].map((level) => (
            <b
              key={level}
              className={level <= mission.heat ? baseStyles.hotStar : ""}
            >
              ★
            </b>
          ))}
        </div>
      </div>

      <span className={styles.engineBadge}>3D physics active</span>
      <a className={styles.modeSwitch} href="?mode=2d">
        2D reference
      </a>

      <section className={baseStyles.vehicleHud} aria-label="Vehicle status">
        <div
          className={baseStyles.vehicleIdentity}
          data-vehicle-class={snapshot.vehicleClass}
        >
          <span>{mission.mode === "car" ? "Current ride" : "Parked ride"}</span>
          <strong>{snapshot.vehicleLabel}</strong>
          <small>{snapshot.vehicleTrait}</small>
        </div>
        <div className={baseStyles.speed}>
          <strong>{mission.mode === "car" ? snapshot.speedMph : "—"}</strong>
          <span>MPH</span>
        </div>
        <div className={baseStyles.health}>
          <div>
            <span>Ride integrity</span>
            <b>{Math.ceil(snapshot.vehicleHealthPercent)}%</b>
          </div>
          <div className={baseStyles.healthTrack}>
            <i
              style={{
                transform: `scaleX(${
                  Math.max(0, snapshot.vehicleHealthPercent) / 100
                })`,
              }}
            />
          </div>
        </div>
        {mission.phase === "deliver" || mission.phase === "won" ? (
          <div className={baseStyles.packageStatus}>
            <div>
              <span>Package</span>
              <b>{Math.ceil(mission.packageHealth)}%</b>
            </div>
            <div className={baseStyles.healthTrack}>
              <i
                style={{
                  transform: `scaleX(${
                    Math.max(0, mission.packageHealth) / 100
                  })`,
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {mission.arrestProgress > 0 && !terminal ? (
        <div className={baseStyles.arrest}>
          <strong>Getting boxed in</strong>
          <div>
            <i
              style={{
                transform: `scaleX(${Math.min(
                  1,
                  mission.arrestProgress / 2.35,
                )})`,
              }}
            />
          </div>
          <span>Move or get busted</span>
        </div>
      ) : null}

      {mission.escapeProgress > 0 && mission.heat > 1 && !terminal ? (
        <div className={baseStyles.escape}>
          <span>Breaking sight</span>
          <div>
            <i
              style={{
                transform: `scaleX(${Math.min(
                  1,
                  mission.escapeProgress / 5.5,
                )})`,
              }}
            />
          </div>
        </div>
      ) : null}

      {hasStarted && mission.calloutTimer > 0 && !terminal ? (
        <div className={baseStyles.callout} role="status" aria-live="polite">
          <strong>{mission.callout}</strong>
          <span>{mission.calloutDetail}</span>
        </div>
      ) : null}

      {canInteract ? (
        <div className={baseStyles.interact}>
          <kbd>E</kbd>
          <span>{snapshot.interaction}</span>
        </div>
      ) : null}

      <div className={baseStyles.desktopControls}>
        <span>
          <kbd>WASD</kbd> move
        </span>
        <span>
          <kbd>Space</kbd> drift
        </span>
        <span>
          <kbd>E</kbd> enter / exit
        </span>
        <span>
          <kbd>R</kbd> restart
        </span>
      </div>

      <div className={baseStyles.touchControls} aria-label="Touch controls">
        <div className={baseStyles.touchSteering}>
          <ControlButton
            label="Steer left"
            text="←"
            onChange={(pressed, event) =>
              setTouchControl("left", pressed, event)
            }
          />
          <ControlButton
            label="Steer right"
            text="→"
            onChange={(pressed, event) =>
              setTouchControl("right", pressed, event)
            }
          />
        </div>
        <div className={baseStyles.touchAction}>
          <ControlButton
            label="Enter or exit vehicle"
            text="E"
            onChange={(pressed, event) =>
              setTouchControl("action", pressed, event)
            }
          />
          <ControlButton
            label="Handbrake"
            text="Drift"
            wide
            onChange={(pressed, event) =>
              setTouchControl("handbrake", pressed, event)
            }
          />
        </div>
        <div className={baseStyles.touchPedals}>
          <ControlButton
            label="Brake or reverse"
            text="Brake"
            onChange={(pressed, event) =>
              setTouchControl("down", pressed, event)
            }
          />
          <ControlButton
            label="Accelerate"
            text="Gas"
            accent
            onChange={(pressed, event) => setTouchControl("up", pressed, event)}
          />
        </div>
      </div>

      {!runtimeReady && !runtimeError ? (
        <div className={styles.loading} role="status">
          <div>
            <strong>Building Bay City</strong>
            <span>Starting the 3D world and physics simulation</span>
            <i aria-hidden="true" />
          </div>
        </div>
      ) : null}

      {runtimeError ? (
        <div className={styles.runtimeError} role="alert">
          <div>
            <strong>3D engine stalled</strong>
            <span>{runtimeError}</span>
            <a className={styles.modeSwitch} href="?mode=2d">
              Open 2D reference
            </a>
          </div>
        </div>
      ) : null}

      {runtimeReady && !hasStarted ? (
        <section className={baseStyles.intro}>
          <div className={baseStyles.introCard}>
            <p className={baseStyles.eyebrow}>
              One block. Full physics. No questions.
            </p>
            <h1>
              <span>Hot</span>
              <strong>Drop</strong>
            </h1>
            <p className={baseStyles.tagline}>
              <span className={styles.dimensionNote}>Now in 3D.</span> Steal.
              Drift. Deliver.
            </p>
            <div className={baseStyles.missionBrief}>
              <span>Tonight&apos;s run</span>
              <strong>Cross-town courier · 3D vertical slice</strong>
              <p>
                Steal the Bruiser, collect the package, hit the ramps, smash
                through street props, and switch vehicles before the pursuing
                units box you in.
              </p>
            </div>
            <button className={baseStyles.startButton} onClick={beginRun}>
              <span>Start 3D run</span>
              <b>Enter</b>
            </button>
            <div className={baseStyles.introTips}>
              <span>Physics collisions</span>
              <span>Third-person camera</span>
              <span>Three vehicle classes</span>
            </div>
          </div>
          <div className={baseStyles.introNumber} aria-hidden="true">
            03
          </div>
        </section>
      ) : null}

      {terminal ? (
        <section className={baseStyles.result}>
          <div
            className={`${baseStyles.resultCard} ${
              mission.phase === "won"
                ? baseStyles.resultWon
                : baseStyles.resultLost
            }`}
          >
            <span className={baseStyles.resultKicker}>
              {mission.phase === "won" ? "Run complete" : "Run terminated"}
            </span>
            <h2>
              {mission.phase === "won"
                ? "Package delivered."
                : mission.resultReason || "Busted."}
            </h2>
            <p>
              {mission.phase === "won"
                ? "Bay City survived its first fully simulated handoff."
                : "The city keeps moving. So should you."}
            </p>
            <div className={baseStyles.finalScore}>
              <span>Final score</span>
              <strong>{mission.score.toString().padStart(6, "0")}</strong>
            </div>
            <div className={baseStyles.statGrid}>
              <Stat value={mission.stats.nearMisses} label="Near misses" />
              <Stat value={mission.stats.jumps} label="Jumps" />
              <Stat value={mission.stats.destroyed} label="Smashed" />
              <Stat value={mission.stats.escapes} label="Heat lost" />
              <Stat value={mission.stats.vehicleSwaps} label="Cars stolen" />
              <Stat value={mission.stats.cleanSwaps} label="Clean switches" />
            </div>
            <button className={baseStyles.startButton} onClick={restartRun}>
              <span>Run it back</span>
              <b>R</b>
            </button>
          </div>
        </section>
      ) : null}

      <output
        className={baseStyles.srOnly}
        data-testid="game-state-3d"
        data-phase={mission.phase}
        data-mode={mission.mode}
        data-heat={mission.heat}
        data-score={mission.score}
        data-health={Math.round(snapshot.vehicleHealthPercent)}
        data-package-health={Math.round(mission.packageHealth)}
        data-vehicle-class={snapshot.vehicleClass}
        data-police-count={snapshot.policeCount}
        data-player-y={snapshot.playerY.toFixed(2)}
        data-drifting={snapshot.drifting}
      >
        {snapshot.objective}
      </output>
    </main>
  );
}

function ControlButton({
  label,
  text,
  onChange,
  accent = false,
  wide = false,
}: {
  label: string;
  text: string;
  onChange: (
    pressed: boolean,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  accent?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`${baseStyles.touchButton} ${
        accent ? baseStyles.touchAccent : ""
      } ${wide ? baseStyles.touchWide : ""}`}
      onPointerDown={(event) => onChange(true, event)}
      onPointerUp={(event) => onChange(false, event)}
      onPointerCancel={(event) => onChange(false, event)}
      onPointerLeave={(event) => {
        if (event.buttons === 0) onChange(false, event);
      }}
    >
      {text}
    </button>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
