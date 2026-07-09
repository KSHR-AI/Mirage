"use client";

import {
  Float,
  Sparkles,
  Stars,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  CapsuleCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Feather,
  Gem,
  Moon,
  MoveUp,
  Play,
  RotateCcw,
  Share2,
  Sparkles as SparklesIcon,
  Sprout,
  Volume2,
  VolumeX,
  Waves,
  Waypoints,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";

type Vec3 = [number, number, number];
type MutationId =
  | "night"
  | "overgrown"
  | "flooded"
  | "crystal"
  | "low-gravity"
  | "bridges";

type ControlState = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  lookLeft: boolean;
  lookRight: boolean;
  lookDeltaX: number;
  lookDeltaY: number;
  jump: boolean;
};

type HoldControl =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "lookLeft"
  | "lookRight"
  | "jump";

type Mutation = {
  id: MutationId;
  title: string;
  command: string;
  color: string;
  icon: typeof Moon;
};

const MUTATIONS: Mutation[] = [
  { id: "night", title: "Nightfall", command: "Bring on the night", color: "#9db8ff", icon: Moon },
  { id: "overgrown", title: "Overgrowth", command: "Let nature take over", color: "#8ee18c", icon: Sprout },
  { id: "flooded", title: "Flood", command: "Raise the ancient water", color: "#74d7e8", icon: Waves },
  { id: "crystal", title: "Crystal", command: "Turn stone into crystal", color: "#da8cff", icon: Gem },
  { id: "low-gravity", title: "Drift", command: "Loosen gravity", color: "#ffd98a", icon: Feather },
  { id: "bridges", title: "Pathways", command: "Build impossible bridges", color: "#ff9d72", icon: Waypoints },
];

const FRAGMENTS: Array<{ id: number; position: Vec3 }> = [
  { id: 0, position: [-7.2, 1.25, -1.5] },
  { id: 1, position: [7.3, 1.25, -13.5] },
  { id: 2, position: [0, 1.25, -24.5] },
];

const PORTAL_POSITION = new THREE.Vector3(0, 2.7, -31);
const EMPTY_CONTROLS: ControlState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  lookLeft: false,
  lookRight: false,
  lookDeltaX: 0,
  lookDeltaY: 0,
  jump: false,
};

function track(event: string, seed: number, value?: string) {
  const payload = JSON.stringify({ event, seed, value });
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

function randomSeed() {
  return Math.floor(1000 + Math.random() * 8999);
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function parseWorldFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const parsedSeed = Number(params.get("seed"));
  const known = new Set(MUTATIONS.map((mutation) => mutation.id));
  const mutations = (params.get("remix") ?? "")
    .split(",")
    .filter((value): value is MutationId => known.has(value as MutationId));

  return {
    seed: Number.isInteger(parsedSeed) && parsedSeed > 0 ? parsedSeed : randomSeed(),
    mutations,
  };
}

function useMirageAudio(muted: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  const ambientRef = useRef<OscillatorNode[]>([]);
  const ambientGainRef = useRef<GainNode | null>(null);

  const start = useCallback(() => {
    if (contextRef.current) {
      void contextRef.current.resume();
      return;
    }

    const context = new AudioContext();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    master.gain.value = muted ? 0 : 0.028;
    filter.type = "lowpass";
    filter.frequency.value = 240;
    master.connect(filter).connect(context.destination);

    const oscillators = [43, 64.5].map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.value = index === 0 ? 0.75 : 0.24;
      oscillator.connect(gain).connect(master);
      oscillator.start();
      return oscillator;
    });

    contextRef.current = context;
    ambientRef.current = oscillators;
    ambientGainRef.current = master;
  }, [muted]);

  const chime = useCallback(
    (frequency: number) => {
      const context = contextRef.current;
      if (!context || muted) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 1.6,
        context.currentTime + 0.42,
      );
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.6);
    },
    [muted],
  );

  useEffect(() => {
    const gain = ambientGainRef.current;
    const context = contextRef.current;
    if (!gain || !context) return;
    gain.gain.setTargetAtTime(muted ? 0 : 0.028, context.currentTime, 0.08);
  }, [muted]);

  useEffect(
    () => () => {
      ambientRef.current.forEach((oscillator) => oscillator.stop());
      void contextRef.current?.close();
    },
    [],
  );

  return { start, chime };
}

export function MirageWorld() {
  const [seed, setSeed] = useState(2407);
  const [mutations, setMutations] = useState<MutationId[]>([]);
  const [collected, setCollected] = useState<number[]>([]);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [touch, setTouch] = useState(false);
  const [status, setStatus] = useState("");
  const [gameKey, setGameKey] = useState(0);
  const controlsRef = useRef<ControlState>({ ...EMPTY_CONTROLS });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lookPointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const { start: startAudio, chime } = useMirageAudio(muted);

  useEffect(() => {
    document.body.classList.add("mirage-active");
    const world = parseWorldFromUrl();
    setSeed(world.seed);
    setMutations(world.mutations);
    setTouch(
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 720,
    );
    return () => {
      document.body.classList.remove("mirage-active");
    };
  }, []);

  const begin = useCallback(() => {
    startAudio();
    setStarted(true);
    setStatus("The first echo is awake.");
    track("game_started", seed);
  }, [seed, startAudio]);

  const collectFragment = useCallback(
    (id: number) => {
      setCollected((current) => {
        if (current.includes(id)) return current;
        return [...current, id];
      });
      controlsRef.current = { ...EMPTY_CONTROLS };
      setChoosing(true);
      setStatus(`Echo ${id + 1} recovered.`);
      chime(430 + id * 110);
      track("fragment_collected", seed, String(id + 1));
    },
    [chime, seed],
  );

  const chooseMutation = useCallback(
    (id: MutationId) => {
      setMutations((current) => (current.includes(id) ? current : [...current, id]));
      setChoosing(false);
      const mutation = MUTATIONS.find((item) => item.id === id);
      setStatus(mutation?.command ?? "The world changed.");
      chime(690);
      track("mutation_selected", seed, id);
    },
    [chime, seed],
  );

  const finish = useCallback(() => {
    if (completed) return;
    setCompleted(true);
    controlsRef.current = { ...EMPTY_CONTROLS };
    setStatus("This Mirage is complete.");
    chime(880);
    track("world_completed", seed, mutations.join(","));
  }, [chime, completed, mutations, seed]);

  const restart = useCallback(() => {
    const nextSeed = randomSeed();
    setSeed(nextSeed);
    setMutations([]);
    setCollected([]);
    setCompleted(false);
    setChoosing(false);
    setStarted(true);
    setStatus("A new Mirage is forming.");
    setGameKey((value) => value + 1);
    controlsRef.current = { ...EMPTY_CONTROLS };
    window.history.replaceState({}, "", window.location.pathname);
    track("game_started", nextSeed, "restart");
  }, []);

  const beginLook = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!started || choosing || completed) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      lookPointerRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    },
    [choosing, completed, started],
  );

  const updateLook = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = lookPointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    controlsRef.current.lookDeltaX += event.clientX - pointer.x;
    controlsRef.current.lookDeltaY += event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }, []);

  const endLook = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current?.id === event.pointerId) {
      lookPointerRef.current = null;
    }
  }, []);

  const share = useCallback(async () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("seed", String(seed));
    if (mutations.length) url.searchParams.set("remix", mutations.join(","));
    const shareData = {
      title: "Mirage",
      text: "Enter my Mirage.",
      url: url.toString(),
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setStatus("Mirage shared.");
      } else {
        await navigator.clipboard.writeText(url.toString());
        setStatus("World link copied.");
      }
      track("world_shared", seed, mutations.join(","));
    } catch {
      setStatus("Share cancelled.");
    }
  }, [mutations, seed]);

  const paused = !started || choosing || completed;
  const availableMutations = MUTATIONS.filter(
    (mutation) => !mutations.includes(mutation.id),
  );

  return (
    <main className="mirage-shell">
      <div className="mirage-canvas" aria-hidden="true">
        <Canvas
          key={`${seed}-${gameKey}`}
          dpr={[1, 1.6]}
          camera={{ fov: 66, near: 0.1, far: 120, position: [0, 1.8, 11] }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            canvasRef.current = gl.domElement;
            gl.domElement.id = "mirage-renderer";
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.08;
          }}
          shadows
        >
          <Suspense fallback={null}>
            <MirageScene
              collected={collected}
              controlsRef={controlsRef}
              mutations={mutations}
              onCollect={collectFragment}
              onFinish={finish}
              paused={paused}
              seed={seed}
            />
          </Suspense>
        </Canvas>
      </div>

      <div
        aria-hidden="true"
        className="look-surface"
        onPointerCancel={endLook}
        onPointerDown={beginLook}
        onPointerMove={updateLook}
        onPointerUp={endLook}
      />

      <header className="mirage-hud mirage-hud-top">
        <div className="mirage-brand">
          <strong>Mirage</strong>
          <span>World {seed}</span>
        </div>
        <div className="echo-counter" aria-label={`${collected.length} of 3 echoes`}>
          {FRAGMENTS.map((fragment) => (
            <span
              className={collected.includes(fragment.id) ? "echo-dot found" : "echo-dot"}
              key={fragment.id}
            />
          ))}
          <b>{collected.length}/3</b>
        </div>
        <div className="hud-actions">
          <button aria-label="Share world" onClick={() => void share()} title="Share world">
            <Share2 size={17} />
          </button>
          <button
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            onClick={() => setMuted((value) => !value)}
            title={muted ? "Sound on" : "Sound off"}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button aria-label="Start a new world" onClick={restart} title="New world">
            <RotateCcw size={17} />
          </button>
        </div>
      </header>

      <div className="crosshair" aria-hidden="true" />

      <div className="mutation-tray" aria-label="Active remixes">
        {mutations.map((id) => {
          const mutation = MUTATIONS.find((item) => item.id === id);
          if (!mutation) return null;
          return (
            <span key={id} style={{ "--mutation-color": mutation.color } as React.CSSProperties}>
              {mutation.title}
            </span>
          );
        })}
      </div>

      <p className="mirage-status" aria-live="polite">{status}</p>

      {!started ? (
        <section className="mirage-intro">
          <p className="mirage-kicker">A playable world</p>
          <h1>Mirage</h1>
          <p className="mirage-promise">Find the three echoes. Each one rewrites the world.</p>
          <button className="enter-button" id="enter-world" onClick={begin}>
            <Play fill="currentColor" size={18} />
            Enter Mirage
          </button>
        </section>
      ) : null}

      {choosing ? (
        <section className="remix-modal" aria-labelledby="remix-title" role="dialog">
          <div className="remix-heading">
            <SparklesIcon size={20} />
            <div>
              <p>Echo recovered</p>
              <h2 id="remix-title">Rewrite the world</h2>
            </div>
          </div>
          <div className="remix-grid">
            {availableMutations.map((mutation) => {
              const Icon = mutation.icon;
              return (
                <button
                  key={mutation.id}
                  onClick={() => chooseMutation(mutation.id)}
                  style={{ "--mutation-color": mutation.color } as React.CSSProperties}
                >
                  <Icon size={20} />
                  <span>
                    <strong>{mutation.title}</strong>
                    <small>{mutation.command}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {completed ? (
        <section className="mirage-complete" role="dialog" aria-labelledby="complete-title">
          <p className="mirage-kicker">World {seed}</p>
          <h2 id="complete-title">Your Mirage is alive.</h2>
          <p>{mutations.length} remixes shaped this world.</p>
          <div className="complete-actions">
            <button className="enter-button" onClick={() => void share()}>
              <Share2 size={18} /> Share this Mirage
            </button>
            <button className="ghost-button" onClick={restart}>
              <RotateCcw size={17} /> New world
            </button>
          </div>
        </section>
      ) : null}

      {touch && started && !choosing && !completed ? (
        <TouchControls controlsRef={controlsRef} />
      ) : null}
    </main>
  );
}

function MirageScene({
  collected,
  controlsRef,
  mutations,
  onCollect,
  onFinish,
  paused,
  seed,
}: {
  collected: number[];
  controlsRef: MutableRefObject<ControlState>;
  mutations: MutationId[];
  onCollect: (id: number) => void;
  onFinish: () => void;
  paused: boolean;
  seed: number;
}) {
  const lowGravity = mutations.includes("low-gravity");

  return (
    <Physics gravity={lowGravity ? [0, -3.4, 0] : [0, -11.5, 0]}>
      <World
        collected={collected}
        mutations={mutations}
        seed={seed}
        complete={collected.length === 3}
      />
      <Player
        collected={collected}
        controlsRef={controlsRef}
        lowGravity={lowGravity}
        onCollect={onCollect}
        onFinish={onFinish}
        paused={paused}
      />
    </Physics>
  );
}

function World({
  collected,
  mutations,
  seed,
  complete,
}: {
  collected: number[];
  mutations: MutationId[];
  seed: number;
  complete: boolean;
}) {
  const night = mutations.includes("night");
  const overgrown = mutations.includes("overgrown");
  const flooded = mutations.includes("flooded");
  const crystal = mutations.includes("crystal");
  const bridges = mutations.includes("bridges");
  const background = night ? "#05060d" : crystal ? "#24172d" : flooded ? "#42575d" : "#6d4d55";
  const fog = night ? "#070911" : flooded ? "#5b7478" : "#7a5b5a";
  const stone = crystal ? "#645b79" : overgrown ? "#6f7460" : "#827968";
  const random = useMemo(() => mulberry32(seed), [seed]);
  const rubble = useMemo(
    () =>
      Array.from({ length: 52 }, (_, index) => ({
        key: index,
        position: [random() * 42 - 21, random() * 0.3 + 0.08, random() * 55 - 35] as Vec3,
        rotation: [random() * 2, random() * 2, random() * 2] as Vec3,
        scale: [random() * 0.7 + 0.25, random() * 0.4 + 0.16, random() * 0.7 + 0.25] as Vec3,
      })),
    [random],
  );

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[fog, 13, 72]} />
      <ambientLight intensity={night ? 0.22 : 0.62} color={night ? "#7692d4" : "#ffe6c7"} />
      <hemisphereLight intensity={night ? 0.22 : 0.66} color={night ? "#5c73ac" : "#f7d8b0"} groundColor="#211c1a" />
      <directionalLight
        castShadow
        color={night ? "#8aa8ff" : "#ffd4a1"}
        intensity={night ? 1.5 : 2.7}
        position={night ? [-18, 24, -12] : [14, 24, 11]}
        shadow-mapSize={[1536, 1536]}
        shadow-camera-far={75}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
      />

      {night ? <Stars radius={70} depth={35} count={1200} factor={3} fade speed={0.3} /> : null}
      <Sparkles count={night ? 75 : 34} scale={[42, 12, 58]} position={[0, 4, -12]} size={1.5} speed={0.2} color={crystal ? "#e5a4ff" : "#efffa8"} opacity={0.55} />

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[30, 0.5, 38]} position={[0, -0.5, -12]} />
        <mesh receiveShadow position={[0, -0.55, -12]}>
          <boxGeometry args={[60, 1, 76]} />
          <meshStandardMaterial color={overgrown ? "#3e4c34" : flooded ? "#46545a" : "#4a4138"} roughness={0.95} />
        </mesh>
      </RigidBody>

      <StonePath stone={stone} />
      <Ruins stone={stone} />
      <WorldBounds />

      {rubble.map((piece) => (
        <mesh key={piece.key} castShadow position={piece.position} rotation={piece.rotation} scale={piece.scale}>
          <dodecahedronGeometry args={[0.55, 0]} />
          <meshStandardMaterial color={stone} roughness={1} />
        </mesh>
      ))}

      {overgrown ? <Overgrowth seed={seed + 17} /> : null}
      {flooded ? <Water /> : null}
      {crystal ? <CrystalField seed={seed + 31} /> : null}
      {bridges ? <ImpossibleBridges stone={stone} /> : null}

      {FRAGMENTS.map((fragment) =>
        collected.includes(fragment.id) ? null : (
          <Fragment key={fragment.id} id={fragment.id} position={fragment.position} />
        ),
      )}
      <Portal active={complete} night={night} />
    </>
  );
}

function StonePath({ stone }: { stone: string }) {
  return (
    <>
      {Array.from({ length: 19 }, (_, index) => {
        const z = 9 - index * 2.15;
        const x = Math.sin(index * 0.82) * 0.35;
        return (
          <RuinBlock
            key={index}
            position={[x, 0.08 + (index % 3) * 0.02, z]}
            rotation={[0, Math.sin(index) * 0.04, 0]}
            scale={[5.3, 0.18, 1.85]}
            color={index % 2 ? stone : "#8e806c"}
          />
        );
      })}
    </>
  );
}

function Ruins({ stone }: { stone: string }) {
  const structures: Array<{ position: Vec3; scale: Vec3; rotation?: Vec3 }> = [
    { position: [-8.5, 2.1, 5], scale: [5.2, 4.2, 4.8], rotation: [0, 0.1, 0] },
    { position: [9.2, 3.2, 2], scale: [6.2, 6.4, 5.4], rotation: [0, -0.14, 0] },
    { position: [-10.2, 3.7, -9], scale: [5.5, 7.4, 6.4], rotation: [0, -0.08, 0] },
    { position: [10.5, 2.6, -12], scale: [6.4, 5.2, 6.2], rotation: [0, 0.16, 0] },
    { position: [-9.2, 4.4, -24], scale: [6.6, 8.8, 7], rotation: [0, 0.11, 0] },
    { position: [10, 3.5, -27], scale: [6.5, 7, 7.6], rotation: [0, -0.11, 0] },
  ];

  return (
    <>
      {structures.map((structure, index) => (
        <group key={index}>
          <RuinBlock {...structure} color={index % 2 ? stone : "#756d61"} />
          <RuinBlock
            color="#504b45"
            position={[structure.position[0], structure.position[1] + structure.scale[1] / 2 + 0.7, structure.position[2]]}
            rotation={[0.08 * (index % 2 ? 1 : -1), 0, 0.12]}
            scale={[structure.scale[0] * 0.72, 0.65, structure.scale[2] * 0.75]}
          />
        </group>
      ))}
      <Arch position={[0, 0, -5.5]} stone={stone} />
      <Arch position={[0, 0, -18.5]} stone={stone} scale={1.2} />
      {[-12, -6, 6, 12].map((x, index) => (
        <Column key={x} position={[x, 0, -2 - index * 7]} stone={stone} height={4.5 + (index % 2) * 2.2} />
      ))}
    </>
  );
}

function RuinBlock({
  position,
  scale,
  rotation = [0, 0, 0],
  color,
}: {
  position: Vec3;
  scale: Vec3;
  rotation?: Vec3;
  color: string;
}) {
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={rotation}>
      <CuboidCollider args={[scale[0] / 2, scale[1] / 2, scale[2] / 2]} />
      <mesh castShadow receiveShadow scale={scale}>
        <boxGeometry />
        <meshStandardMaterial color={color} roughness={0.88} metalness={0.04} />
      </mesh>
    </RigidBody>
  );
}

function Arch({ position, stone, scale = 1 }: { position: Vec3; stone: string; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <RuinBlock position={[-3, 2.2, 0]} scale={[1.25, 4.4, 1.5]} color={stone} />
      <RuinBlock position={[3, 2.2, 0]} scale={[1.25, 4.4, 1.5]} color={stone} />
      <RuinBlock position={[0, 4.35, 0]} scale={[7.1, 1.15, 1.5]} color="#746b5f" />
    </group>
  );
}

function Column({ position, stone, height }: { position: Vec3; stone: string; height: number }) {
  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      <CuboidCollider args={[0.7, height / 2, 0.7]} position={[0, height / 2, 0]} />
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.72, 0.92, height, 10]} />
        <meshStandardMaterial color={stone} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, height + 0.22, 0]}>
        <boxGeometry args={[1.8, 0.44, 1.8]} />
        <meshStandardMaterial color="#91836f" roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}

function WorldBounds() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[0.5, 6, 38]} position={[-30, 5, -12]} />
      <CuboidCollider args={[0.5, 6, 38]} position={[30, 5, -12]} />
      <CuboidCollider args={[30, 6, 0.5]} position={[0, 5, 26]} />
      <CuboidCollider args={[30, 6, 0.5]} position={[0, 5, -50]} />
    </RigidBody>
  );
}

function Overgrowth({ seed }: { seed: number }) {
  const plants = useMemo(() => {
    const random = mulberry32(seed);
    return Array.from({ length: 58 }, (_, index) => ({
      key: index,
      position: [random() * 48 - 24, random() * 0.25, random() * 62 - 42] as Vec3,
      height: random() * 1.8 + 0.7,
      scale: random() * 0.55 + 0.35,
    }));
  }, [seed]);

  return (
    <group>
      {plants.map((plant) => (
        <group key={plant.key} position={plant.position} scale={plant.scale}>
          <mesh castShadow position={[0, plant.height / 2, 0]}>
            <cylinderGeometry args={[0.04, 0.1, plant.height, 5]} />
            <meshStandardMaterial color="#32482e" roughness={1} />
          </mesh>
          <mesh castShadow position={[0, plant.height, 0]}>
            <icosahedronGeometry args={[0.48, 0]} />
            <meshStandardMaterial color={plant.key % 3 ? "#58724a" : "#79915e"} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Water() {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (material.current) material.current.opacity = 0.48 + Math.sin(clock.elapsedTime * 0.7) * 0.05;
  });
  return (
    <mesh position={[0, 0.22, -12]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[60, 76, 1, 1]} />
      <meshStandardMaterial ref={material} color="#3b95a9" transparent opacity={0.5} roughness={0.15} metalness={0.25} />
    </mesh>
  );
}

function CrystalField({ seed }: { seed: number }) {
  const crystals = useMemo(() => {
    const random = mulberry32(seed);
    return Array.from({ length: 38 }, (_, index) => ({
      key: index,
      position: [random() * 46 - 23, random() * 0.2 + 0.2, random() * 60 - 42] as Vec3,
      height: random() * 2.8 + 0.7,
      rotation: random() * 1.8,
    }));
  }, [seed]);

  return (
    <group>
      {crystals.map((crystal) => (
        <mesh
          key={crystal.key}
          castShadow
          position={crystal.position}
          rotation={[0.12, crystal.rotation, 0.1]}
          scale={[0.42, crystal.height, 0.42]}
        >
          <octahedronGeometry args={[0.7, 0]} />
          <meshStandardMaterial color={crystal.key % 2 ? "#b86bea" : "#72d6dd"} emissive="#5c267d" emissiveIntensity={0.55} roughness={0.18} metalness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function ImpossibleBridges({ stone }: { stone: string }) {
  return (
    <group>
      {Array.from({ length: 8 }, (_, index) => (
        <RuinBlock
          key={index}
          position={[-10.5 + index * 3, 2.5 + Math.sin(index * 0.8) * 0.55, -20 - index * 0.35]}
          rotation={[0, -0.1, Math.sin(index * 0.7) * 0.08]}
          scale={[2.75, 0.35, 2.2]}
          color={index % 2 ? stone : "#a28472"}
        />
      ))}
      {Array.from({ length: 6 }, (_, index) => (
        <RuinBlock
          key={`high-${index}`}
          position={[8.5, 4.8 + index * 0.55, 3 - index * 3.2]}
          rotation={[0.1, -0.12 * index, 0]}
          scale={[3, 0.32, 2.8]}
          color="#9c7867"
        />
      ))}
    </group>
  );
}

function Fragment({ id, position }: { id: number; position: Vec3 }) {
  return (
    <Float floatIntensity={0.75} rotationIntensity={0.7} speed={1.6}>
      <group position={position}>
        <pointLight color="#dfff72" intensity={11} distance={7} />
        <mesh castShadow rotation={[0.5, 0.4, 0.2]}>
          <octahedronGeometry args={[0.48, 0]} />
          <meshStandardMaterial color="#e9ff96" emissive="#b7ff32" emissiveIntensity={2.8} roughness={0.16} metalness={0.42} />
        </mesh>
        <mesh rotation={[Math.PI / 2, id * 0.7, 0]}>
          <torusGeometry args={[0.85, 0.025, 8, 48]} />
          <meshBasicMaterial color="#edffc0" transparent opacity={0.65} />
        </mesh>
      </group>
    </Float>
  );
}

function Portal({ active, night }: { active: boolean; night: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.z += delta * (active ? 0.22 : 0.05);
  });

  return (
    <group position={PORTAL_POSITION.toArray() as Vec3}>
      <group ref={group}>
        <mesh castShadow>
          <torusGeometry args={[2.35, 0.24, 18, 72]} />
          <meshStandardMaterial color={active ? "#dfff73" : "#59584e"} emissive={active ? "#b9ff32" : "#22221f"} emissiveIntensity={active ? 2.2 : 0.15} roughness={0.28} metalness={0.62} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 3]}>
          <torusGeometry args={[2.75, 0.045, 8, 72]} />
          <meshBasicMaterial color={active ? "#f0ffbd" : "#646158"} transparent opacity={active ? 0.8 : 0.2} />
        </mesh>
      </group>
      <mesh>
        <circleGeometry args={[2.08, 64]} />
        <meshBasicMaterial color={night ? "#7189db" : "#c8ff66"} transparent opacity={active ? 0.22 : 0.035} side={THREE.DoubleSide} />
      </mesh>
      {active ? <pointLight color="#dfff73" intensity={28} distance={13} /> : null}
    </group>
  );
}

function Player({
  collected,
  controlsRef,
  lowGravity,
  onCollect,
  onFinish,
  paused,
}: {
  collected: number[];
  controlsRef: MutableRefObject<ControlState>;
  lowGravity: boolean;
  onCollect: (id: number) => void;
  onFinish: () => void;
  paused: boolean;
}) {
  const body = useRef<RapierRigidBody>(null);
  const collecting = useRef(new Set<number>());
  const finishing = useRef(false);
  const { camera } = useThree();
  const direction = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const setKey = (event: KeyboardEvent, value: boolean) => {
      if (event.code === "KeyW") controlsRef.current.forward = value;
      if (event.code === "KeyS") controlsRef.current.back = value;
      if (event.code === "KeyA") controlsRef.current.left = value;
      if (event.code === "KeyD") controlsRef.current.right = value;
      if (event.code === "Space") {
        event.preventDefault();
        controlsRef.current.jump = value;
      }
    };
    const down = (event: KeyboardEvent) => setKey(event, true);
    const up = (event: KeyboardEvent) => setKey(event, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [controlsRef]);

  useFrame((_, delta) => {
    const rigidBody = body.current;
    if (!rigidBody) return;
    const position = rigidBody.translation();
    const velocity = rigidBody.linvel();
    camera.position.set(position.x, position.y + 0.58, position.z);

    if (position.y < -4) {
      rigidBody.setTranslation({ x: 0, y: 1.3, z: 10 }, true);
      rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    if (paused) {
      rigidBody.setLinvel({ x: 0, y: velocity.y, z: 0 }, true);
      return;
    }

    if (controlsRef.current.lookLeft) camera.rotation.y += delta * 1.45;
    if (controlsRef.current.lookRight) camera.rotation.y -= delta * 1.45;
    if (controlsRef.current.lookDeltaX || controlsRef.current.lookDeltaY) {
      camera.rotation.order = "YXZ";
      camera.rotation.y -= controlsRef.current.lookDeltaX * 0.0024;
      camera.rotation.x = THREE.MathUtils.clamp(
        camera.rotation.x - controlsRef.current.lookDeltaY * 0.0021,
        -1.18,
        1.18,
      );
      controlsRef.current.lookDeltaX = 0;
      controlsRef.current.lookDeltaY = 0;
    }

    forward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    direction.set(0, 0, 0);
    direction.addScaledVector(
      forward,
      Number(controlsRef.current.forward) - Number(controlsRef.current.back),
    );
    direction.addScaledVector(
      right,
      Number(controlsRef.current.right) - Number(controlsRef.current.left),
    );
    if (direction.lengthSq() > 0) direction.normalize();
    const speed = lowGravity ? 6.4 : 5.4;
    rigidBody.setLinvel(
      { x: direction.x * speed, y: velocity.y, z: direction.z * speed },
      true,
    );

    if (controlsRef.current.jump && Math.abs(velocity.y) < 0.14) {
      rigidBody.applyImpulse({ x: 0, y: lowGravity ? 3.2 : 4.8, z: 0 }, true);
      controlsRef.current.jump = false;
    }

    for (const fragment of FRAGMENTS) {
      if (collected.includes(fragment.id) || collecting.current.has(fragment.id)) continue;
      const dx = position.x - fragment.position[0];
      const dy = position.y - fragment.position[1];
      const dz = position.z - fragment.position[2];
      if (dx * dx + dy * dy + dz * dz < 2.7) {
        collecting.current.add(fragment.id);
        onCollect(fragment.id);
      }
    }

    if (collected.length === FRAGMENTS.length && !finishing.current) {
      const dx = position.x - PORTAL_POSITION.x;
      const dy = position.y - PORTAL_POSITION.y;
      const dz = position.z - PORTAL_POSITION.z;
      if (dx * dx + dy * dy + dz * dz < 7.5) {
        finishing.current = true;
        onFinish();
      }
    }
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      enabledRotations={[false, false, false]}
      friction={0.8}
      linearDamping={0.2}
      mass={1}
      position={[0, 1.25, 10.5]}
    >
      <CapsuleCollider args={[0.42, 0.34]} />
    </RigidBody>
  );
}

function TouchControls({ controlsRef }: { controlsRef: MutableRefObject<ControlState> }) {
  const hold =
    (key: HoldControl, value: boolean) =>
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      controlsRef.current[key] = value;
    };

  return (
    <div className="touch-controls">
      <div className="touch-pad move-pad">
        <button aria-label="Move forward" onPointerDown={hold("forward", true)} onPointerUp={hold("forward", false)} onPointerCancel={hold("forward", false)}>
          <ChevronUp />
        </button>
        <button aria-label="Move left" onPointerDown={hold("left", true)} onPointerUp={hold("left", false)} onPointerCancel={hold("left", false)}>
          <ChevronLeft />
        </button>
        <button aria-label="Move backward" onPointerDown={hold("back", true)} onPointerUp={hold("back", false)} onPointerCancel={hold("back", false)}>
          <ChevronDown />
        </button>
        <button aria-label="Move right" onPointerDown={hold("right", true)} onPointerUp={hold("right", false)} onPointerCancel={hold("right", false)}>
          <ChevronRight />
        </button>
      </div>
      <div className="touch-pad look-pad">
        <button aria-label="Look left" onPointerDown={hold("lookLeft", true)} onPointerUp={hold("lookLeft", false)} onPointerCancel={hold("lookLeft", false)}>
          <ChevronLeft />
        </button>
        <button aria-label="Jump" onPointerDown={hold("jump", true)} onPointerUp={hold("jump", false)}>
          <MoveUp />
        </button>
        <button aria-label="Look right" onPointerDown={hold("lookRight", true)} onPointerUp={hold("lookRight", false)} onPointerCancel={hold("lookRight", false)}>
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
