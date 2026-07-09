"use client";

import { Canvas } from "@react-three/fiber";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CarFront,
  CircleStop,
  Gauge,
  Info,
  LogOut,
  MoveUp,
  Play,
  RotateCcw,
  Star,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";
import {
  BayCityScene,
  type ControlState,
  type GameMode,
  type Telemetry,
} from "./BayCityScene";
import { MISSIONS, ROAD_LINES } from "./bay-city-data";

const EMPTY_CONTROLS: ControlState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
  brake: false,
  jump: false,
  action: false,
  lookDeltaX: 0,
  lookDeltaY: 0,
};

const INITIAL_TELEMETRY: Telemetry = {
  x: 10,
  z: 74,
  speed: 0,
  location: "SoMa",
  nearVehicle: true,
  mode: "foot",
};

function track(event: string, value?: string) {
  const payload = JSON.stringify({ event, value });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
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

function useBayAudio(muted: boolean, speed: number, wanted: number) {
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const engineRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);
  const sirenRef = useRef<OscillatorNode | null>(null);
  const sirenGainRef = useRef<GainNode | null>(null);

  const start = useCallback(() => {
    if (contextRef.current) {
      void contextRef.current.resume();
      return;
    }

    const context = new AudioContext();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.value = muted ? 0 : 0.16;
    master.connect(compressor).connect(context.destination);

    const engine = context.createOscillator();
    const engineFilter = context.createBiquadFilter();
    const engineGain = context.createGain();
    engine.type = "sawtooth";
    engine.frequency.value = 42;
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 240;
    engineGain.gain.value = 0.015;
    engine.connect(engineFilter).connect(engineGain).connect(master);
    engine.start();

    const siren = context.createOscillator();
    const sirenGain = context.createGain();
    siren.type = "triangle";
    siren.frequency.value = 560;
    sirenGain.gain.value = 0;
    siren.connect(sirenGain).connect(master);
    siren.start();

    contextRef.current = context;
    masterRef.current = master;
    engineRef.current = engine;
    engineGainRef.current = engineGain;
    sirenRef.current = siren;
    sirenGainRef.current = sirenGain;
  }, [muted]);

  const sting = useCallback((frequency = 520) => {
    const context = contextRef.current;
    const master = masterRef.current;
    if (!context || !master || muted) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.65, context.currentTime + 0.36);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
    oscillator.connect(gain).connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.6);
  }, [muted]);

  useEffect(() => {
    const context = contextRef.current;
    const engine = engineRef.current;
    const gain = engineGainRef.current;
    if (!context || !engine || !gain) return;
    engine.frequency.setTargetAtTime(42 + Math.min(190, speed * 2.4), context.currentTime, 0.06);
    gain.gain.setTargetAtTime(0.012 + Math.min(0.055, speed / 1800), context.currentTime, 0.08);
  }, [speed]);

  useEffect(() => {
    const context = contextRef.current;
    const siren = sirenRef.current;
    const gain = sirenGainRef.current;
    if (!context || !siren || !gain) return;
    const now = context.currentTime;
    gain.gain.setTargetAtTime(wanted > 0 && !muted ? 0.02 + wanted * 0.01 : 0, now, 0.12);
    siren.frequency.setValueAtTime(520, now);
    siren.frequency.linearRampToValueAtTime(780, now + 0.42);
    siren.frequency.linearRampToValueAtTime(520, now + 0.84);
  }, [muted, wanted, speed]);

  useEffect(() => {
    const context = contextRef.current;
    const master = masterRef.current;
    if (!context || !master) return;
    master.gain.setTargetAtTime(muted ? 0 : 0.16, context.currentTime, 0.06);
  }, [muted]);

  useEffect(
    () => () => {
      engineRef.current?.stop();
      sirenRef.current?.stop();
      void contextRef.current?.close();
    },
    [],
  );

  return { start, sting };
}

export function BayCityGame() {
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [mode, setMode] = useState<GameMode>("foot");
  const [missionIndex, setMissionIndex] = useState(0);
  const [cash, setCash] = useState(0);
  const [health, setHealth] = useState(100);
  const [muted, setMuted] = useState(false);
  const [touch, setTouch] = useState(false);
  const [showVision, setShowVision] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [notification, setNotification] = useState("World 01 is live.");
  const [telemetry, setTelemetry] = useState<Telemetry>(INITIAL_TELEMETRY);
  const controlsRef = useRef<ControlState>({ ...EMPTY_CONTROLS });
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const completedMissionsRef = useRef(new Set<number>());
  const wanted = completed ? 0 : (MISSIONS[missionIndex]?.wanted ?? 0);
  const currentMission = MISSIONS[missionIndex];
  const { start: startAudio, sting } = useBayAudio(muted, telemetry.speed, wanted);

  useEffect(() => {
    document.body.classList.add("bay-city-active");
    setTouch(
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 760,
    );
    return () => document.body.classList.remove("bay-city-active");
  }, []);

  useEffect(() => {
    const releaseTimers = new Map<string, number>();
    const setKey = (event: KeyboardEvent, value: boolean) => {
      if (event.code === "KeyW" || event.code === "ArrowUp") controlsRef.current.forward = value;
      if (event.code === "KeyS" || event.code === "ArrowDown") controlsRef.current.back = value;
      if (event.code === "KeyA" || event.code === "ArrowLeft") controlsRef.current.left = value;
      if (event.code === "KeyD" || event.code === "ArrowRight") controlsRef.current.right = value;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") controlsRef.current.sprint = value;
      if (event.code === "Space") {
        event.preventDefault();
        controlsRef.current.brake = value;
        controlsRef.current.jump = value;
      }
      if (event.code === "KeyE" && value) controlsRef.current.action = true;
    };
    const keyDown = (event: KeyboardEvent) => {
      const timer = releaseTimers.get(event.code);
      if (timer !== undefined) window.clearTimeout(timer);
      releaseTimers.delete(event.code);
      setKey(event, true);
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyE") return;
      const timer = window.setTimeout(() => {
        setKey(event, false);
        releaseTimers.delete(event.code);
      }, 90);
      releaseTimers.set(event.code, timer);
    };
    const reset = () => {
      controlsRef.current = { ...EMPTY_CONTROLS };
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", reset);
      releaseTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const begin = useCallback(() => {
    startAudio();
    setStarted(true);
    setNotification("The Bay Job started.");
    track("bay_city_started");
  }, [startAudio]);

  const restart = useCallback(() => {
    controlsRef.current = { ...EMPTY_CONTROLS };
    setMode("foot");
    setMissionIndex(0);
    setCash(0);
    setHealth(100);
    setCompleted(false);
    completedMissionsRef.current.clear();
    setNotification("A new run is live.");
    setTelemetry(INITIAL_TELEMETRY);
    setSceneKey((value) => value + 1);
    startAudio();
    track("bay_city_restarted");
  }, [startAudio]);

  const completeMission = useCallback(
    (index: number) => {
      if (completedMissionsRef.current.has(index)) return;
      const mission = MISSIONS[index];
      if (!mission) return;
      completedMissionsRef.current.add(index);
      setCash((value) => value + mission.reward);
      setHealth((value) => Math.min(100, value + 25));
      sting(510 + index * 75);
      track("bay_city_mission", mission.id);

      if (index === MISSIONS.length - 1) {
        setMissionIndex(MISSIONS.length);
        setCompleted(true);
        setNotification("Afterlight complete.");
        track("bay_city_completed");
        return;
      }

      const next = MISSIONS[index + 1];
      setMissionIndex(index + 1);
      setNotification(next ? `${next.chapter}: ${next.location}` : "Signal complete.");
    },
    [sting],
  );

  const damage = useCallback((amount: number) => {
    setNotification("Impact detected.");
    setHealth((current) => Math.max(8, current - amount));
  }, []);

  const beginLook = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!started || completed || showVision) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    },
    [completed, showVision, started],
  );

  const updateLook = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    controlsRef.current.lookDeltaX += event.clientX - pointer.x;
    controlsRef.current.lookDeltaY += event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }, []);

  const endLook = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current?.id === event.pointerId) pointerRef.current = null;
  }, []);

  const paused = !started || completed || showVision;

  return (
    <main
      className="bay-city-shell"
      data-mode={mode}
      data-player-x={telemetry.x.toFixed(2)}
      data-player-z={telemetry.z.toFixed(2)}
      data-speed={telemetry.speed.toFixed(2)}
    >
      <div className="bay-city-canvas" aria-hidden="true">
        <Canvas
          key={sceneKey}
          camera={{ far: 520, fov: 58, near: 0.1, position: [8, 7, 84] }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.domElement.id = "bay-city-renderer";
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.12;
          }}
          shadows={{ type: THREE.PCFShadowMap }}
        >
          <Suspense fallback={null}>
            <BayCityScene
              controlsRef={controlsRef}
              missionIndex={missionIndex}
              mode={mode}
              onDamage={damage}
              onMissionComplete={completeMission}
              onModeChange={setMode}
              onTelemetry={setTelemetry}
              paused={paused}
              started={started}
              wanted={wanted}
            />
          </Suspense>
        </Canvas>
      </div>

      <div
        aria-hidden="true"
        className="game-input-surface"
        onPointerCancel={endLook}
        onPointerDown={beginLook}
        onPointerMove={updateLook}
        onPointerUp={endLook}
      />

      {started ? (
        <GameHud
          cash={cash}
          currentMission={currentMission}
          health={health}
          mode={mode}
          muted={muted}
          notification={notification}
          onMute={() => setMuted((value) => !value)}
          onRestart={restart}
          onVision={() => setShowVision(true)}
          telemetry={telemetry}
          wanted={wanted}
        />
      ) : null}

      {!started ? (
        <section className="bay-city-intro">
          <div className="intro-lockup">
            <p className="world-label">World 01 / San Francisco</p>
            <h1>Mirage</h1>
            <p className="intro-statement">
              The original vision was simple: create a world, then step inside it.
            </p>
            <p className="intro-proof">A living city rebuilt by a coding model.</p>
            <button className="bay-primary" id="enter-bay-city" onClick={begin}>
              <Play fill="currentColor" size={18} />
              Enter Bay City
            </button>
          </div>
          <span className="intro-index">M / 001</span>
        </section>
      ) : null}

      {showVision ? <VisionPanel onClose={() => setShowVision(false)} /> : null}

      {completed ? (
        <section className="bay-city-complete" role="dialog" aria-labelledby="run-complete-title">
          <p className="world-label">Afterlight / Complete</p>
          <h2 id="run-complete-title">The city is yours.</h2>
          <p>${cash.toLocaleString()} banked across San Francisco.</p>
          <button className="bay-primary" onClick={restart}>
            <RotateCcw size={18} />
            Run it again
          </button>
        </section>
      ) : null}

      {started && !completed && !showVision && (
        (mode === "car") || telemetry.nearVehicle
      ) ? (
        <div className="action-prompt" aria-live="polite">
          <kbd>E</kbd>
          <span>{mode === "car" ? "Exit vehicle" : "Enter vehicle"}</span>
        </div>
      ) : null}

      {touch && started && !completed && !showVision ? (
        <TouchControls controlsRef={controlsRef} mode={mode} />
      ) : null}
    </main>
  );
}

function GameHud({
  cash,
  currentMission,
  health,
  mode,
  muted,
  notification,
  onMute,
  onRestart,
  onVision,
  telemetry,
  wanted,
}: {
  cash: number;
  currentMission?: (typeof MISSIONS)[number];
  health: number;
  mode: GameMode;
  muted: boolean;
  notification: string;
  onMute: () => void;
  onRestart: () => void;
  onVision: () => void;
  telemetry: Telemetry;
  wanted: number;
}) {
  return (
    <>
      <header className="bay-hud bay-hud-top">
        <div className="bay-brand">
          <strong>Mirage</strong>
          <span>{telemetry.location}</span>
        </div>

        <div className="wanted-level" aria-label={`${wanted} wanted level`}>
          {[1, 2, 3].map((star) => (
            <Star fill={star <= wanted ? "currentColor" : "none"} key={star} size={17} />
          ))}
        </div>

        <div className="bay-hud-actions">
          <button aria-label="About Mirage" onClick={onVision} title="About Mirage">
            <Info size={17} />
          </button>
          <button aria-label={muted ? "Turn sound on" : "Turn sound off"} onClick={onMute}>
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button aria-label="Restart run" onClick={onRestart} title="Restart run">
            <RotateCcw size={17} />
          </button>
        </div>
      </header>

      <section className="mission-hud" aria-live="polite">
        <p>{currentMission?.chapter ?? "Afterlight"}</p>
        <h2>{currentMission?.objective ?? "The city is yours."}</h2>
        <span>{currentMission?.location ?? telemetry.location}</span>
      </section>

      <div className="hud-notification">{notification}</div>

      <div className="bay-hud-bottom">
        <MiniMap mission={currentMission} telemetry={telemetry} wanted={wanted} />

        <div className="player-vitals">
          <div className="cash-value">${cash.toLocaleString()}</div>
          <div className="health-track" aria-label={`${health} health`}>
            <span style={{ width: `${health}%` }} />
          </div>
        </div>

        <div className="speed-cluster">
          <span>{mode === "car" ? "KM/H" : "ON FOOT"}</span>
          <strong>{mode === "car" ? Math.round(telemetry.speed) : "SF"}</strong>
        </div>
      </div>
    </>
  );
}

function MiniMap({
  mission,
  telemetry,
  wanted,
}: {
  mission?: (typeof MISSIONS)[number];
  telemetry: Telemetry;
  wanted: number;
}) {
  const toMap = useCallback((x: number, z: number) => {
    const left = THREE.MathUtils.clamp(((x + 100) / 200) * 100, 2, 98);
    const top = THREE.MathUtils.clamp(((z + 198) / 298) * 100, 2, 98);
    return { left: `${left}%`, top: `${top}%` };
  }, []);
  const playerPosition = toMap(telemetry.x, telemetry.z);
  const targetPosition = mission ? toMap(mission.target[0], mission.target[2]) : null;

  return (
    <div className="mini-map" aria-label="City map">
      <div className="map-water" />
      <div className="map-city" />
      <div className="map-bridge" />
      {ROAD_LINES.map((line) => {
        const percentage = `${((line + 100) / 200) * 100}%`;
        return (
          <span className="map-road map-road-v" key={`v-${line}`} style={{ left: percentage }} />
        );
      })}
      {ROAD_LINES.map((line) => {
        const percentage = `${((line + 198) / 298) * 100}%`;
        return (
          <span className="map-road map-road-h" key={`h-${line}`} style={{ top: percentage }} />
        );
      })}
      {targetPosition ? (
        <span className="map-target" style={targetPosition as CSSProperties} />
      ) : null}
      {wanted > 0 ? <span className="map-police map-police-a" /> : null}
      {wanted > 1 ? <span className="map-police map-police-b" /> : null}
      {wanted > 2 ? <span className="map-police map-police-c" /> : null}
      <span className="map-player" style={playerPosition as CSSProperties} />
      <b>N</b>
    </div>
  );
}

function VisionPanel({ onClose }: { onClose: () => void }) {
  return (
    <section className="vision-panel" role="dialog" aria-labelledby="vision-title">
      <button aria-label="Close" className="vision-close" onClick={onClose}>
        <X size={20} />
      </button>
      <p className="world-label">MirageML / 2022 - Now</p>
      <h2 id="vision-title">Worlds, not assets.</h2>
      <p>
        Mirage began as a browser-native system for turning ideas into playable 3D worlds.
        World 01 returns to that premise: one city, one continuous game, built in code.
      </p>
      <div className="vision-facts">
        <span><b>01</b> Browser native</span>
        <span><b>02</b> Fully playable</span>
        <span><b>03</b> No account gate</span>
      </div>
      <button className="bay-secondary" onClick={onClose}>
        <CarFront size={18} />
        Return to the city
      </button>
    </section>
  );
}

function TouchControls({
  controlsRef,
  mode,
}: {
  controlsRef: React.MutableRefObject<ControlState>;
  mode: GameMode;
}) {
  const hold = (key: keyof ControlState, value: boolean) => {
    if (typeof controlsRef.current[key] === "boolean") {
      (controlsRef.current[key] as boolean) = value;
    }
  };
  const holdProps = (key: keyof ControlState) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      hold(key, true);
    },
    onPointerUp: () => {
      if (key !== "action" && key !== "jump") hold(key, false);
    },
    onPointerCancel: () => {
      if (key !== "action" && key !== "jump") hold(key, false);
    },
    onPointerLeave: () => {
      if (key !== "action" && key !== "jump") hold(key, false);
    },
  });

  return (
    <div className="bay-touch-controls">
      <div className="drive-pad">
        <button aria-label="Move forward" {...holdProps("forward")}><ArrowUp size={22} /></button>
        <button aria-label="Move left" {...holdProps("left")}><ArrowLeft size={22} /></button>
        <button aria-label="Move back" {...holdProps("back")}><ArrowDown size={22} /></button>
        <button aria-label="Move right" {...holdProps("right")}><ArrowRight size={22} /></button>
      </div>
      <div className="action-pad">
        <button aria-label="Sprint or boost" {...holdProps("sprint")}><Gauge size={22} /></button>
        <button
          aria-label={mode === "car" ? "Brake" : "Jump"}
          {...holdProps(mode === "car" ? "brake" : "jump")}
        >
          {mode === "car" ? <CircleStop size={22} /> : <MoveUp size={22} />}
        </button>
        <button aria-label={mode === "car" ? "Exit vehicle" : "Enter vehicle"} {...holdProps("action")}>
          {mode === "car" ? <LogOut size={22} /> : <CarFront size={22} />}
        </button>
      </div>
    </div>
  );
}
