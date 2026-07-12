"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { lazy, memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  AFTERLIGHT_ENTITY_IDS,
  AFTERLIGHT_LANDMARKS,
} from "../game/core/afterlight-state";
import type {
  ActorState,
  GameState,
  InputFrame,
  Pose,
  RenderSnapshot,
  VehicleState,
} from "../game/core/contracts";
import {
  AFTERLIGHT_PHASE_IDS,
  createAfterlightJob,
} from "../game/missions/afterlight-job";
import { qualitySettings, type GameQualityTier } from "../game/performance";
import {
  isPlaytestAimInspection,
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
} from "../game/presentation/city/ambient-life";
import { AfterlightMissionSetpieces } from "../game/presentation/mission";
import { withAfterlightCourierPosition } from "../game/presentation/mission/plan";
import {
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

export interface AfterlightSceneProps {
  readonly state: GameState;
  readonly snapshot: RenderSnapshot;
  readonly input: InputFrame;
  readonly started: boolean;
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
  const groups = useRef<Array<THREE.Group | null>>([]);
  const visualQuality = quality === "high" ? "desktop" : "mobile";

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    definitions.forEach((civilian, index) => {
      const group = groups.current[index];
      if (!group) return;
      const z =
        ((((civilian.startZ +
          elapsed * civilian.speed * civilian.direction +
          96) %
          192) +
          192) %
          192) -
        96;
      group.position.set(civilian.x, 0.32, z);
      group.rotation.y = civilian.direction > 0 ? 0 : Math.PI;
      const dx = group.position.x - targetPosition[0];
      const dz = group.position.z - targetPosition[2];
      group.visible =
        dx * dx + dz * dz > AMBIENT_CIVILIAN_CAMERA_CLEARANCE_SQUARED;
    });
  });

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
            animation="walk"
            direction={0}
            entityId={civilian.id}
            quality={visualQuality}
            speed={civilian.speed}
          />
        </group>
      ))}
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
  steering,
}: {
  readonly vehicle: VehicleState;
  readonly quality: ModelQuality;
  readonly brakeLights: boolean;
  readonly steering: number;
}) {
  const speed = planarSpeed(vehicle.velocity);
  return (
    <HeroCoupeModel
      brakeLights={brakeLights}
      damage={1 - vehicle.health / 100}
      disabled={vehicle.life !== "active"}
      entityId={vehicle.id}
      headlights
      position={mutablePosition(vehicle.pose.position)}
      quality={quality}
      rotation={[0, vehicle.pose.rotationY, 0]}
      steering={steering}
      wheelSpin={speed * 0.55}
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
  const inspectionAim =
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    isPlaytestAimInspection(window.location.search, true);

  useEffect(() => {
    const enabled = process.env.NODE_ENV === "development";
    const pose = resolvePlaytestInspectionPose(window.location.search, enabled);
    if (!pose) return;
    const inspectionKey = new URLSearchParams(window.location.search).get(
      "inspect",
    );
    if (inspectionKey) {
      document.documentElement.dataset.mirageInspectionPose = inspectionKey;
    }
    queueMicrotask(() => setInspectionPose(pose));
    return () => {
      delete document.documentElement.dataset.mirageInspectionPose;
    };
  }, []);

  useEffect(() => {
    if (!onReady) return;
    let cancelled = false;
    const compilation = gl.extensions.has("KHR_parallel_shader_compile")
      ? gl.compileAsync(rootScene, camera)
      : Promise.resolve(gl.compile(rootScene, camera));
    void compilation
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) onReady();
      });
    return () => {
      cancelled = true;
    };
  }, [camera, gl, onReady, quality, rootScene]);

  const definition = useMemo(
    () => createAfterlightJob(state.seed),
    [state.seed],
  );
  const phase =
    definition.phases[state.mission.phaseIndex] ?? definition.phases[0];
  const phaseId = phase.id;
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
  const cameraTargetPose = inspectionPose ?? targetPose;
  const speed = planarSpeed(driving ? hero.velocity : player.velocity);
  const cameraMode = !started
    ? "intro"
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
    phaseId !== AFTERLIGHT_PHASE_IDS.boost || completed.has("steal-coupe");

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
        encounterVariant={presentationEncounter}
        inventory={state.inventory}
        interactionCuesVisible={started}
        phaseId={phaseId}
        quality={quality}
        reducedMotion={reducedMotion}
      />

      <AmbientTraffic quality={quality} targetPosition={targetPose.position} />
      <AmbientCivilians
        quality={quality}
        targetPosition={targetPose.position}
      />

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

      {POLICE_IDS.slice(0, state.heat.wantedLevel).map((id, index) => {
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
            quality={visualQuality}
            steering={driving ? input.steer : 0}
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
          enabled: true,
          anchor: targetPose.position,
          intensity: phaseId === AFTERLIGHT_PHASE_IDS.blackout ? 0.82 : 0.46,
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

export const AFTERLIGHT_SCENE_TARGETS = Object.freeze({
  [AFTERLIGHT_PHASE_IDS.boost]: AFTERLIGHT_LANDMARKS.boostYard,
  [AFTERLIGHT_PHASE_IDS.keyholder]: AFTERLIGHT_LANDMARKS.courierRouteStart,
  [AFTERLIGHT_PHASE_IDS.vault]: AFTERLIGHT_LANDMARKS.vaultReader,
  [AFTERLIGHT_PHASE_IDS.blackout]: AFTERLIGHT_LANDMARKS.substationControl,
  [AFTERLIGHT_PHASE_IDS.run]: AFTERLIGHT_LANDMARKS.bridgeLaunch,
  [AFTERLIGHT_PHASE_IDS.debrief]: AFTERLIGHT_LANDMARKS.safehouse,
});
