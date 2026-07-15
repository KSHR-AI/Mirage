"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { lazy, memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { AFTERLIGHT_ENTITY_IDS } from "../game/core/afterlight-state";
import type {
  ActorState,
  GameState,
  InputFrame,
  Pose,
  RenderSnapshot,
  VehicleState,
} from "../game/core/contracts";
import { AFTERLIGHT_PHASE_IDS } from "../game/missions/afterlight-job";
import { createAfterlightMission } from "../game/missions/afterlight-contracts";
import { activeAfterlightPoliceCount } from "../game/missions/afterlight-operations";
import { qualitySettings, type GameQualityTier } from "../game/performance";
import {
  PLAYTEST_INSPECTION_EVENT,
  isPlaytestAimInspection,
  resolvePlaytestInspectionKey,
  resolvePlaytestInspectionPose,
} from "../game/playtest/inspection-camera";
import {
  AfterlightCameraRig,
  type AfterlightCameraImpulse,
} from "../game/presentation/camera";
import {
  BayCityWorld,
  CITY_BLACKOUT_COLLAPSE_TICKS,
  type CityMissionZoneId,
  resolveCityPowerState,
} from "../game/presentation/city";
import {
  createAmbientCivilianDefinitions,
  createAmbientVehicleDefinitions,
  sampleAmbientCivilianMotion,
} from "../game/presentation/city/ambient-life";
import {
  createSocialCivilianDefinitions,
  sampleSocialCivilianMotion,
} from "../game/presentation/city/social-life";
import { AfterlightMissionSetpieces } from "../game/presentation/mission";
import { withAfterlightCourierPosition } from "../game/presentation/mission/plan";
import {
  ArmoredCourierModel,
  CivilianModel,
  GuardModel,
  HeroCoupeModel,
  PoliceInterceptorModel,
  PoliceOfficerModel,
  PlayerAgentModel,
  TrafficSedanModel,
  TrafficVanModel,
  type AgentAnimationState,
  type ModelQuality,
} from "../game/presentation/models";
import {
  AfterlightVfx,
  type AfterlightVfxEvent,
} from "../game/presentation/vfx";
import {
  AFTERLIGHT_CHARACTER_CENTER_TO_FEET,
  sampleAfterlightCharacterGround,
} from "../game/world/afterlight-character-world";
import { decomposeVehicleMotion } from "../game/vehicles";

export interface AfterlightSceneProps {
  readonly state: GameState;
  readonly snapshot: RenderSnapshot;
  readonly input: InputFrame;
  readonly started: boolean;
  readonly openingCinematic?: boolean;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly quality: GameQualityTier;
  readonly vfxEvents: readonly AfterlightVfxEvent[];
  readonly cameraImpulses: readonly AfterlightCameraImpulse[];
  readonly cameraYaw: number;
  readonly cameraPitch: number;
  readonly onReady?: () => void;
}

const KEYHOLDER_GUARDS = new Set<number>([
  AFTERLIGHT_ENTITY_IDS.keyholderGuardA,
  AFTERLIGHT_ENTITY_IDS.keyholderGuardB,
]);
const VAULT_GUARDS = new Set<number>([
  AFTERLIGHT_ENTITY_IDS.vaultGuardA,
  AFTERLIGHT_ENTITY_IDS.vaultGuardB,
  AFTERLIGHT_ENTITY_IDS.vaultGuardC,
  AFTERLIGHT_ENTITY_IDS.vaultGuardD,
  AFTERLIGHT_ENTITY_IDS.vaultGuardE,
]);
const POLICE_IDS = [
  AFTERLIGHT_ENTITY_IDS.policeA,
  AFTERLIGHT_ENTITY_IDS.policeB,
  AFTERLIGHT_ENTITY_IDS.policeC,
  AFTERLIGHT_ENTITY_IDS.policeD,
] as const;

const BLACKOUT_MARKER = "afterlight:blackout:active";
const AMBIENT_TRAFFIC_CAMERA_CLEARANCE_SQUARED = 12 * 12;
const AMBIENT_CIVILIAN_CAMERA_CLEARANCE_SQUARED = 14 * 14;
const SOCIAL_CIVILIAN_CAMERA_CLEARANCE_SQUARED = 6 * 6;

const AfterlightPostEffects = lazy(() =>
  import("../game/presentation/postfx").then((module) => ({
    default: module.AfterlightPostEffects,
  })),
);

function planarSpeed(velocity: readonly [number, number, number]): number {
  return Math.hypot(velocity[0], velocity[2]);
}

function modelQuality(quality: GameQualityTier): ModelQuality {
  return quality === "low" ? "mobile" : "desktop";
}

function cityQuality(quality: GameQualityTier): "mobile" | "desktop" {
  return quality === "high" ? "desktop" : "mobile";
}

function zoneForPhase(phaseId: string): CityMissionZoneId {
  switch (phaseId) {
    case AFTERLIGHT_PHASE_IDS.boost:
    case AFTERLIGHT_PHASE_IDS.keyholder:
      return "courier-yard";
    case AFTERLIGHT_PHASE_IDS.vault:
      return "aurora-vault";
    case AFTERLIGHT_PHASE_IDS.blackout:
      return "grid-seven";
    case AFTERLIGHT_PHASE_IDS.run:
      return "ember-span";
    case AFTERLIGHT_PHASE_IDS.debrief:
      return "safehouse";
    default:
      return "courier-yard";
  }
}

function animationForActor(
  actor: ActorState,
  combatReady: boolean,
): AgentAnimationState {
  if (actor.life !== "alive") return "down";
  const ground = sampleAfterlightCharacterGround(
    actor.pose.position[0],
    actor.pose.position[2],
  );
  // Curbs are 13.5 cm tall; avoid treating an ordinary curb descent as a jump.
  if (ground && actor.pose.position[1] > ground.height + 0.22) return "jump";
  const speed = planarSpeed(actor.velocity);
  if (combatReady && speed < 0.3) return "aim";
  if (speed > 4.2) return "run";
  if (speed > 0.25) return "walk";
  return "idle";
}

function mutablePosition(position: readonly [number, number, number]) {
  return [position[0], position[1], position[2]] as [number, number, number];
}

function actorVisualPosition(position: readonly [number, number, number]) {
  return [
    position[0],
    position[1] - AFTERLIGHT_CHARACTER_CENTER_TO_FEET,
    position[2],
  ] as [number, number, number];
}

function AmbientTraffic({
  quality,
  targetPosition,
}: {
  readonly quality: GameQualityTier;
  readonly targetPosition: readonly [number, number, number];
}) {
  const count = qualitySettings(quality).trafficCount;
  const definitions = useMemo(
    () => createAmbientVehicleDefinitions(count),
    [count],
  );
  const groups = useRef<Array<THREE.Group | null>>([]);
  const visualQuality = quality === "low" ? "mobile" : "desktop";

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    definitions.forEach((vehicle, index) => {
      const group = groups.current[index];
      if (!group) return;
      const distance =
        ((((vehicle.offset +
          elapsed * vehicle.speed * vehicle.direction +
          104) %
          208) +
          208) %
          208) -
        104;
      if (vehicle.axis === "x") {
        group.position.set(distance, 0.02, vehicle.lane);
        group.rotation.y = vehicle.direction > 0 ? -Math.PI / 2 : Math.PI / 2;
      } else {
        group.position.set(vehicle.lane, 0.02, distance);
        group.rotation.y = vehicle.direction > 0 ? Math.PI : 0;
      }
      const dx = group.position.x - targetPosition[0];
      const dz = group.position.z - targetPosition[2];
      group.visible =
        dx * dx + dz * dz > AMBIENT_TRAFFIC_CAMERA_CLEARANCE_SQUARED;
    });
  });

  return (
    <group name="ambient-traffic">
      {definitions.map((vehicle, index) => {
        const Vehicle = vehicle.van ? TrafficVanModel : TrafficSedanModel;
        return (
          <group
            key={vehicle.id}
            ref={(group) => {
              groups.current[index] = group;
            }}
          >
            <Vehicle
              entityId={vehicle.id}
              headlights
              quality={visualQuality}
              wheelSpin={vehicle.offset * 0.5}
            />
          </group>
        );
      })}
    </group>
  );
}

function AmbientCivilians({
  quality,
  targetPosition,
}: {
  readonly quality: GameQualityTier;
  readonly targetPosition: readonly [number, number, number];
}) {
  const count = qualitySettings(quality).civilianCount;
  const definitions = useMemo(
    () => createAmbientCivilianDefinitions(count),
    [count],
  );
  const initialWalking = useMemo(
    () =>
      definitions.map(
        (definition) => sampleAmbientCivilianMotion(definition, 0).walking,
      ),
    [definitions],
  );
  const groups = useRef<Array<THREE.Group | null>>([]);
  const walkingRef = useRef<readonly boolean[]>(initialWalking);
  const [walkingStates, setWalkingStates] = useState(initialWalking);
  const visualQuality = quality === "high" ? "desktop" : "mobile";
  const probeElapsedRef = useRef(0);
  const observedBehaviorRef = useRef({ mixed: false });

  useFrame(({ clock }, delta) => {
    const inspect =
      process.env.NODE_ENV === "development" &&
      typeof document !== "undefined" &&
      new URLSearchParams(window.location.search).has("inspect");
    if (inspect) probeElapsedRef.current += delta;
    const shouldProbe = inspect && probeElapsedRef.current >= 0.25;
    let idle = 0;
    let walking = 0;
    let nextWalking: boolean[] | null =
      walkingRef.current.length === definitions.length
        ? null
        : [...initialWalking];

    definitions.forEach((definition, index) => {
      const motion = sampleAmbientCivilianMotion(definition, clock.elapsedTime);
      const group = groups.current[index];
      if (group) {
        const z =
          ((((definition.startZ +
            motion.travelSeconds * definition.speed * definition.direction +
            96) %
            192) +
            192) %
            192) -
          96;
        group.position.set(definition.x, 0.32, z);
        group.rotation.y = definition.direction > 0 ? 0 : Math.PI;
        const dx = group.position.x - targetPosition[0];
        const dz = group.position.z - targetPosition[2];
        group.visible =
          dx * dx + dz * dz > AMBIENT_CIVILIAN_CAMERA_CLEARANCE_SQUARED;
      }

      if (walkingRef.current[index] !== motion.walking) {
        nextWalking ??= [...walkingRef.current];
        nextWalking[index] = motion.walking;
      }
      if (shouldProbe) {
        if (motion.walking) walking += 1;
        else idle += 1;
      }
    });

    if (nextWalking) {
      walkingRef.current = nextWalking;
      setWalkingStates(nextWalking);
    }
    if (!shouldProbe) return;
    probeElapsedRef.current = 0;
    observedBehaviorRef.current.mixed ||= idle > 0 && walking > 0;
    document.documentElement.dataset.mirageAmbientCivilians = JSON.stringify({
      idle,
      observedMixed: observedBehaviorRef.current.mixed,
      walking,
    });
  });

  useEffect(
    () => () => {
      delete document.documentElement.dataset.mirageAmbientCivilians;
    },
    [],
  );

  return (
    <group name="ambient-civilians">
      {definitions.map((civilian, index) => (
        <group
          key={civilian.id}
          ref={(group) => {
            groups.current[index] = group;
          }}
        >
          <CivilianModel
            animation={walkingStates[index] === false ? "idle" : "walk"}
            direction={0}
            entityId={civilian.id}
            quality={visualQuality}
            speed={walkingStates[index] === false ? 0 : civilian.speed}
          />
        </group>
      ))}
    </group>
  );
}

function AmbientLifeInspectionGroup({
  quality,
}: {
  readonly quality: ModelQuality;
}) {
  return (
    <group name="ambient-life-inspection">
      <CivilianModel
        animation="idle"
        direction={Math.PI / 2}
        entityId="ambient-inspection-idle"
        position={[-4.5, 0.32, 17.1]}
        quality={quality}
        speed={0}
      />
      <CivilianModel
        animation="walk"
        direction={Math.PI / 2}
        entityId="ambient-inspection-walk"
        position={[-4.5, 0.32, 19]}
        quality={quality}
        speed={1}
      />
    </group>
  );
}

function AmbientSocialLife({
  inspection,
  quality,
  targetPosition,
}: {
  readonly inspection: boolean;
  readonly quality: GameQualityTier;
  readonly targetPosition: readonly [number, number, number];
}) {
  const socialQuality = inspection || quality !== "low" ? "desktop" : "mobile";
  const definitions = useMemo(
    () => createSocialCivilianDefinitions(socialQuality),
    [socialQuality],
  );
  const initialWalking = useMemo(
    () =>
      definitions.map(
        (definition) => sampleSocialCivilianMotion(definition, 0).walking,
      ),
    [definitions],
  );
  const groups = useRef<Array<THREE.Group | null>>([]);
  const walkingRef = useRef<readonly boolean[]>(initialWalking);
  const [walkingStates, setWalkingStates] = useState(initialWalking);
  const visualQuality = modelQuality(quality);
  const probeElapsedRef = useRef(0);
  const observedRef = useRef({ crossing: false, waiting: false });

  useFrame(({ clock }, delta) => {
    let crossing = 0;
    let waiting = 0;
    let conversations = 0;
    let nextWalking: boolean[] | null = null;

    definitions.forEach((definition, index) => {
      const motion = sampleSocialCivilianMotion(definition, clock.elapsedTime);
      const group = groups.current[index];
      if (group) {
        group.position.set(...motion.position);
        group.rotation.y = motion.heading;
        const dx = group.position.x - targetPosition[0];
        const dz = group.position.z - targetPosition[2];
        group.visible =
          inspection ||
          dx * dx + dz * dz > SOCIAL_CIVILIAN_CAMERA_CLEARANCE_SQUARED;
      }

      if (walkingRef.current[index] !== motion.walking) {
        nextWalking ??= [...walkingRef.current];
        nextWalking[index] = motion.walking;
      }
      if (motion.behavior === "conversation") conversations += 1;
      if (motion.behavior === "crossing" && motion.walking) crossing += 1;
      if (
        motion.behavior === "waiting" ||
        (motion.behavior === "crossing" && !motion.walking)
      ) {
        waiting += 1;
      }
    });

    if (nextWalking) {
      walkingRef.current = nextWalking;
      setWalkingStates(nextWalking);
    }

    if (process.env.NODE_ENV !== "development") return;
    probeElapsedRef.current += delta;
    if (probeElapsedRef.current < 0.25) return;
    probeElapsedRef.current = 0;
    observedRef.current.crossing ||= crossing > 0;
    observedRef.current.waiting ||= waiting > 0;
    document.documentElement.dataset.mirageSocialLife = JSON.stringify({
      conversations,
      crossing,
      observedCrossing: observedRef.current.crossing,
      observedWaiting: observedRef.current.waiting,
      waiting,
    });
  });

  useEffect(
    () => () => {
      delete document.documentElement.dataset.mirageSocialLife;
    },
    [],
  );

  return (
    <group name="ambient-social-life">
      {definitions.map((civilian, index) => (
        <group
          key={civilian.id}
          ref={(group) => {
            groups.current[index] = group;
          }}
        >
          <CivilianModel
            animation={walkingStates[index] === true ? "walk" : "idle"}
            direction={0}
            entityId={civilian.id}
            quality={visualQuality}
            speed={walkingStates[index] === true ? civilian.speed : 0}
          />
        </group>
      ))}
    </group>
  );
}

function VehicleInspectionFleet() {
  return (
    <group name="vehicle-inspection-fleet">
      <TrafficVanModel
        brakeLights
        entityId="inspection-traffic-van"
        headlights
        position={[-4.2, 0.22, 0]}
        quality="desktop"
        rotation={[0, -0.42, 0]}
      />
      <ArmoredCourierModel
        entityId="inspection-armored-courier"
        headlights
        position={[0, 0.22, 0]}
        quality="desktop"
        rotation={[0, 0.22, 0]}
      />
      <PoliceInterceptorModel
        emergencyLights
        entityId="inspection-police-interceptor"
        headlights
        position={[4.2, 0.22, 0]}
        quality="desktop"
        rotation={[0, 0.48, 0]}
        sirenPhase={0.36}
      />
    </group>
  );
}

function DynamicActor({
  actor,
  quality,
  combatReady,
  animationOverride,
  player,
  police,
}: {
  readonly actor: ActorState;
  readonly quality: ModelQuality;
  readonly combatReady: boolean;
  readonly animationOverride?: AgentAnimationState;
  readonly player?: boolean;
  readonly police?: boolean;
}) {
  const animation = animationOverride ?? animationForActor(actor, combatReady);
  const common = {
    animation,
    direction: actor.pose.rotationY,
    entityId: actor.id,
    position: actorVisualPosition(actor.pose.position),
    quality,
    speed: planarSpeed(actor.velocity),
  };

  if (player) return <PlayerAgentModel {...common} aim={combatReady} />;
  if (police) return <PoliceOfficerModel {...common} aim={combatReady} />;
  return <GuardModel {...common} aim={combatReady} />;
}

function DynamicHeroVehicle({
  vehicle,
  quality,
  brakeLights,
  braking,
  steering,
  throttle,
}: {
  readonly vehicle: VehicleState;
  readonly quality: ModelQuality;
  readonly brakeLights: boolean;
  readonly braking: boolean;
  readonly steering: number;
  readonly throttle: number;
}) {
  const speed = planarSpeed(vehicle.velocity);
  const signedForwardSpeed = decomposeVehicleMotion(vehicle).forwardSpeed;
  const corneringLoad =
    steering * THREE.MathUtils.clamp(Math.abs(speed) / 14, 0, 1);
  return (
    <HeroCoupeModel
      brakeLights={brakeLights}
      damage={1 - vehicle.health / 100}
      disabled={vehicle.life !== "active"}
      entityId={vehicle.id}
      headlights
      lateralLoad={corneringLoad}
      longitudinalLoad={braking ? -1 : throttle}
      position={mutablePosition(vehicle.pose.position)}
      quality={quality}
      rotation={[0, vehicle.pose.rotationY, 0]}
      steering={steering}
      wheelSpin={signedForwardSpeed * 0.55}
    />
  );
}

function VehicleCameraCollisionProxy({
  vehicle,
}: {
  readonly vehicle: VehicleState;
}) {
  return (
    <mesh
      position={mutablePosition(vehicle.pose.position)}
      rotation={[0, vehicle.pose.rotationY, 0]}
      userData={{ cameraCollisionRoot: true }}
    >
      <boxGeometry args={[2.2, 2.8, 4.9]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

export const AfterlightScene = memo(function AfterlightScene({
  cameraPitch,
  cameraYaw,
  state,
  snapshot,
  input,
  started,
  openingCinematic = false,
  paused,
  reducedMotion,
  quality,
  vfxEvents,
  cameraImpulses,
  onReady,
}: AfterlightSceneProps) {
  const camera = useThree((three) => three.camera);
  const gl = useThree((three) => three.gl);
  const rootScene = useThree((three) => three.scene);
  const [inspectionPose, setInspectionPose] = useState<Pose | null>(null);
  const [inspectionKey, setInspectionKey] = useState<string | null>(null);
  const inspectionAim =
    process.env.NODE_ENV === "development" &&
    isPlaytestAimInspection(`?inspect=${inspectionKey ?? ""}`, true);
  const ambientLifeInspection =
    process.env.NODE_ENV === "development" && inspectionKey === "ambient-life";
  const socialLifeInspection =
    process.env.NODE_ENV === "development" && inspectionKey === "street-life";

  useEffect(() => {
    const enabled = process.env.NODE_ENV === "development";
    const applyInspection = (key: string, pose: Pose | null) => {
      if (!pose) return;
      document.documentElement.dataset.mirageInspectionPose = key;
      setInspectionKey(key);
      setInspectionPose(pose);
    };
    const inspectionKey =
      new URLSearchParams(window.location.search).get("inspect") ?? "";
    const initialPose = resolvePlaytestInspectionPose(
      window.location.search,
      enabled,
    );
    if (inspectionKey && initialPose) {
      queueMicrotask(() => applyInspection(inspectionKey, initialPose));
    }
    const handleInspection = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") {
        return;
      }
      applyInspection(
        event.detail,
        resolvePlaytestInspectionKey(event.detail, enabled),
      );
    };
    window.addEventListener(PLAYTEST_INSPECTION_EVENT, handleInspection);
    return () => {
      window.removeEventListener(PLAYTEST_INSPECTION_EVENT, handleInspection);
      delete document.documentElement.dataset.mirageInspectionPose;
    };
  }, []);

  const readyFrameCount = useRef(0);
  const readySignaled = useRef(false);
  const rendererSampleFrame = useRef(0);
  useFrame(() => {
    if (!onReady || readySignaled.current) return;
    readyFrameCount.current += 1;
    if (readyFrameCount.current < 2) return;
    readySignaled.current = true;
    onReady();
  });
  useFrame(() => {
    rendererSampleFrame.current += 1;
    if (rendererSampleFrame.current % 60 !== 0) return;
    const render = gl.info.render;
    document.documentElement.dataset.mirageRenderer = JSON.stringify({
      calls: render.calls,
      lines: render.lines,
      points: render.points,
      quality,
      triangles: render.triangles,
    });
  });
  useEffect(
    () => () => {
      delete document.documentElement.dataset.mirageRenderer;
    },
    [],
  );

  useEffect(() => {
    const compilation = gl.extensions.has("KHR_parallel_shader_compile")
      ? gl.compileAsync(rootScene, camera)
      : Promise.resolve(gl.compile(rootScene, camera));
    void compilation.catch(() => undefined);
  }, [camera, gl, quality, rootScene]);

  const definition = useMemo(
    () => createAfterlightMission(state.mission.missionId, state.seed),
    [state.mission.missionId, state.seed],
  );
  const phase =
    definition.phases[state.mission.phaseIndex] ?? definition.phases[0];
  const phaseId = phase.id;
  const activePoliceCount = activeAfterlightPoliceCount(
    definition.encounter,
    phaseId,
    state.heat.wantedLevel,
    state.heat.mode,
  );
  const visualQuality = modelQuality(quality);
  const actors = useMemo(
    () => new Map(snapshot.actors.map((actor) => [actor.id, actor])),
    [snapshot.actors],
  );
  const vehicles = useMemo(
    () => new Map(snapshot.vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [snapshot.vehicles],
  );
  const player = actors.get(state.playerId) ?? state.actors.get(state.playerId);
  const hero =
    vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe) ??
    state.vehicles.get(AFTERLIGHT_ENTITY_IDS.heroCoupe);
  const courier =
    vehicles.get(AFTERLIGHT_ENTITY_IDS.courier) ??
    state.vehicles.get(AFTERLIGHT_ENTITY_IDS.courier);
  const presentationEncounter = useMemo(
    () =>
      withAfterlightCourierPosition(
        definition.encounter,
        courier?.pose.position,
      ),
    [courier?.pose.position, definition.encounter],
  );
  const blackoutActive = state.inventory.has(BLACKOUT_MARKER);
  const [blackoutStartTick, setBlackoutStartTick] = useState<number | null>(
    null,
  );

  useFrame(() => {
    if (!blackoutActive) {
      if (blackoutStartTick !== null) setBlackoutStartTick(null);
      return;
    }
    if (blackoutStartTick === null) {
      setBlackoutStartTick(snapshot.currentTick);
    }
  });

  const effectiveBlackoutStartTick = blackoutActive
    ? (blackoutStartTick ?? snapshot.currentTick)
    : undefined;
  const blackoutTick =
    blackoutActive && effectiveBlackoutStartTick != null
      ? Math.min(
          snapshot.currentTick,
          effectiveBlackoutStartTick + CITY_BLACKOUT_COLLAPSE_TICKS,
        )
      : snapshot.currentTick;
  const cityPowerState = resolveCityPowerState({
    blackoutActive,
    blackoutStartTick: effectiveBlackoutStartTick,
    currentTick: blackoutTick,
    reducedMotion,
    seed: state.seed,
  });

  if (!player || !hero) return null;

  const driving = hero.occupiedBy === player.id;
  const completed = new Set(state.mission.completedObjectiveIds);
  const activeGuards =
    phaseId === AFTERLIGHT_PHASE_IDS.keyholder
      ? KEYHOLDER_GUARDS
      : phaseId === AFTERLIGHT_PHASE_IDS.vault
        ? VAULT_GUARDS
        : new Set<number>();
  const targetPose: Pose = !started
    ? hero.pose
    : driving
      ? hero.pose
      : {
          position: actorVisualPosition(player.pose.position),
          rotationY: player.pose.rotationY,
        };
  const openingTargetPose: Pose = {
    position: [
      player.pose.position[0] * 0.62 + hero.pose.position[0] * 0.38,
      actorVisualPosition(player.pose.position)[1],
      player.pose.position[2] * 0.62 + hero.pose.position[2] * 0.38,
    ],
    rotationY: player.pose.rotationY,
  };
  const cameraTargetPose =
    inspectionPose ?? (openingCinematic ? openingTargetPose : targetPose);
  const speed = planarSpeed(driving ? hero.velocity : player.velocity);
  const cameraMode = !started
    ? "intro"
    : openingCinematic
      ? "opening"
      : state.mission.completed
        ? "debrief"
        : driving
          ? "vehicle"
          : "on-foot";
  const disabledVehicles = snapshot.vehicles
    .filter((vehicle) => vehicle.life !== "active")
    .map((vehicle) => ({
      id: vehicle.id,
      position: vehicle.pose.position,
      intensity:
        1 -
        vehicle.health / Math.max(1, vehicle.kind === "courier" ? 120 : 100),
    }));
  const showRuntimeHero =
    driving ||
    phaseId !== AFTERLIGHT_PHASE_IDS.boost ||
    completed.has("steal-coupe");

  return (
    <>
      <BayCityWorld
        activeZone={
          started && phaseId !== AFTERLIGHT_PHASE_IDS.boost
            ? zoneForPhase(phaseId)
            : null
        }
        powerState={cityPowerState}
        missionProgress={
          state.mission.phaseIndex / Math.max(1, definition.phases.length - 1)
        }
        quality={cityQuality(quality)}
        reducedMotion={reducedMotion}
        seed={state.seed}
        shadows={quality !== "low"}
      />

      <AfterlightMissionSetpieces
        blackout={blackoutActive}
        completedObjectiveIds={state.mission.completedObjectiveIds}
        contractId={definition.contract.id}
        encounterVariant={presentationEncounter}
        inventory={state.inventory}
        interactionCuesVisible={started}
        phaseId={phaseId}
        quality={quality}
        reducedMotion={reducedMotion}
      />

      {!inspectionKey?.startsWith("vehicle-fleet") ? (
        <>
          <AmbientTraffic
            quality={quality}
            targetPosition={targetPose.position}
          />
          {ambientLifeInspection ? (
            <AmbientLifeInspectionGroup quality={visualQuality} />
          ) : !socialLifeInspection ? (
            <AmbientCivilians
              quality={quality}
              targetPosition={targetPose.position}
            />
          ) : null}
          {!ambientLifeInspection && (quality !== "low" || inspectionKey) ? (
            <AmbientSocialLife
              inspection={socialLifeInspection}
              quality={quality}
              targetPosition={targetPose.position}
            />
          ) : null}
        </>
      ) : null}
      {process.env.NODE_ENV === "development" &&
      inspectionKey?.startsWith("vehicle-fleet") ? (
        <VehicleInspectionFleet />
      ) : null}

      {!driving ? (
        <DynamicActor
          actor={player}
          animationOverride={inspectionAim ? "aim" : undefined}
          combatReady={input.aim || inspectionAim}
          player
          quality={visualQuality}
        />
      ) : null}

      {[...activeGuards].map((id) => {
        const actor = actors.get(id);
        return actor ? (
          <DynamicActor
            actor={actor}
            combatReady={actor.life === "alive"}
            key={id}
            quality={visualQuality}
          />
        ) : null;
      })}

      {POLICE_IDS.slice(0, activePoliceCount).map((id, index) => {
        const actor = actors.get(id);
        if (!actor) return null;
        return (
          <group key={id}>
            <DynamicActor
              actor={actor}
              combatReady={actor.life === "alive"}
              police
              quality={visualQuality}
            />
            <PoliceInterceptorModel
              emergencyLights
              entityId={`response-${id}`}
              position={[
                actor.pose.position[0] + (index % 2 ? 3.2 : -3.2),
                0.04,
                actor.pose.position[2] + 4.5,
              ]}
              quality={visualQuality}
              rotation={[0, actor.pose.rotationY, 0]}
              sirenPhase={(snapshot.currentTick % 60) / 60}
            />
          </group>
        );
      })}

      {showRuntimeHero ? (
        <>
          <DynamicHeroVehicle
            brakeLights={driving && input.brake}
            braking={driving && input.brake}
            quality={visualQuality}
            steering={driving ? input.steer : 0}
            throttle={driving ? input.throttle : 0}
            vehicle={hero}
          />
          {!driving ? <VehicleCameraCollisionProxy vehicle={hero} /> : null}
        </>
      ) : null}

      <AfterlightVfx
        alpha={snapshot.alpha}
        currentTick={snapshot.currentTick}
        disabledVehicles={disabledVehicles}
        events={vfxEvents}
        quality={quality}
        rain={{
          enabled: false,
          anchor: targetPose.position,
          intensity: 0,
          wind: [0.6, 0, -0.25],
        }}
        reducedMotion={reducedMotion}
        seed={state.seed}
      />

      <AfterlightCameraRig
        aim={!driving && (input.aim || inspectionAim)}
        controlledOrientation={
          inspectionPose
            ? { pitch: 0, yaw: inspectionPose.rotationY }
            : driving
              ? undefined
              : { pitch: cameraPitch, yaw: cameraYaw }
        }
        impulses={cameraImpulses}
        look={input.look}
        lookMode={
          input.source === "gamepad" || input.source === "touch"
            ? "axis"
            : "delta"
        }
        mode={cameraMode}
        paused={paused}
        reducedMotion={reducedMotion}
        speed={speed}
        steering={driving ? input.steer : 0}
        targetPose={cameraTargetPose}
      />

      {quality === "high" && !reducedMotion ? (
        <AfterlightPostEffects
          quality={quality}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </>
  );
});
