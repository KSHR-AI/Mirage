"use client";

import { useFrame } from "@react-three/fiber";
import { lazy, memo, Suspense, useMemo, useRef, useState } from "react";
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
  AfterlightCameraRig,
  type AfterlightCameraImpulse,
} from "../game/presentation/camera";
import {
  BayCityWorld,
  CITY_BLACKOUT_COLLAPSE_TICKS,
  type CityMissionZoneId,
  resolveCityPowerState,
} from "../game/presentation/city";
import { AfterlightMissionSetpieces } from "../game/presentation/mission";
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
  if (ground && actor.pose.position[1] > ground.height + 0.08) return "jump";
  const speed = planarSpeed(actor.velocity);
  if (combatReady && speed < 0.3) return "aim";
  if (speed > 5.8) return "run";
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

interface AmbientVehicleDefinition {
  readonly id: number;
  readonly axis: "x" | "z";
  readonly lane: number;
  readonly offset: number;
  readonly speed: number;
  readonly direction: 1 | -1;
  readonly van: boolean;
}

function createAmbientVehicles(
  count: number,
): readonly AmbientVehicleDefinition[] {
  const roads = [-84, -56, -28, 0, 28, 56, 84] as const;
  return Object.freeze(
    Array.from({ length: count }, (_, index) => ({
      id: 700 + index,
      axis: index % 2 === 0 ? ("x" as const) : ("z" as const),
      lane:
        roads[(index * 3 + 1) % roads.length] + (index % 4 < 2 ? -2.4 : 2.4),
      offset: ((index * 37 + 11) % 196) - 98,
      speed: 4.4 + (index % 5) * 0.72,
      direction: index % 3 === 0 ? (-1 as const) : (1 as const),
      van: index % 5 === 0,
    })),
  );
}

function AmbientTraffic({ quality }: { readonly quality: GameQualityTier }) {
  const count = qualitySettings(quality).trafficCount;
  const definitions = useMemo(() => createAmbientVehicles(count), [count]);
  const groups = useRef<Array<THREE.Group | null>>([]);
  const visualQuality = modelQuality(quality);

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

interface AmbientCivilianDefinition {
  readonly id: number;
  readonly x: number;
  readonly startZ: number;
  readonly direction: 1 | -1;
  readonly speed: number;
}

function createAmbientCivilians(
  count: number,
): readonly AmbientCivilianDefinition[] {
  const roads = [-84, -56, -28, 0, 28, 56, 84] as const;
  return Object.freeze(
    Array.from({ length: count }, (_, index) => ({
      id: 900 + index,
      x: roads[(index * 5 + 2) % roads.length] + (index % 2 ? 6.6 : -6.6),
      startZ: ((index * 29 + 17) % 184) - 92,
      direction: index % 2 ? (1 as const) : (-1 as const),
      speed: 0.72 + (index % 4) * 0.13,
    })),
  );
}

function AmbientCivilians({ quality }: { readonly quality: GameQualityTier }) {
  const count = qualitySettings(quality).civilianCount;
  const definitions = useMemo(() => createAmbientCivilians(count), [count]);
  const groups = useRef<Array<THREE.Group | null>>([]);
  const visualQuality = modelQuality(quality);

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
  player,
  police,
}: {
  readonly actor: ActorState;
  readonly quality: ModelQuality;
  readonly combatReady: boolean;
  readonly player?: boolean;
  readonly police?: boolean;
}) {
  const animation = animationForActor(actor, combatReady);
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
}: {
  readonly vehicle: VehicleState;
  readonly quality: ModelQuality;
}) {
  const speed = planarSpeed(vehicle.velocity);
  return (
    <HeroCoupeModel
      brakeLights={speed < 0.4}
      damage={1 - vehicle.health / 100}
      disabled={vehicle.life !== "active"}
      entityId={vehicle.id}
      headlights
      position={mutablePosition(vehicle.pose.position)}
      quality={quality}
      rotation={[0, vehicle.pose.rotationY, 0]}
      steering={0}
      wheelSpin={speed * 0.55}
    />
  );
}

export const AfterlightScene = memo(function AfterlightScene({
  state,
  snapshot,
  input,
  started,
  paused,
  reducedMotion,
  quality,
  vfxEvents,
  cameraImpulses,
}: AfterlightSceneProps) {
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
        activeZone={started ? zoneForPhase(phaseId) : null}
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
        encounterVariant={definition.encounter}
        inventory={state.inventory}
        interactionCuesVisible={started}
        phaseId={phaseId}
        quality={quality}
        reducedMotion={reducedMotion}
      />

      <AmbientTraffic quality={quality} />
      <AmbientCivilians quality={quality} />

      {!driving ? (
        <DynamicActor
          actor={player}
          combatReady={input.aim}
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
        <DynamicHeroVehicle quality={visualQuality} vehicle={hero} />
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
        aim={!driving && input.aim}
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
        targetPose={targetPose}
      />

      {quality === "high" && !reducedMotion ? (
        <Suspense fallback={null}>
          <AfterlightPostEffects
            quality={quality}
            reducedMotion={reducedMotion}
          />
        </Suspense>
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
