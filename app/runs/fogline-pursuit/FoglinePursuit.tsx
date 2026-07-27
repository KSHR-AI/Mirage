"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FoglineScene, objectiveProgressLabel } from "./scene";
import {
  createFoglineState,
  currentObjective,
  navigationCue,
  nearestCopDistance,
  objectiveDistance,
  stepFogline,
  type DriveInput,
} from "./simulation";
import styles from "./FoglinePursuit.module.css";

type InputFlags = {
  forward: boolean;
  reverse: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
};

const EMPTY_INPUT: InputFlags = {
  forward: false,
  reverse: false,
  left: false,
  right: false,
  handbrake: false,
};

export function FoglinePursuit({ autoStart = false }: { autoStart?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<FoglineScene | null>(null);
  const [snapshot, setSnapshot] = useState(createFoglineState);
  const simulationRef = useRef(snapshot);
  const inputRef = useRef<InputFlags>({ ...EMPTY_INPUT });
  const releaseTimersRef = useRef<
    Partial<Record<keyof InputFlags, ReturnType<typeof setTimeout>>>
  >({});
  const startedRef = useRef(false);
  const [started, setStarted] = useState(autoStart);

  const restart = useCallback((beginImmediately = true) => {
    simulationRef.current = createFoglineState();
    inputRef.current = { ...EMPTY_INPUT };
    startedRef.current = beginImmediately;
    setStarted(beginImmediately);
    setSnapshot(simulationRef.current);
  }, []);

  const begin = useCallback(() => {
    startedRef.current = true;
    setStarted(true);
  }, []);

  const setTouchControl = useCallback(
    (control: keyof InputFlags, value: boolean) => {
      inputRef.current[control] = value;
    },
    [],
  );

  useEffect(() => {
    startedRef.current = autoStart;
  }, [autoStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new FoglineScene(canvas);
    sceneRef.current = scene;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      scene.resize(bounds.width, bounds.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    let lastHudUpdate = 0;

    const animate = (time: number) => {
      const elapsed = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      if (startedRef.current) {
        accumulator += elapsed;
        while (accumulator >= 1 / 60) {
          simulationRef.current = stepFogline(
            simulationRef.current,
            readDriveInput(inputRef.current),
            1 / 60,
          );
          accumulator -= 1 / 60;
        }
      }
      scene.render(simulationRef.current, time / 1000);
      if (time - lastHudUpdate > 80) {
        setSnapshot(simulationRef.current);
        lastHudUpdate = time;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const control = keyToControl(event.key);
      if (control) {
        event.preventDefault();
        clearTimeout(releaseTimersRef.current[control]);
        inputRef.current[control] = true;
      }
      if (event.key === "Enter" && !startedRef.current) {
        event.preventDefault();
        begin();
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        restart(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const control = keyToControl(event.key);
      if (control) {
        event.preventDefault();
        clearTimeout(releaseTimersRef.current[control]);
        releaseTimersRef.current[control] = setTimeout(() => {
          inputRef.current[control] = false;
        }, 70);
      }
    };
    const clear = () => {
      for (const timer of Object.values(releaseTimersRef.current)) {
        clearTimeout(timer);
      }
      releaseTimersRef.current = {};
      inputRef.current = { ...EMPTY_INPUT };
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [begin, restart]);

  const objective = currentObjective(snapshot);
  const navigation = navigationCue(snapshot);
  const distance = objectiveDistance(snapshot);
  const copDistance = nearestCopDistance(snapshot);
  const terminal = snapshot.phase === "won" || snapshot.phase === "busted";

  return (
    <main
      className={styles.shell}
      data-fullscreen-game
      data-run-phase={snapshot.phase}
      aria-label="Fogline Pursuit 3D driving game"
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="A third-person car driving through San Francisco streets"
      />
      <div className={styles.cinematicBars} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <header className={styles.hudTop}>
        <div className={styles.identity}>
          <span>Mirage independent build</span>
          <strong>FOGLINE / 101</strong>
          <small>San Francisco · 05:41</small>
        </div>

        <section
          className={styles.objective}
          data-navigation-bearing={navigation.bearing.toFixed(4)}
          data-objective-distance={distance.toFixed(1)}
        >
          <div className={styles.objectiveMeta}>
            <span>
              {terminal
                ? "Run complete"
                : `Move ${objectiveProgressLabel(snapshot)} · ${objective.shortLabel}`}
            </span>
            {!terminal ? <b>{Math.round(distance)}m</b> : null}
          </div>
          <strong>
            {snapshot.phase === "won"
              ? "City lost the signal"
              : snapshot.phase === "busted"
                ? "SFPD closed the run"
                : objective.label}
          </strong>
          {!terminal ? (
            <div className={styles.direction}>
              <i
                aria-hidden="true"
                style={{ transform: `rotate(${navigation.bearing}rad)` }}
              >
                ▲
              </i>
              <span>{navigation.instruction}</span>
            </div>
          ) : null}
        </section>

        <div className={styles.telemetry}>
          <span>Heat</span>
          <div
            className={styles.heat}
            aria-label={`Heat ${snapshot.heat} of 5`}
          >
            {Array.from({ length: 5 }, (_, index) => (
              <i
                key={index}
                data-active={index < snapshot.heat ? "true" : undefined}
              />
            ))}
          </div>
          <strong>{formatTime(snapshot.timeLeft)}</strong>
        </div>
      </header>

      <aside className={styles.speedometer} aria-label="Vehicle status">
        <div>
          <b>{Math.round(Math.abs(snapshot.player.speed) * 2.237)}</b>
          <span>MPH</span>
        </div>
        <small>Integrity</small>
        <div className={styles.integrity}>
          <i style={{ width: `${snapshot.player.integrity}%` }} />
        </div>
      </aside>

      <aside className={styles.pursuit}>
        <span>SFPD net</span>
        <strong>
          {Number.isFinite(copDistance) ? `${Math.round(copDistance)}m` : "—"}
        </strong>
        <small>{pursuitHint(copDistance)}</small>
      </aside>

      <div className={styles.score}>
        <span>Take</span>
        <strong>${snapshot.score.toLocaleString("en-US")}</strong>
        {snapshot.driftChain > 0.35 ? (
          <small>Drift chain {snapshot.driftChain.toFixed(1)}s</small>
        ) : null}
      </div>

      {snapshot.messageTime > 0 && started && !terminal ? (
        <div className={styles.callout} role="status" aria-live="polite">
          {snapshot.message}
        </div>
      ) : null}

      <div className={styles.controls}>
        <span>WASD / arrows</span>
        <span>Space · handbrake</span>
        <span>R · restart</span>
      </div>

      <TouchControls onControl={setTouchControl} />

      {!started ? (
        <section className={styles.intro}>
          <div className={styles.introRule} />
          <p>Mirage clean-room model run</p>
          <h1>
            <span>Fogline</span>
            <strong>Pursuit</strong>
          </h1>
          <div className={styles.introCopy}>
            <b>Own the hill.</b>
            <span>Lose the tail.</span>
          </div>
          <button type="button" onClick={begin}>
            <span>Start getaway</span>
            <b>Enter</b>
          </button>
          <small>
            One car · Three moves · Every patrol car wants the package
          </small>
        </section>
      ) : null}

      {terminal ? (
        <section className={styles.outcome} data-result={snapshot.phase}>
          <span>{snapshot.phase === "won" ? "Signal lost" : "Run closed"}</span>
          <h2>{snapshot.phase === "won" ? "CLEAR" : "BUSTED"}</h2>
          <p>{snapshot.message}</p>
          <dl>
            <div>
              <dt>Take</dt>
              <dd>${snapshot.score.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Drift</dt>
              <dd>{Math.round(snapshot.driftScore)}</dd>
            </div>
            <div>
              <dt>Time left</dt>
              <dd>{formatTime(snapshot.timeLeft)}</dd>
            </div>
          </dl>
          <button type="button" onClick={() => restart(true)}>
            Run it again <b>R</b>
          </button>
        </section>
      ) : null}
    </main>
  );
}

function TouchControls({
  onControl,
}: {
  onControl: (control: keyof InputFlags, value: boolean) => void;
}) {
  const setControl = (
    control: keyof InputFlags,
    value: boolean,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    onControl(control, value);
    if (value) event.currentTarget.setPointerCapture(event.pointerId);
  };

  const buttonProps = (control: keyof InputFlags) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) =>
      setControl(control, true, event),
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) =>
      setControl(control, false, event),
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) =>
      setControl(control, false, event),
    onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) =>
      setControl(control, false, event),
  });

  return (
    <div className={styles.touchControls}>
      <div>
        <button type="button" aria-label="Steer left" {...buttonProps("left")}>
          ←
        </button>
        <button
          type="button"
          aria-label="Steer right"
          {...buttonProps("right")}
        >
          →
        </button>
      </div>
      <button
        className={styles.handbrake}
        type="button"
        aria-label="Handbrake"
        {...buttonProps("handbrake")}
      >
        Drift
      </button>
      <div>
        <button
          type="button"
          aria-label="Brake or reverse"
          {...buttonProps("reverse")}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label="Accelerate"
          {...buttonProps("forward")}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

function readDriveInput(flags: InputFlags): DriveInput {
  return {
    throttle: Number(flags.forward) - Number(flags.reverse),
    steer: Number(flags.right) - Number(flags.left),
    handbrake: flags.handbrake,
  };
}

function keyToControl(key: string): keyof InputFlags | null {
  switch (key.toLowerCase()) {
    case "w":
    case "arrowup":
      return "forward";
    case "s":
    case "arrowdown":
      return "reverse";
    case "a":
    case "arrowleft":
      return "left";
    case "d":
    case "arrowright":
      return "right";
    case " ":
      return "handbrake";
    default:
      return null;
  }
}

function pursuitHint(distance: number) {
  if (!Number.isFinite(distance)) return "No units";
  if (distance < 8) return "Impact range";
  if (distance < 22) return "Closing fast";
  if (distance < 48) return "Visual contact";
  return "Searching";
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0")}:${(safeSeconds % 60).toString().padStart(2, "0")}`;
}
