"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import styles from "./HotDrop.module.css";
import {
  BUILDINGS,
  CITY_BLOCKS,
  ROAD_WIDTH,
  ROAD_X,
  ROAD_Y,
  VEHICLE_PROFILES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGameState,
  getNearbyVehicle,
  objectiveForPhase,
  stepGame,
  type GameInput,
  type GameState,
  type Phase,
  type Point,
  type VehicleClass,
} from "./engine";

const EMPTY_INPUT: GameInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  handbrake: false,
  action: false,
};

interface HudState {
  phase: Phase;
  mode: GameState["mode"];
  objective: string;
  score: number;
  heat: number;
  timeLeft: number;
  speed: number;
  health: number;
  healthPercent: number;
  packageHealth: number;
  vehicleClass: VehicleClass;
  vehicleLabel: string;
  vehicleTrait: string;
  interaction: string;
  arrestProgress: number;
  escapeProgress: number;
  callout: string;
  calloutDetail: string;
  calloutTimer: number;
  resultReason: string;
  stats: GameState["stats"];
}

function snapshotGame(state: GameState): HudState {
  const profile = VEHICLE_PROFILES[state.car.vehicleClass];
  const nearbyVehicle = getNearbyVehicle(state);
  let interaction = "";

  if (state.mode === "car" && Math.abs(state.car.speed) <= 42) {
    interaction = `Exit ${profile.label}`;
  } else if (nearbyVehicle) {
    const nearbyProfile = VEHICLE_PROFILES[nearbyVehicle.vehicleClass];
    interaction =
      nearbyVehicle.source === "current"
        ? `Re-enter ${nearbyProfile.label}`
        : `Steal ${nearbyProfile.label}`;
  }

  return {
    phase: state.phase,
    mode: state.mode,
    objective: objectiveForPhase(state.phase),
    score: state.score,
    heat: state.heat,
    timeLeft: state.timeLeft,
    speed: Math.round(Math.abs(state.car.speed) * 0.48),
    health: state.car.health,
    healthPercent: (state.car.health / state.car.maxHealth) * 100,
    packageHealth: state.packageHealth,
    vehicleClass: state.car.vehicleClass,
    vehicleLabel: profile.label,
    vehicleTrait: profile.trait,
    interaction,
    arrestProgress: state.arrestProgress,
    escapeProgress: state.escapeProgress,
    callout: state.callout,
    calloutDetail: state.calloutDetail,
    calloutTimer: state.calloutTimer,
    resultReason: state.resultReason,
    stats: { ...state.stats },
  };
}

export function HotDrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(createGameState());
  const inputRef = useRef<GameInput>({ ...EMPTY_INPUT });
  const shellRef = useRef<HTMLElement>(null);
  const cameraRef = useRef({ x: 300, y: 620, shake: 0 });
  const lastHudUpdateRef = useRef(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [runNumber, setRunNumber] = useState(0);
  const [hud, setHud] = useState<HudState>(() =>
    snapshotGame(createGameState()),
  );

  const beginRun = useCallback(() => {
    gameRef.current = createGameState();
    inputRef.current = { ...EMPTY_INPUT };
    cameraRef.current = { x: 300, y: 620, shake: 0 };
    setHud(snapshotGame(gameRef.current));
    setHasStarted(true);
    setRunNumber((current) => current + 1);
    requestAnimationFrame(() => shellRef.current?.focus());
  }, []);

  useEffect(() => {
    const keyMap: Record<string, keyof GameInput | "restart"> = {
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
        if (pressed) beginRun();
        return;
      }

      inputRef.current[control] = pressed;
    };

    const handleKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const handleKeyUp = (event: KeyboardEvent) => handleKey(event, false);
    const clearInput = () => {
      inputRef.current = { ...EMPTY_INPUT };
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });
    window.addEventListener("blur", clearInput);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearInput);
    };
  }, [beginRun, hasStarted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrame = 0;
    let previousTime = performance.now();
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const frame = (time: number) => {
      const delta = Math.min((time - previousTime) / 1000, 0.04);
      previousTime = time;
      const game = gameRef.current;

      if (hasStarted) {
        stepGame(game, inputRef.current, delta);
      }

      drawGame(
        canvas,
        game,
        cameraRef.current,
        width,
        height,
        dpr,
        time,
        delta,
      );

      if (time - lastHudUpdateRef.current > 80) {
        lastHudUpdateRef.current = time;
        setHud(snapshotGame(game));
      }

      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [hasStarted, runNumber]);

  const setTouchControl = (
    control: keyof GameInput,
    pressed: boolean,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    inputRef.current[control] = pressed;
    if (pressed) event.currentTarget.setPointerCapture(event.pointerId);
  };

  const terminal = hud.phase === "won" || hud.phase === "busted";
  const canInteract = hasStarted && !terminal && Boolean(hud.interaction);

  return (
    <main
      ref={shellRef}
      className={styles.shell}
      tabIndex={-1}
      aria-label="Hot Drop game"
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Top-down city driving game"
      />

      <div className={styles.scanlines} aria-hidden="true" />

      <header className={styles.topHud}>
        <div className={styles.brand}>
          <span>Hot</span>
          <strong>Drop</strong>
          <small>Bay City · 02:17 AM</small>
        </div>

        <div className={styles.objectivePanel}>
          <span>Current move</span>
          <strong>{hud.objective}</strong>
          <div className={styles.objectiveRule} />
        </div>

        <div className={styles.scorePanel}>
          <div>
            <span>Score</span>
            <strong>{hud.score.toString().padStart(6, "0")}</strong>
          </div>
          <div>
            <span>Clock</span>
            <strong className={hud.timeLeft < 20 ? styles.dangerText : ""}>
              {formatTime(hud.timeLeft)}
            </strong>
          </div>
        </div>
      </header>

      <div className={styles.heat} aria-label={`Heat level ${hud.heat}`}>
        <span>Heat</span>
        <div>
          {[1, 2, 3].map((level) => (
            <b key={level} className={level <= hud.heat ? styles.hotStar : ""}>
              ★
            </b>
          ))}
        </div>
      </div>

      <section className={styles.vehicleHud} aria-label="Vehicle status">
        <div
          className={styles.vehicleIdentity}
          data-vehicle-class={hud.vehicleClass}
        >
          <span>{hud.mode === "car" ? "Current ride" : "Parked ride"}</span>
          <strong>{hud.vehicleLabel}</strong>
          <small>{hud.vehicleTrait}</small>
        </div>
        <div className={styles.speed}>
          <strong>{hud.mode === "car" ? hud.speed : "—"}</strong>
          <span>MPH</span>
        </div>
        <div className={styles.health}>
          <div>
            <span>Ride integrity</span>
            <b>{Math.ceil(hud.healthPercent)}%</b>
          </div>
          <div className={styles.healthTrack}>
            <i
              style={{
                transform: `scaleX(${Math.max(0, hud.healthPercent) / 100})`,
              }}
            />
          </div>
        </div>
        {hud.phase === "deliver" || hud.phase === "won" ? (
          <div className={styles.packageStatus}>
            <div>
              <span>Package</span>
              <b>{Math.ceil(hud.packageHealth)}%</b>
            </div>
            <div className={styles.healthTrack}>
              <i
                style={{
                  transform: `scaleX(${Math.max(0, hud.packageHealth) / 100})`,
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {hud.arrestProgress > 0 && !terminal ? (
        <div className={styles.arrest}>
          <strong>Getting boxed in</strong>
          <div>
            <i
              style={{
                transform: `scaleX(${Math.min(1, hud.arrestProgress / 2.35)})`,
              }}
            />
          </div>
          <span>Move or get busted</span>
        </div>
      ) : null}

      {hud.escapeProgress > 0 && hud.heat > 1 && !terminal ? (
        <div className={styles.escape}>
          <span>Breaking sight</span>
          <div>
            <i
              style={{
                transform: `scaleX(${Math.min(1, hud.escapeProgress / 5.5)})`,
              }}
            />
          </div>
        </div>
      ) : null}

      {hasStarted && hud.calloutTimer > 0 && !terminal ? (
        <div className={styles.callout} role="status" aria-live="polite">
          <strong>{hud.callout}</strong>
          <span>{hud.calloutDetail}</span>
        </div>
      ) : null}

      {canInteract ? (
        <div className={styles.interact}>
          <kbd>E</kbd>
          <span>{hud.interaction}</span>
        </div>
      ) : null}

      <div className={styles.desktopControls}>
        <span>
          <kbd>WASD</kbd> move
        </span>
        <span>
          <kbd>Space</kbd> handbrake
        </span>
        <span>
          <kbd>E</kbd> interact
        </span>
        <span>
          <kbd>R</kbd> restart
        </span>
      </div>

      <div className={styles.touchControls} aria-label="Touch controls">
        <div className={styles.touchSteering}>
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
        <div className={styles.touchAction}>
          <ControlButton
            label="Interact"
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
        <div className={styles.touchPedals}>
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

      {!hasStarted ? (
        <section className={styles.intro}>
          <div className={styles.introCard}>
            <p className={styles.eyebrow}>
              One package. One city. No questions.
            </p>
            <h1>
              <span>Hot</span>
              <strong>Drop</strong>
            </h1>
            <p className={styles.tagline}>
              Steal it. Grab it. Lose them. Deliver.
            </p>

            <div className={styles.missionBrief}>
              <span>Tonight&apos;s run</span>
              <strong>Cross-town courier</strong>
              <p>
                Take the marked ride, collect the package in East Market, then
                switch cars out of police sight and cut back to the southside
                safehouse before the city closes in.
              </p>
            </div>

            <button className={styles.startButton} onClick={beginRun}>
              <span>Start run</span>
              <b>Enter</b>
            </button>

            <div className={styles.introTips}>
              <span>Flash is fast</span>
              <span>Bruiser hits hard</span>
              <span>Lockbox protects cargo</span>
            </div>
          </div>
          <div className={styles.introNumber} aria-hidden="true">
            01
          </div>
        </section>
      ) : null}

      {terminal ? (
        <section className={styles.result}>
          <div
            className={`${styles.resultCard} ${
              hud.phase === "won" ? styles.resultWon : styles.resultLost
            }`}
          >
            <span className={styles.resultKicker}>
              {hud.phase === "won" ? "Run complete" : "Run terminated"}
            </span>
            <h2>
              {hud.phase === "won"
                ? "Package delivered."
                : hud.resultReason || "Busted."}
            </h2>
            <p>
              {hud.phase === "won"
                ? "The city never saw the handoff."
                : "The city keeps moving. So should you."}
            </p>

            <div className={styles.finalScore}>
              <span>Final score</span>
              <strong>{hud.score.toString().padStart(6, "0")}</strong>
            </div>

            <div className={styles.statGrid}>
              <div>
                <strong>{hud.stats.nearMisses}</strong>
                <span>Near misses</span>
              </div>
              <div>
                <strong>{hud.stats.jumps}</strong>
                <span>Jumps</span>
              </div>
              <div>
                <strong>{hud.stats.destroyed}</strong>
                <span>Smashed</span>
              </div>
              <div>
                <strong>{hud.stats.escapes}</strong>
                <span>Heat lost</span>
              </div>
              <div>
                <strong>{hud.stats.vehicleSwaps}</strong>
                <span>Cars stolen</span>
              </div>
              <div>
                <strong>{hud.stats.cleanSwaps}</strong>
                <span>Clean switches</span>
              </div>
            </div>

            <button className={styles.startButton} onClick={beginRun}>
              <span>Run it back</span>
              <b>R</b>
            </button>
          </div>
        </section>
      ) : null}

      <output
        className={styles.srOnly}
        data-testid="game-state"
        data-phase={hud.phase}
        data-mode={hud.mode}
        data-heat={hud.heat}
        data-score={hud.score}
        data-health={Math.round(hud.health)}
        data-package-health={Math.round(hud.packageHealth)}
        data-vehicle-class={hud.vehicleClass}
      >
        {hud.objective}
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
      className={`${styles.touchButton} ${accent ? styles.touchAccent : ""} ${
        wide ? styles.touchWide : ""
      }`}
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

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function drawGame(
  canvas: HTMLCanvasElement,
  game: GameState,
  camera: { x: number; y: number; shake: number },
  width: number,
  height: number,
  dpr: number,
  time: number,
  dt: number,
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const target = game.mode === "car" ? game.car : game.foot;
  const cameraEase = 1 - Math.pow(0.001, dt);
  camera.x += (target.x - camera.x) * cameraEase;
  camera.y += (target.y - camera.y) * cameraEase;
  camera.shake = Math.max(camera.shake * 0.84, game.impactFlash * 18);

  const shakeX = Math.sin(time * 0.091) * camera.shake;
  const shakeY = Math.cos(time * 0.073) * camera.shake;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#111613";
  context.fillRect(0, 0, width, height);
  context.save();
  context.translate(
    width / 2 - camera.x + shakeX,
    height / 2 - camera.y + shakeY,
  );

  drawCity(context, time);
  drawRoute(context, game, time);
  drawMissionMarkers(context, game, time);
  drawBreakables(context, game);
  drawRamps(context, game);

  for (const traffic of game.traffic) {
    drawCar(context, traffic, traffic.color, "traffic", time);
  }

  for (const cop of game.cops) {
    drawCar(context, cop, "#e9efe8", "police", time);
  }

  if (game.mode === "foot") {
    drawPlayerOnFoot(context, game.foot, time);
    drawCar(context, game.car, game.car.color, "player", time);
  } else {
    drawCar(context, game.car, game.car.color, "player", time, game.jumpTimer);
  }

  context.restore();
  drawMinimap(context, game, width, height, time);

  if (game.impactFlash > 0) {
    context.fillStyle = `rgba(255, 80, 35, ${game.impactFlash * 0.75})`;
    context.fillRect(0, 0, width, height);
  }
}

const BUILDING_COLORS = [
  "#e36b3f",
  "#d5ab4d",
  "#4f8d83",
  "#c7c6ad",
  "#b7534f",
  "#6c7d6f",
];

function drawCity(context: CanvasRenderingContext2D, time: number) {
  context.fillStyle = "#6e735c";
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  for (const [x1, x2] of CITY_BLOCKS.x) {
    for (const [y1, y2] of CITY_BLOCKS.y) {
      const alley = x2 - x1 > 220 && y2 - y1 > 220 ? 58 : 34;
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      context.fillStyle = "#343b35";
      context.fillRect(centerX - alley / 2, y1, alley, y2 - y1);
      context.fillRect(x1, centerY - alley / 2, x2 - x1, alley);
      context.strokeStyle = "rgba(236, 216, 166, 0.22)";
      context.lineWidth = 2;
      context.setLineDash([9, 13]);
      context.beginPath();
      context.moveTo(centerX, y1);
      context.lineTo(centerX, y2);
      context.moveTo(x1, centerY);
      context.lineTo(x2, centerY);
      context.stroke();
      context.setLineDash([]);
    }
  }

  context.fillStyle = "#27302f";
  for (const x of ROAD_X) {
    context.fillRect(x - ROAD_WIDTH / 2, 0, ROAD_WIDTH, WORLD_HEIGHT);
  }
  for (const y of ROAD_Y) {
    context.fillRect(0, y - ROAD_WIDTH / 2, WORLD_WIDTH, ROAD_WIDTH);
  }

  context.strokeStyle = "rgba(235, 221, 176, 0.28)";
  context.lineWidth = 3;
  context.setLineDash([28, 26]);
  for (const x of ROAD_X) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, WORLD_HEIGHT);
    context.stroke();
  }
  for (const y of ROAD_Y) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WORLD_WIDTH, y);
    context.stroke();
  }
  context.setLineDash([]);

  context.strokeStyle = "rgba(13, 16, 15, 0.4)";
  context.lineWidth = 5;
  for (const x of ROAD_X) {
    context.beginPath();
    context.moveTo(x - ROAD_WIDTH / 2, 0);
    context.lineTo(x - ROAD_WIDTH / 2, WORLD_HEIGHT);
    context.moveTo(x + ROAD_WIDTH / 2, 0);
    context.lineTo(x + ROAD_WIDTH / 2, WORLD_HEIGHT);
    context.stroke();
  }
  for (const y of ROAD_Y) {
    context.beginPath();
    context.moveTo(0, y - ROAD_WIDTH / 2);
    context.lineTo(WORLD_WIDTH, y - ROAD_WIDTH / 2);
    context.moveTo(0, y + ROAD_WIDTH / 2);
    context.lineTo(WORLD_WIDTH, y + ROAD_WIDTH / 2);
    context.stroke();
  }

  for (const building of BUILDINGS) {
    const color = BUILDING_COLORS[building.id % BUILDING_COLORS.length];
    context.fillStyle = "rgba(13, 18, 15, 0.34)";
    context.fillRect(
      building.x + 9,
      building.y + 12,
      building.width,
      building.height,
    );
    context.fillStyle = color;
    context.fillRect(building.x, building.y, building.width, building.height);
    context.fillStyle = "rgba(255, 245, 211, 0.11)";
    context.fillRect(
      building.x + 7,
      building.y + 7,
      Math.max(0, building.width - 14),
      5,
    );
    context.fillStyle = "rgba(23, 29, 27, 0.42)";
    const roofWidth = Math.min(38, building.width * 0.36);
    const roofHeight = Math.min(24, building.height * 0.28);
    context.fillRect(
      building.x + building.width / 2 - roofWidth / 2,
      building.y + building.height / 2 - roofHeight / 2,
      roofWidth,
      roofHeight,
    );
  }

  drawTrees(context, time);

  context.strokeStyle = "rgba(242, 221, 164, 0.38)";
  context.lineWidth = 8;
  context.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

function drawTrees(context: CanvasRenderingContext2D, time: number) {
  const trees = [
    [470, 460],
    [720, 730],
    [1090, 520],
    [1300, 720],
    [1710, 520],
    [1900, 730],
    [490, 1110],
    [730, 1280],
    [1090, 1100],
    [1290, 1280],
    [1710, 1100],
    [1900, 1280],
    [1100, 1680],
    [1700, 1680],
    [2280, 1680],
  ];
  const sway = Math.sin(time * 0.0018) * 1.5;

  for (const [x, y] of trees) {
    context.fillStyle = "rgba(15, 22, 17, 0.28)";
    context.beginPath();
    context.arc(x + 5, y + 7, 17, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#274e35";
    context.beginPath();
    context.arc(x + sway, y, 15, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#3f7048";
    context.beginPath();
    context.arc(x - 5 + sway, y - 5, 9, 0, Math.PI * 2);
    context.fill();
  }
}

function drawRoute(
  context: CanvasRenderingContext2D,
  game: GameState,
  time: number,
) {
  if (game.phase === "won" || game.phase === "busted") return;
  const from = game.mode === "car" ? game.car : game.foot;
  const target =
    game.phase === "findCar"
      ? game.car
      : game.phase === "pickup"
        ? game.packagePosition
        : game.deliveryPosition;
  const offset = (time * 0.035) % 28;

  context.save();
  context.strokeStyle =
    game.phase === "deliver"
      ? "rgba(207, 255, 78, 0.34)"
      : "rgba(255, 199, 73, 0.3)";
  context.lineWidth = 5;
  context.setLineDash([10, 18]);
  context.lineDashOffset = -offset;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(target.x, target.y);
  context.stroke();
  context.restore();
}

function drawMissionMarkers(
  context: CanvasRenderingContext2D,
  game: GameState,
  time: number,
) {
  const pulse = 1 + Math.sin(time * 0.005) * 0.12;

  if (game.phase === "findCar") {
    drawMarkerRing(context, game.car, "#ffc84a", pulse);
    context.fillStyle = "#ffc84a";
    context.font = "900 14px Arial";
    context.textAlign = "center";
    context.fillText("RIDE", game.car.x, game.car.y - 52);
  }

  if (game.phase === "pickup") {
    drawMarkerRing(context, game.packagePosition, "#ffc84a", pulse);
    context.save();
    context.translate(game.packagePosition.x, game.packagePosition.y);
    context.rotate(Math.PI / 4);
    context.fillStyle = "#ffc84a";
    context.fillRect(-14, -14, 28, 28);
    context.strokeStyle = "#fff4c8";
    context.lineWidth = 3;
    context.strokeRect(-10, -10, 20, 20);
    context.restore();
  }

  if (game.phase === "deliver") {
    drawMarkerRing(context, game.deliveryPosition, "#cfff4e", pulse);
    context.save();
    context.translate(game.deliveryPosition.x, game.deliveryPosition.y);
    context.rotate(time * 0.00055);
    for (let index = 0; index < 8; index += 1) {
      context.fillStyle = index % 2 === 0 ? "#cfff4e" : "#182019";
      context.rotate(Math.PI / 4);
      context.fillRect(18, -7, 18, 14);
    }
    context.restore();
  }
}

function drawMarkerRing(
  context: CanvasRenderingContext2D,
  point: Point,
  color: string,
  pulse: number,
) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 5;
  context.globalAlpha = 0.88;
  context.beginPath();
  context.arc(point.x, point.y, 42 * pulse, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 0.12;
  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, 52 * pulse, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawBreakables(context: CanvasRenderingContext2D, game: GameState) {
  for (const item of game.breakables) {
    if (!item.alive) continue;
    context.save();
    context.translate(item.x, item.y);
    if (item.kind === "cone") {
      context.fillStyle = "#f17035";
      context.beginPath();
      context.moveTo(0, -11);
      context.lineTo(9, 10);
      context.lineTo(-9, 10);
      context.closePath();
      context.fill();
      context.fillStyle = "#f5e4b6";
      context.fillRect(-6, 2, 12, 3);
    } else if (item.kind === "crate") {
      context.fillStyle = "#9a6942";
      context.fillRect(-12, -12, 24, 24);
      context.strokeStyle = "#d7a361";
      context.lineWidth = 3;
      context.strokeRect(-10, -10, 20, 20);
      context.beginPath();
      context.moveTo(-9, -9);
      context.lineTo(9, 9);
      context.moveTo(9, -9);
      context.lineTo(-9, 9);
      context.stroke();
    } else {
      context.fillStyle = "#d94335";
      context.fillRect(-7, -12, 14, 24);
      context.fillRect(-12, -7, 24, 6);
      context.fillStyle = "#f3b640";
      context.fillRect(-8, -2, 16, 4);
    }
    context.restore();
  }
}

function drawRamps(context: CanvasRenderingContext2D, game: GameState) {
  for (const ramp of game.ramps) {
    context.save();
    context.translate(ramp.x, ramp.y);
    context.rotate(ramp.angle);
    context.fillStyle = "#a64d37";
    context.beginPath();
    context.moveTo(-28, 22);
    context.lineTo(28, 22);
    context.lineTo(19, -22);
    context.lineTo(-19, -22);
    context.closePath();
    context.fill();
    context.strokeStyle = "#f0c34f";
    context.lineWidth = 4;
    for (let x = -17; x <= 17; x += 17) {
      context.beginPath();
      context.moveTo(x, 17);
      context.lineTo(x * 0.7, -17);
      context.stroke();
    }
    context.restore();
  }
}

function drawCar(
  context: CanvasRenderingContext2D,
  car: Point & {
    angle: number;
    speed?: number;
    vehicleClass?: VehicleClass;
  },
  color: string,
  kind: "player" | "police" | "traffic",
  time: number,
  jumpTimer = 0,
) {
  const profile = car.vehicleClass ? VEHICLE_PROFILES[car.vehicleClass] : null;
  const bodyLength = kind === "police" ? 56 : (profile?.bodyLength ?? 56);
  const bodyWidth = kind === "police" ? 28 : (profile?.bodyWidth ?? 28);
  const halfLength = bodyLength / 2;
  const halfWidth = bodyWidth / 2;
  const wheelX = halfLength - 13;
  const jumpProgress =
    jumpTimer > 0
      ? Math.sin(Math.min(1, Math.max(0, 1 - jumpTimer / 0.84)) * Math.PI)
      : 0;
  const scale = 1 + jumpProgress * 0.16;

  context.save();
  context.translate(car.x + 7, car.y + 9);
  context.rotate(car.angle);
  context.globalAlpha = jumpTimer > 0 ? 0.3 : 0.38;
  context.fillStyle = "#101310";
  context.beginPath();
  context.roundRect(-halfLength + 1, -halfWidth, bodyLength + 2, bodyWidth, 7);
  context.fill();
  context.restore();

  context.save();
  context.translate(car.x, car.y - jumpProgress * 13);
  context.rotate(car.angle);
  context.scale(scale, scale);

  context.fillStyle = "#151817";
  context.fillRect(-wheelX, -halfWidth - 3, 10, 4);
  context.fillRect(wheelX - 10, -halfWidth - 3, 10, 4);
  context.fillRect(-wheelX, halfWidth - 1, 10, 4);
  context.fillRect(wheelX - 10, halfWidth - 1, 10, 4);

  context.fillStyle = color;
  context.beginPath();
  context.roundRect(
    -halfLength,
    -halfWidth,
    bodyLength,
    bodyWidth,
    car.vehicleClass === "van" ? 5 : 8,
  );
  context.fill();

  if (kind === "police") {
    context.fillStyle = "#1c2422";
    context.fillRect(-7, -halfWidth, 17, bodyWidth);
    context.fillStyle = Math.sin(time * 0.018) > 0 ? "#ff4138" : "#418dff";
    context.fillRect(-3, -halfWidth - 2, 9, 4);
    context.fillStyle = "#161b1a";
    context.font = "900 8px Arial";
    context.textAlign = "center";
    context.fillText("BCPD", 1, 3);
  } else {
    context.fillStyle = kind === "player" ? "#27322f" : "#263230";
    context.beginPath();
    const cabinStart = car.vehicleClass === "van" ? -12 : -8;
    const cabinLength = car.vehicleClass === "van" ? 32 : 22;
    context.roundRect(
      cabinStart,
      -halfWidth + 3,
      cabinLength,
      bodyWidth - 6,
      4,
    );
    context.fill();
    context.fillStyle = "rgba(174, 222, 218, 0.7)";
    context.fillRect(cabinStart + 3, -halfWidth + 5, 7, bodyWidth - 10);
    if (car.vehicleClass) {
      context.fillStyle = "rgba(255, 244, 207, 0.82)";
      context.font = "900 8px Arial";
      context.textAlign = "center";
      context.fillText(car.vehicleClass[0].toUpperCase(), 9, 3);
    }
  }

  context.fillStyle = "#ffe3a2";
  context.fillRect(halfLength - 5, -halfWidth + 4, 4, 7);
  context.fillRect(halfLength - 5, halfWidth - 11, 4, 7);
  context.fillStyle = "#d84036";
  context.fillRect(-halfLength + 1, -halfWidth + 4, 4, 6);
  context.fillRect(-halfLength + 1, halfWidth - 10, 4, 6);

  if (kind === "player") {
    context.strokeStyle = "#fff5d5";
    context.lineWidth = 2;
    context.strokeRect(
      -halfLength - 1,
      -halfWidth - 1,
      bodyLength + 2,
      bodyWidth + 2,
    );
  }
  context.restore();
}

function drawPlayerOnFoot(
  context: CanvasRenderingContext2D,
  foot: Point,
  time: number,
) {
  context.save();
  context.translate(foot.x, foot.y);
  const bob = Math.sin(time * 0.01) * 1.5;
  context.fillStyle = "rgba(12, 16, 13, 0.35)";
  context.beginPath();
  context.ellipse(3, 10, 13, 7, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#cfff4e";
  context.beginPath();
  context.arc(0, bob, 11, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#1b241e";
  context.beginPath();
  context.moveTo(7, bob);
  context.lineTo(18, bob - 5);
  context.lineTo(18, bob + 5);
  context.closePath();
  context.fill();
  context.restore();
}

function drawMinimap(
  context: CanvasRenderingContext2D,
  game: GameState,
  width: number,
  height: number,
  time: number,
) {
  if (width < 720 || height < 520) return;
  const mapWidth = 172;
  const mapHeight = 126;
  const x = width - mapWidth - 28;
  const y = height - mapHeight - 32;
  const scaleX = mapWidth / WORLD_WIDTH;
  const scaleY = mapHeight / WORLD_HEIGHT;

  context.save();
  context.fillStyle = "rgba(12, 17, 14, 0.84)";
  context.fillRect(x - 8, y - 8, mapWidth + 16, mapHeight + 16);
  context.fillStyle = "#52604d";
  context.fillRect(x, y, mapWidth, mapHeight);
  context.fillStyle = "#232d2b";
  for (const roadX of ROAD_X) {
    context.fillRect(
      x + (roadX - ROAD_WIDTH / 2) * scaleX,
      y,
      ROAD_WIDTH * scaleX,
      mapHeight,
    );
  }
  for (const roadY of ROAD_Y) {
    context.fillRect(
      x,
      y + (roadY - ROAD_WIDTH / 2) * scaleY,
      mapWidth,
      ROAD_WIDTH * scaleY,
    );
  }

  const player = game.mode === "car" ? game.car : game.foot;
  drawMapDot(context, x, y, scaleX, scaleY, player, "#f26b43", 4.5);

  if (game.phase === "findCar") {
    drawMapDot(context, x, y, scaleX, scaleY, game.car, "#ffc84a", 4);
  } else if (game.phase === "pickup") {
    drawMapDot(
      context,
      x,
      y,
      scaleX,
      scaleY,
      game.packagePosition,
      "#ffc84a",
      4 + Math.sin(time * 0.006),
    );
  } else if (game.phase === "deliver") {
    drawMapDot(
      context,
      x,
      y,
      scaleX,
      scaleY,
      game.deliveryPosition,
      "#cfff4e",
      4 + Math.sin(time * 0.006),
    );
  }

  for (const cop of game.cops) {
    drawMapDot(context, x, y, scaleX, scaleY, cop, "#4d8dff", 2.6);
  }

  context.strokeStyle = "rgba(239, 224, 178, 0.5)";
  context.lineWidth = 1;
  context.strokeRect(x, y, mapWidth, mapHeight);
  context.restore();
}

function drawMapDot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  point: Point,
  color: string,
  radius: number,
) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(
    x + point.x * scaleX,
    y + point.y * scaleY,
    radius,
    0,
    Math.PI * 2,
  );
  context.fill();
}
