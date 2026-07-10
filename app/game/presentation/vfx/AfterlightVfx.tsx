"use client";

import { useFrame } from "@react-three/fiber";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Object3D,
  PointLight,
  Vector3,
} from "three";

import { SIMULATION_HZ } from "../../core/contracts";
import {
  clampUnit,
  normalizedLifetime,
  pulseEnvelope,
  renderTick,
  wrapPositive,
} from "./lifetime";
import {
  VFX_EVENT_SCAN_LIMIT,
  resolveVfxBudget,
  vfxEventDuration,
  visitVfxPool,
} from "./pool";
import { mixVfxSeed, vfxRandom01, vfxSigned } from "./seed";
import type {
  AfterlightVfxEvent,
  AfterlightVfxProps,
  DisabledVehicleVfxSource,
  RainVfxState,
  VfxBudget,
} from "./types";

const RAIN_SEED_ID = 0x7261696e;
const Y_AXIS = new Vector3(0, 1, 0);
const DEFAULT_NORMAL = Object.freeze([0, 1, 0] as const);
const DEFAULT_VELOCITY = Object.freeze([0, 0, 0] as const);
const EMPTY_DISABLED_VEHICLES = Object.freeze(
  [] as readonly DisabledVehicleVfxSource[],
);

const COLOR = Object.freeze({
  rain: 0xa8d9df,
  tireSmoke: 0x536069,
  disabledSmoke: 0x303b42,
  explosionSmoke: 0x4b4140,
  warmSpark: 0xffb24b,
  hotSpark: 0xffe09a,
  bulletSpark: 0xffd37a,
  electric: 0x74e9ff,
  electricWhite: 0xe8ffff,
  objective: 0x62e8cf,
  objectiveGold: 0xffd476,
  impactPulse: 0xffa85b,
  explosionPulse: 0xff7d45,
} as const);

interface ValueRef<T> {
  current: T;
}

interface VfxRuntimeRefs {
  readonly currentTick: ValueRef<number>;
  readonly alpha: ValueRef<number>;
  readonly events: ValueRef<readonly AfterlightVfxEvent[]>;
  readonly disabledVehicles: ValueRef<readonly DisabledVehicleVfxSource[]>;
  readonly rain: ValueRef<RainVfxState | undefined>;
  readonly reducedMotion: ValueRef<boolean>;
  readonly seed: ValueRef<number>;
}

export const AfterlightVfx = memo(function AfterlightVfx({
  alpha = 0,
  currentTick,
  disabledVehicles = EMPTY_DISABLED_VEHICLES,
  events,
  quality = "high",
  rain,
  reducedMotion = false,
  seed = 2407,
}: AfterlightVfxProps) {
  const currentTickRef = useRef(currentTick);
  const alphaRef = useRef(alpha);
  const eventsRef = useRef(events);
  const disabledVehiclesRef = useRef(disabledVehicles);
  const rainRef = useRef(rain);
  const reducedMotionRef = useRef(reducedMotion);
  const seedRef = useRef(seed);

  useLayoutEffect(() => {
    currentTickRef.current = currentTick;
    alphaRef.current = alpha;
    eventsRef.current = events;
    disabledVehiclesRef.current = disabledVehicles;
    rainRef.current = rain;
    reducedMotionRef.current = reducedMotion;
    seedRef.current = seed;
  }, [alpha, currentTick, disabledVehicles, events, rain, reducedMotion, seed]);

  const runtime = useMemo<VfxRuntimeRefs>(
    () => ({
      currentTick: currentTickRef,
      alpha: alphaRef,
      events: eventsRef,
      disabledVehicles: disabledVehiclesRef,
      rain: rainRef,
      reducedMotion: reducedMotionRef,
      seed: seedRef,
    }),
    [],
  );
  const budget = resolveVfxBudget(quality, reducedMotion);

  return (
    <group name="afterlight-world-vfx">
      <RainStreakPool budget={budget} runtime={runtime} />
      <SmokePool budget={budget} runtime={runtime} />
      <SparkPool budget={budget} runtime={runtime} />
      <PulsePool budget={budget} runtime={runtime} />
      {budget.lights > 0 ? (
        <TransientLightPool budget={budget} runtime={runtime} />
      ) : null}
    </group>
  );
});

interface PoolProps {
  readonly budget: VfxBudget;
  readonly runtime: VfxRuntimeRefs;
}

const RainStreakPool = memo(function RainStreakPool({
  budget,
  runtime,
}: PoolProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const transform = useMemo(() => new Object3D(), []);
  useDynamicMatrix(meshRef);

  useFrame(() => {
    const mesh = meshRef.current;
    const rain = runtime.rain.current;
    if (!mesh || !rain?.enabled) {
      if (mesh) mesh.count = 0;
      return;
    }

    const intensity = clampUnit(rain.intensity ?? 1);
    const count = Math.min(
      budget.rain,
      Math.max(0, Math.round(budget.rain * intensity)),
    );
    const tick = renderTick(runtime.currentTick.current, runtime.alpha.current);
    const time = tick / SIMULATION_HZ;
    const motionScale = runtime.reducedMotion.current ? 0.42 : 1;
    const anchor = rain.anchor;
    const wind = rain.wind ?? DEFAULT_VELOCITY;
    const worldSeed = runtime.seed.current;
    const radius = 20;
    const height = 18;

    for (let slot = 0; slot < count; slot += 1) {
      const particleSeed = mixVfxSeed(worldSeed, RAIN_SEED_ID, slot);
      const speed = (11 + vfxRandom01(particleSeed, 3) * 7) * motionScale;
      const xTravel = time * wind[0] * 0.55 * motionScale;
      const zTravel = time * wind[2] * 0.55 * motionScale;
      const x =
        anchor[0] -
        radius +
        wrapPositive(
          vfxRandom01(particleSeed, 0) * radius * 2 + xTravel,
          radius * 2,
        );
      const y =
        anchor[1] -
        2 +
        wrapPositive(
          vfxRandom01(particleSeed, 1) * height - time * speed,
          height,
        );
      const z =
        anchor[2] -
        radius +
        wrapPositive(
          vfxRandom01(particleSeed, 2) * radius * 2 + zTravel,
          radius * 2,
        );
      const length = (0.55 + vfxRandom01(particleSeed, 4) * 0.75) * motionScale;

      transform.position.set(x, y, z);
      transform.rotation.set(wind[2] * 0.018, 0, -wind[0] * 0.018);
      transform.scale.set(0.012, length, 0.012);
      transform.updateMatrix();
      mesh.setMatrixAt(slot, transform.matrix);
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      args={[undefined, undefined, budget.rain]}
      frustumCulled={false}
      ref={meshRef}
      renderOrder={2}
    >
      <boxGeometry />
      <meshBasicMaterial
        color={COLOR.rain}
        depthWrite={false}
        opacity={0.34}
        toneMapped={false}
        transparent
      />
    </instancedMesh>
  );
});

const SmokePool = memo(function SmokePool({ budget, runtime }: PoolProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const transform = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  useDynamicInstances(meshRef, budget.smoke, color, COLOR.tireSmoke);

  const writeEventSmoke = useCallback(
    (
      event: AfterlightVfxEvent,
      ordinal: number,
      slot: number,
      ageTicks: number,
      progress: number,
    ) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const particleSeed = mixVfxSeed(
        runtime.seed.current,
        event.id,
        ordinal,
        11,
      );
      const velocity = event.velocity ?? DEFAULT_VELOCITY;
      const ageSeconds = ageTicks / SIMULATION_HZ;
      const explosive = event.kind === "explosion";
      const spread = explosive ? 0.85 : 0.32;
      const rise = explosive ? 1.45 : 0.72;
      const angle = vfxRandom01(particleSeed, 0) * Math.PI * 2;
      const orbit = spread * (0.25 + vfxRandom01(particleSeed, 1) * 0.75);
      const swirl = angle + ageSeconds * (vfxSigned(particleSeed, 2) * 1.4);
      const baseSize = explosive
        ? 0.32 + vfxRandom01(particleSeed, 3) * 0.42
        : 0.16 + vfxRandom01(particleSeed, 3) * 0.2;
      const fade = Math.max(0.03, 1 - progress * progress);
      const size = baseSize * (0.55 + progress * 1.4) * fade;

      transform.position.set(
        event.position[0] +
          Math.cos(swirl) * orbit * (0.35 + progress) +
          velocity[0] * ageSeconds * 0.08,
        event.position[1] +
          0.12 +
          ageSeconds * rise * (0.7 + vfxRandom01(particleSeed, 4) * 0.6),
        event.position[2] +
          Math.sin(swirl) * orbit * (0.35 + progress) +
          velocity[2] * ageSeconds * 0.08,
      );
      transform.rotation.set(
        ageSeconds * vfxSigned(particleSeed, 5),
        angle,
        ageSeconds * vfxSigned(particleSeed, 6),
      );
      transform.scale.set(size * 1.08, size, size * 1.08);
      transform.updateMatrix();
      mesh.setMatrixAt(slot, transform.matrix);
      mesh.setColorAt(
        slot,
        color.setHex(explosive ? COLOR.explosionSmoke : COLOR.tireSmoke),
      );
    },
    [color, runtime, transform],
  );

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const currentTick = runtime.currentTick.current;
    const alpha = runtime.alpha.current;
    let slot = visitVfxPool(
      runtime.events.current,
      "smoke",
      budget.smoke,
      currentTick,
      alpha,
      runtime.reducedMotion.current,
      writeEventSmoke,
    );

    const sources = runtime.disabledVehicles.current;
    const sourceCount = sources.length;
    const tick = renderTick(currentTick, alpha);
    const attempts = budget.smoke * 2;

    for (
      let attempt = 0;
      slot < budget.smoke && sourceCount > 0 && attempt < attempts;
      attempt += 1
    ) {
      const source = sources[attempt % sourceCount];
      const intensity = clampUnit(source.intensity ?? 1);
      if (intensity <= 0) continue;
      const ordinal = Math.floor(attempt / sourceCount);
      const particleSeed = mixVfxSeed(
        runtime.seed.current,
        source.id,
        ordinal,
        23,
      );
      const phase = wrapPositive(
        tick / (96 + vfxRandom01(particleSeed, 0) * 42) +
          vfxRandom01(particleSeed, 1),
        1,
      );
      const angle =
        vfxRandom01(particleSeed, 2) * Math.PI * 2 + phase * Math.PI;
      const radius = (0.12 + phase * 0.38) * intensity;
      const fade = Math.max(0.04, 1 - phase * phase);
      const size =
        (0.18 + vfxRandom01(particleSeed, 3) * 0.22) *
        (0.7 + phase) *
        fade *
        intensity;

      transform.position.set(
        source.position[0] + Math.cos(angle) * radius,
        source.position[1] + 0.55 + phase * 2.15,
        source.position[2] + Math.sin(angle) * radius,
      );
      transform.rotation.set(angle * 0.31, angle, phase * 1.4);
      transform.scale.set(size * 1.12, size, size * 1.12);
      transform.updateMatrix();
      mesh.setMatrixAt(slot, transform.matrix);
      mesh.setColorAt(slot, color.setHex(COLOR.disabledSmoke));
      slot += 1;
    }

    mesh.count = slot;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      args={[undefined, undefined, budget.smoke]}
      frustumCulled={false}
      ref={meshRef}
      renderOrder={3}
    >
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial
        depthWrite={false}
        metalness={0}
        opacity={0.34}
        roughness={1}
        transparent
        vertexColors
      />
    </instancedMesh>
  );
});

const SparkPool = memo(function SparkPool({ budget, runtime }: PoolProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const transform = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const direction = useMemo(() => new Vector3(), []);
  useDynamicInstances(meshRef, budget.sparks, color, COLOR.warmSpark);

  const writeSpark = useCallback(
    (
      event: AfterlightVfxEvent,
      ordinal: number,
      slot: number,
      ageTicks: number,
      progress: number,
    ) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const particleSeed = mixVfxSeed(
        runtime.seed.current,
        event.id,
        ordinal,
        41,
      );
      const ageSeconds = ageTicks / SIMULATION_HZ;
      const velocity = event.velocity ?? DEFAULT_VELOCITY;
      const normal = event.normal ?? DEFAULT_NORMAL;
      const normalLength = Math.max(
        0.0001,
        Math.hypot(normal[0], normal[1], normal[2]),
      );
      const nx = normal[0] / normalLength;
      const ny = normal[1] / normalLength;
      const nz = normal[2] / normalLength;
      const randomX = vfxSigned(particleSeed, 0);
      const randomY = vfxSigned(particleSeed, 1);
      const randomZ = vfxSigned(particleSeed, 2);
      let speed = 5;
      let gravity = -8;
      let colorHex: number = COLOR.warmSpark;
      let x: number;
      let y: number;
      let z: number;
      let velocityX: number;
      let velocityY: number;
      let velocityZ: number;

      if (event.kind === "blackout-pulse") {
        const reach = 0.35 + progress * (1.4 + ordinal * 0.07);
        const angle =
          vfxRandom01(particleSeed, 3) * Math.PI * 2 + progress * 2.8;
        const jitter = Math.sin(progress * 36 + randomY * 8) * 0.18;
        x = event.position[0] + Math.cos(angle) * reach + jitter;
        y =
          event.position[1] +
          0.15 +
          progress * (1.1 + vfxRandom01(particleSeed, 4) * 1.6) +
          jitter;
        z = event.position[2] + Math.sin(angle) * reach - jitter;
        velocityX = -Math.sin(angle);
        velocityY = 0.8 + randomY * 0.2;
        velocityZ = Math.cos(angle);
        colorHex = ordinal % 3 === 0 ? COLOR.electricWhite : COLOR.electric;
      } else {
        if (event.kind === "bullet-impact") {
          speed = 3.8 + vfxRandom01(particleSeed, 3) * 3.8;
          gravity = -7.5;
          colorHex = COLOR.bulletSpark;
        } else if (event.kind === "skid-sparks") {
          speed = 2.8 + vfxRandom01(particleSeed, 3) * 3.2;
          gravity = -3.2;
          colorHex = ordinal % 3 === 0 ? COLOR.hotSpark : COLOR.warmSpark;
        } else if (event.kind === "vehicle-impact") {
          speed = 4.5 + vfxRandom01(particleSeed, 3) * 5.5;
          gravity = -9;
          colorHex = ordinal % 4 === 0 ? COLOR.hotSpark : COLOR.warmSpark;
        } else if (event.kind === "explosion") {
          speed = 5.2 + vfxRandom01(particleSeed, 3) * 7;
          gravity = -7;
          colorHex = ordinal % 3 === 0 ? COLOR.hotSpark : COLOR.explosionPulse;
        } else {
          speed = 3.8 + vfxRandom01(particleSeed, 3) * 4.5;
          gravity = -2.2;
          colorHex =
            event.color ??
            (ordinal % 2 === 0 ? COLOR.objective : COLOR.objectiveGold);
        }

        direction.set(
          nx * 0.85 + randomX * 0.72,
          ny * 0.85 + Math.abs(randomY) * 0.72 + 0.08,
          nz * 0.85 + randomZ * 0.72,
        );
        if (direction.lengthSq() < 0.0001) direction.set(0, 1, 0);
        direction.normalize();
        velocityX = direction.x * speed + velocity[0] * 0.12;
        velocityY = direction.y * speed + velocity[1] * 0.12;
        velocityZ = direction.z * speed + velocity[2] * 0.12;
        x = event.position[0] + velocityX * ageSeconds;
        y =
          event.position[1] +
          0.04 +
          velocityY * ageSeconds +
          gravity * ageSeconds * ageSeconds * 0.5;
        z = event.position[2] + velocityZ * ageSeconds;
        velocityY += gravity * ageSeconds;
      }

      direction.set(velocityX, velocityY, velocityZ);
      if (direction.lengthSq() < 0.0001) direction.set(0, 1, 0);
      direction.normalize();
      const fade = Math.max(0.025, 1 - progress * progress);
      const width = (0.012 + vfxRandom01(particleSeed, 5) * 0.016) * fade;
      const length = (0.12 + vfxRandom01(particleSeed, 6) * 0.28) * fade;

      transform.position.set(x, y, z);
      transform.quaternion.setFromUnitVectors(Y_AXIS, direction);
      transform.scale.set(width, length, width);
      transform.updateMatrix();
      mesh.setMatrixAt(slot, transform.matrix);
      mesh.setColorAt(slot, color.setHex(colorHex));
    },
    [color, direction, runtime, transform],
  );

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const count = visitVfxPool(
      runtime.events.current,
      "spark",
      budget.sparks,
      runtime.currentTick.current,
      runtime.alpha.current,
      runtime.reducedMotion.current,
      writeSpark,
    );
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      args={[undefined, undefined, budget.sparks]}
      frustumCulled={false}
      ref={meshRef}
      renderOrder={6}
    >
      <boxGeometry />
      <meshBasicMaterial
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        transparent
        vertexColors
      />
    </instancedMesh>
  );
});

const PulsePool = memo(function PulsePool({ budget, runtime }: PoolProps) {
  const ringRef = useRef<InstancedMesh>(null);
  const glowRef = useRef<InstancedMesh>(null);
  const ringTransform = useMemo(() => new Object3D(), []);
  const glowTransform = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  useDynamicInstances(ringRef, budget.pulses, color, COLOR.impactPulse);
  useDynamicInstances(glowRef, budget.pulses, color, COLOR.impactPulse);

  const writePulse = useCallback(
    (
      event: AfterlightVfxEvent,
      ordinal: number,
      slot: number,
      _ageTicks: number,
      progress: number,
    ) => {
      const ring = ringRef.current;
      const glow = glowRef.current;
      if (!ring || !glow) return;
      const delay = ordinal * 0.13;
      const localProgress = clampUnit((progress - delay) / (1 - delay));
      const envelope = pulseEnvelope(localProgress);
      let radius = 1.3;
      let colorHex: number = COLOR.impactPulse;

      if (event.kind === "explosion") {
        radius = 4.2;
        colorHex = COLOR.explosionPulse;
      } else if (event.kind === "blackout-pulse") {
        radius = 5.5;
        colorHex = ordinal % 2 === 0 ? COLOR.electric : COLOR.electricWhite;
      } else if (event.kind === "objective-complete") {
        radius = 3.3;
        colorHex =
          event.color ??
          (ordinal % 2 === 0 ? COLOR.objective : COLOR.objectiveGold);
      }

      const ringScale = Math.max(
        0.001,
        radius * (0.12 + localProgress * 0.88) * envelope,
      );
      const glowScale = Math.max(
        0.001,
        radius * 0.32 * (1 - localProgress) * envelope,
      );

      ringTransform.position.set(
        event.position[0],
        event.position[1] + 0.055 + ordinal * 0.014,
        event.position[2],
      );
      ringTransform.rotation.set(-Math.PI / 2, 0, 0);
      ringTransform.scale.set(ringScale, ringScale, ringScale);
      ringTransform.updateMatrix();
      ring.setMatrixAt(slot, ringTransform.matrix);
      ring.setColorAt(slot, color.setHex(colorHex));

      glowTransform.position.set(
        event.position[0],
        event.position[1] + 0.3,
        event.position[2],
      );
      glowTransform.rotation.set(0, 0, 0);
      glowTransform.scale.set(glowScale, glowScale, glowScale);
      glowTransform.updateMatrix();
      glow.setMatrixAt(slot, glowTransform.matrix);
      glow.setColorAt(slot, color.setHex(colorHex));
    },
    [color, glowTransform, ringTransform],
  );

  useFrame(() => {
    const ring = ringRef.current;
    const glow = glowRef.current;
    if (!ring || !glow) return;
    const count = visitVfxPool(
      runtime.events.current,
      "pulse",
      budget.pulses,
      runtime.currentTick.current,
      runtime.alpha.current,
      runtime.reducedMotion.current,
      writePulse,
    );
    ring.count = count;
    glow.count = count;
    ring.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
  });

  return (
    <group name="afterlight-pulses">
      <instancedMesh
        args={[undefined, undefined, budget.pulses]}
        frustumCulled={false}
        ref={ringRef}
        renderOrder={5}
      >
        <ringGeometry args={[0.82, 1, 28]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          depthWrite={false}
          opacity={0.72}
          side={2}
          toneMapped={false}
          transparent
          vertexColors
        />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, budget.pulses]}
        frustumCulled={false}
        ref={glowRef}
        renderOrder={5}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          depthWrite={false}
          opacity={0.36}
          toneMapped={false}
          transparent
          vertexColors
        />
      </instancedMesh>
    </group>
  );
});

const TransientLightPool = memo(function TransientLightPool({
  budget,
  runtime,
}: PoolProps) {
  const firstRef = useRef<PointLight>(null);
  const secondRef = useRef<PointLight>(null);

  useFrame(() => {
    const first = firstRef.current;
    const second = secondRef.current;
    if (first) first.intensity = 0;
    if (second) second.intensity = 0;

    let slot = 0;
    const events = runtime.events.current;
    const firstEventIndex = Math.max(0, events.length - VFX_EVENT_SCAN_LIMIT);
    for (let index = events.length - 1; index >= firstEventIndex; index -= 1) {
      if (slot >= budget.lights) break;
      const event = events[index];
      if (
        event.kind !== "vehicle-impact" &&
        event.kind !== "explosion" &&
        event.kind !== "blackout-pulse" &&
        event.kind !== "objective-complete"
      ) {
        continue;
      }
      const duration = vfxEventDuration(event);
      const progress = normalizedLifetime(
        runtime.currentTick.current,
        runtime.alpha.current,
        event.tick,
        duration,
      );
      if (
        renderTick(runtime.currentTick.current, runtime.alpha.current) <
          event.tick ||
        progress >= 1
      ) {
        continue;
      }

      const light = slot === 0 ? first : second;
      if (!light) break;
      const envelope = pulseEnvelope(progress);
      let colorHex: number = COLOR.impactPulse;
      let peak = 7;
      let distance = 5;
      if (event.kind === "explosion") {
        colorHex = COLOR.explosionPulse;
        peak = 24;
        distance = 10;
      } else if (event.kind === "blackout-pulse") {
        colorHex = COLOR.electric;
        peak = 12;
        distance = 8;
      } else if (event.kind === "objective-complete") {
        colorHex = event.color ?? COLOR.objective;
        peak = 8;
        distance = 7;
      }

      light.position.set(
        event.position[0],
        event.position[1] + 0.65,
        event.position[2],
      );
      light.color.setHex(colorHex);
      light.distance = distance;
      light.intensity = peak * envelope;
      slot += 1;
    }
  });

  return (
    <group name="afterlight-transient-lights">
      <pointLight decay={2} intensity={0} ref={firstRef} />
      {budget.lights === 2 ? (
        <pointLight decay={2} intensity={0} ref={secondRef} />
      ) : null}
    </group>
  );
});

function useDynamicMatrix(meshRef: RefObject<InstancedMesh | null>): void {
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
  }, [meshRef]);
}

function useDynamicInstances(
  meshRef: RefObject<InstancedMesh | null>,
  capacity: number,
  color: Color,
  initialColor: number,
): void {
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let slot = 0; slot < capacity; slot += 1) {
      mesh.setColorAt(slot, color.setHex(initialColor));
    }
    mesh.instanceColor?.setUsage(DynamicDrawUsage);
    mesh.count = 0;
  }, [capacity, color, initialColor, meshRef]);
}
