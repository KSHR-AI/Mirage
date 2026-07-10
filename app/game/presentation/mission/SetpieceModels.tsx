"use client";

import { memo } from "react";
import { AFTERLIGHT_LANDMARKS } from "../../core/afterlight-state";
import {
  AFTERLIGHT_ITEMS,
  type AfterlightEncounterVariantId,
} from "../../missions/afterlight-job";
import {
  ArmoredCourierModel,
  HeroCoupeModel,
  type ModelQuality,
} from "../models";
import { INTERACTION_COLORS } from "./plan";
import type {
  BlackoutSetpiecePlan,
  BoostSetpiecePlan,
  CourierSetpiecePlan,
  PursuitRoadblockPlan,
  PursuitSetpiecePlan,
  SafehouseSetpiecePlan,
  VaultSetpiecePlan,
} from "./types";

const STEEL = "#263238";
const DARK_STEEL = "#151d21";
const CONCRETE = "#596064";
const GLASS = "#b8e8ec";

function StandardMaterial({
  color,
  emissive = "#000000",
  emissiveIntensity = 0,
  metalness = 0.2,
  opacity = 1,
  roughness = 0.62,
}: {
  readonly color: string;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly metalness?: number;
  readonly opacity?: number;
  readonly roughness?: number;
}) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={metalness}
      opacity={opacity}
      roughness={roughness}
      transparent={opacity < 1}
    />
  );
}

function HazardStripe({
  color = INTERACTION_COLORS.coral,
  position,
  rotationY = 0,
  scale,
}: {
  readonly color?: string;
  readonly position: readonly [number, number, number];
  readonly rotationY?: number;
  readonly scale: readonly [number, number, number];
}) {
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <boxGeometry args={scale} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function BoostYard({ plan }: { readonly plan: BoostSetpiecePlan }) {
  const shadows = plan.quality.quality !== "low";
  const decorated = plan.quality.decorationLevel > 0;
  const premiumDetail = plan.quality.decorationLevel > 1;

  return (
    <group name="afterlight-boost-yard">
      <group position={plan.anchor}>
        <mesh position={[0, -0.48, 0]} receiveShadow>
          <boxGeometry args={[14.2, 0.16, 11.8]} />
          <StandardMaterial color="#20282a" metalness={0.14} roughness={0.9} />
        </mesh>

        <mesh position={[0, -0.36, -0.1]} receiveShadow>
          <boxGeometry args={[6.15, 0.08, 8.5]} />
          <StandardMaterial color="#303a3c" metalness={0.3} roughness={0.68} />
        </mesh>

        {[-1, 1].map((side) => (
          <group key={`boost-yard-edge-${side}`}>
            <mesh position={[side * 6.72, -0.31, 0]}>
              <boxGeometry args={[0.34, 0.26, 10.8]} />
              <StandardMaterial
                color="#4b5556"
                metalness={0.28}
                roughness={0.72}
              />
            </mesh>
            <HazardStripe
              color="#899493"
              position={[side * 2.82, -0.3, -0.1]}
              scale={[0.07, 0.025, 8.45]}
            />
          </group>
        ))}

        {[-1, 1].map((side) => (
          <mesh
            castShadow={shadows}
            key={`boost-canopy-post-${side}`}
            position={[side * 4.92, 1.82, -3.65]}
          >
            <boxGeometry args={[0.32, 4.5, 0.32]} />
            <StandardMaterial
              color="#3d484a"
              metalness={0.62}
              roughness={0.38}
            />
          </mesh>
        ))}

        {[-3.65, 3.65].map((z) => (
          <mesh castShadow={shadows} key={z} position={[0, 4.06, z]}>
            <boxGeometry args={[10.16, 0.34, 0.4]} />
            <StandardMaterial
              color="#333e40"
              metalness={0.66}
              roughness={0.34}
            />
          </mesh>
        ))}

        {[-1, 1].map((side) => (
          <mesh
            castShadow={shadows}
            key={`boost-canopy-rail-${side}`}
            position={[side * 4.92, 4.06, 0]}
          >
            <boxGeometry args={[0.4, 0.34, 7.3]} />
            <StandardMaterial
              color="#333e40"
              metalness={0.66}
              roughness={0.34}
            />
          </mesh>
        ))}

        {[-1, 1].map((side) => (
          <group key={`boost-practical-${side}`}>
            <mesh position={[side * 2.15, 3.84, -0.25]}>
              <boxGeometry args={[2.75, 0.08, 0.24]} />
              <StandardMaterial
                color="#f0eee5"
                emissive="#fff1c7"
                emissiveIntensity={0.9}
                metalness={0.18}
                roughness={0.24}
              />
            </mesh>
            <mesh position={[side * 4.93, 2.9, 3.4]}>
              <boxGeometry args={[0.035, 0.28, 0.12]} />
              <meshBasicMaterial
                color={
                  side < 0 ? INTERACTION_COLORS.coral : INTERACTION_COLORS.lime
                }
                toneMapped={false}
              />
            </mesh>
          </group>
        ))}

        <mesh castShadow={shadows} position={[-5.8, 1.7, -4.1]}>
          <boxGeometry args={[1.9, 3.5, 2.2]} />
          <StandardMaterial color="#354144" metalness={0.42} roughness={0.5} />
        </mesh>
        <mesh position={[-5.8, 2.05, -2.98]}>
          <boxGeometry args={[1.35, 0.82, 0.04]} />
          <StandardMaterial
            color="#122428"
            emissive={INTERACTION_COLORS.white}
            emissiveIntensity={0.34}
            metalness={0.48}
            roughness={0.2}
          />
        </mesh>

        {[-1, 1].map((side) => (
          <mesh
            castShadow={shadows}
            key={`boost-bollard-${side}`}
            position={[side * 5.25, 0.55, -4.8]}
          >
            <cylinderGeometry args={[0.18, 0.22, 2, 8]} />
            <StandardMaterial
              color="#aeb6b3"
              metalness={0.52}
              roughness={0.4}
            />
          </mesh>
        ))}

        <HazardStripe
          color={INTERACTION_COLORS.lime}
          position={[0, -0.37, 4.15]}
          scale={[8.5, 0.035, 0.13]}
        />

        {decorated ? (
          <>
            {[-2.4, 0, 2.4].map((z) => (
              <mesh castShadow={shadows} key={z} position={[0, 3.98, z]}>
                <boxGeometry args={[9.5, 0.16, 0.24]} />
                <StandardMaterial
                  color="#556063"
                  metalness={0.58}
                  roughness={0.4}
                />
              </mesh>
            ))}

            {[-1, 1].map((side) => (
              <mesh
                castShadow={shadows}
                key={`boost-service-case-${side}`}
                position={[side * 5.72, 0.08, -3.92]}
              >
                <boxGeometry args={[1.05, 0.88, 1.25]} />
                <StandardMaterial
                  color={side < 0 ? "#4d4540" : "#465456"}
                  metalness={0.38}
                  roughness={0.62}
                />
              </mesh>
            ))}

            <mesh position={[4.7, 2.2, -4.1]}>
              <boxGeometry args={[0.18, 4.4, 0.18]} />
              <StandardMaterial
                color="#788281"
                metalness={0.64}
                roughness={0.34}
              />
            </mesh>
          </>
        ) : null}

        {premiumDetail ? (
          <>
            {[-1, 1].flatMap((side) =>
              [-2.45, -0.8, 0.85, 2.5].map((z) => (
                <mesh
                  key={`boost-lane-marker-${side}-${z}`}
                  position={[side * 3.18, -0.25, z]}
                >
                  <boxGeometry args={[0.16, 0.055, 0.34]} />
                  <StandardMaterial
                    color="#d7ddd8"
                    emissive={INTERACTION_COLORS.white}
                    emissiveIntensity={0.36}
                    metalness={0.32}
                    roughness={0.26}
                  />
                </mesh>
              )),
            )}
            {[-1, 1].map((side) => (
              <mesh
                key={`boost-canopy-brace-${side}`}
                position={[side * 4.76, 3.25, 0]}
                rotation={[Math.PI / 4, 0, 0]}
              >
                <boxGeometry args={[0.12, 0.12, 1.8]} />
                <StandardMaterial
                  color="#697476"
                  metalness={0.62}
                  roughness={0.36}
                />
              </mesh>
            ))}
          </>
        ) : null}
      </group>
      {plan.heroCoupeVisible ? (
        <HeroCoupeModel
          brakeLights
          castShadow={shadows}
          entityId="afterlight-boost-coupe"
          headlights
          position={plan.anchor}
          quality={plan.quality.modelQuality}
          rotation={[0, 0, 0]}
        />
      ) : null}
      {plan.routeGateVisible ? (
        <RouteGate
          color={INTERACTION_COLORS.white}
          position={AFTERLIGHT_LANDMARKS.missionIntercept}
          quality={plan.quality.modelQuality}
          width={12}
        />
      ) : null}
    </group>
  );
}

function CourierDressing({
  quality,
  variant,
}: {
  readonly quality: ModelQuality;
  readonly variant: AfterlightEncounterVariantId;
}) {
  if (variant === "mission-decoy") {
    return (
      <group name="mission-decoy-dressing">
        <mesh position={[-4.2, 1.6, -2.8]}>
          <boxGeometry args={[5.4, 0.18, 3.6]} />
          <StandardMaterial color="#a4454c" roughness={0.72} />
        </mesh>
        {[-5.9, -2.5].map((x) => (
          <mesh key={x} position={[x, 0.74, -2.8]}>
            <boxGeometry args={[0.16, 1.8, 0.16]} />
            <StandardMaterial color={STEEL} metalness={0.48} />
          </mesh>
        ))}
        <HazardStripe position={[4.2, 0.15, 2.2]} scale={[4.6, 0.18, 0.22]} />
      </group>
    );
  }

  if (variant === "north-beach-transfer") {
    return (
      <group name="north-beach-transfer-dressing">
        <mesh position={[-4.6, 2.2, 0]}>
          <boxGeometry args={[0.28, 4.4, 7.4]} />
          <StandardMaterial color="#40535a" metalness={0.32} roughness={0.58} />
        </mesh>
        <mesh position={[-2.6, 3.9, 0]}>
          <boxGeometry args={[3.8, 0.22, 7.4]} />
          <StandardMaterial color="#51666c" metalness={0.28} roughness={0.62} />
        </mesh>
        {quality === "desktop" ? (
          <HazardStripe
            color={INTERACTION_COLORS.white}
            position={[-2.65, 3.7, 0]}
            scale={[3.55, 0.06, 0.12]}
          />
        ) : null}
      </group>
    );
  }

  return (
    <group name="embarcadero-switch-dressing">
      {[-4.8, -3.3, 4.2].map((x, index) => (
        <mesh key={x} position={[x, 0.42, index === 2 ? 2.8 : -2.7]}>
          <boxGeometry args={[1.3, 0.84, 1.5]} />
          <StandardMaterial
            color={index === 2 ? "#526c70" : "#79644d"}
            roughness={0.8}
          />
        </mesh>
      ))}
      <HazardStripe position={[3.8, 0.18, -2.7]} scale={[4.8, 0.22, 0.24]} />
      {quality === "desktop" ? (
        <mesh position={[-5.8, 2.1, 2.8]}>
          <boxGeometry args={[0.18, 4.2, 0.18]} />
          <StandardMaterial color="#9ca7a5" metalness={0.55} roughness={0.38} />
        </mesh>
      ) : null}
    </group>
  );
}

function CredentialPickup({
  position = [2.6, 0.72, 0.8],
}: {
  readonly position?: readonly [number, number, number];
}) {
  return (
    <group name={AFTERLIGHT_ITEMS.vaultCredential} position={position}>
      <mesh rotation={[0.18, 0.28, -0.08]}>
        <boxGeometry args={[0.62, 0.06, 0.4]} />
        <StandardMaterial
          color="#eaf0ea"
          emissive={INTERACTION_COLORS.lime}
          emissiveIntensity={0.42}
          metalness={0.68}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[0.15, 0.04, 0]}>
        <boxGeometry args={[0.14, 0.01, 0.24]} />
        <meshBasicMaterial color={INTERACTION_COLORS.lime} toneMapped={false} />
      </mesh>
    </group>
  );
}

function CourierEncounter({ plan }: { readonly plan: CourierSetpiecePlan }) {
  const shadows = plan.quality.quality !== "low";
  return (
    <group name={`afterlight-courier-${plan.dressing}`}>
      <group position={plan.anchor}>
        <mesh position={[0, -0.08, 0]} receiveShadow>
          <boxGeometry args={[14, 0.12, 11]} />
          <StandardMaterial color="#20292c" roughness={0.9} />
        </mesh>
        <CourierDressing
          quality={plan.quality.modelQuality}
          variant={plan.dressing}
        />
      </group>
      <ArmoredCourierModel
        castShadow={shadows}
        damage={plan.courierDisabled ? 0.74 : 0.08}
        entityId={`afterlight-courier-${plan.encounter.id}`}
        headlights={!plan.courierDisabled}
        position={plan.courierPosition}
        quality={plan.quality.modelQuality}
        rotation={[0, Math.PI / 2, plan.courierDisabled ? 0.055 : 0]}
      />
      {plan.courierDisabled ? (
        <group position={plan.courierPosition}>
          <HazardStripe position={[0, 0.05, -3.35]} scale={[5.8, 0.09, 0.12]} />
          <mesh position={[-1.35, 0.15, -2.8]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.21, 0.21, 0.24, 8]} />
            <StandardMaterial color="#121719" roughness={0.92} />
          </mesh>
        </group>
      ) : null}
      {plan.credentialVisible ? (
        <CredentialPickup
          position={[
            plan.courierPosition[0] + 2.6,
            plan.courierPosition[1] + 0.1,
            plan.courierPosition[2] + 0.8,
          ]}
        />
      ) : null}
    </group>
  );
}

function VaultCore({
  position = [5.8, 0.84, 0],
  quality,
}: {
  readonly position?: readonly [number, number, number];
  readonly quality: ModelQuality;
}) {
  return (
    <group name={AFTERLIGHT_ITEMS.afterlightCore} position={position}>
      <mesh>
        <dodecahedronGeometry args={[0.47, quality === "desktop" ? 1 : 0]} />
        <StandardMaterial
          color="#e9f5ef"
          emissive={INTERACTION_COLORS.lime}
          emissiveIntensity={0.55}
          metalness={0.52}
          roughness={0.18}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.04, 6, 24]} />
        <meshBasicMaterial
          color={INTERACTION_COLORS.white}
          toneMapped={false}
        />
      </mesh>
      {quality === "desktop" ? (
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.72, 0.025, 6, 24]} />
          <meshBasicMaterial
            color={INTERACTION_COLORS.lime}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function BearerBondCase({
  position = [5.35, 0.32, -1.75],
}: {
  readonly position?: readonly [number, number, number];
}) {
  return (
    <group name={AFTERLIGHT_ITEMS.bearerBonds} position={position}>
      <mesh>
        <boxGeometry args={[1.15, 0.48, 0.78]} />
        <StandardMaterial color="#282f31" metalness={0.52} roughness={0.36} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.4, 0.05, 0.22]} />
        <meshBasicMaterial color={INTERACTION_COLORS.lime} toneMapped={false} />
      </mesh>
    </group>
  );
}

function VaultSetpiece({ plan }: { readonly plan: VaultSetpiecePlan }) {
  const shadows = plan.quality.quality !== "low";
  const doorOffset = plan.doorOpen ? 1.46 : 0.72;
  return (
    <group name="afterlight-vault" position={plan.anchor}>
      <mesh position={[3.2, -0.08, 0]} receiveShadow>
        <boxGeometry args={[12, 0.16, 9]} />
        <StandardMaterial color="#232b2d" metalness={0.22} roughness={0.78} />
      </mesh>
      <mesh castShadow={shadows} position={[2.5, 2.2, 3.55]}>
        <boxGeometry args={[0.8, 4.4, 1.8]} />
        <StandardMaterial color={CONCRETE} metalness={0.18} roughness={0.72} />
      </mesh>
      <mesh castShadow={shadows} position={[2.5, 2.2, -3.55]}>
        <boxGeometry args={[0.8, 4.4, 1.8]} />
        <StandardMaterial color={CONCRETE} metalness={0.18} roughness={0.72} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          castShadow={shadows}
          key={side}
          position={[2.5, 1.75, side * doorOffset]}
        >
          <boxGeometry args={[0.42, 3.5, 1.38]} />
          <StandardMaterial color="#39474b" metalness={0.72} roughness={0.31} />
        </mesh>
      ))}
      <mesh castShadow={shadows} position={[0, 0.55, 0]}>
        <boxGeometry args={[0.52, 1.1, 0.72]} />
        <StandardMaterial color="#263438" metalness={0.58} roughness={0.34} />
      </mesh>
      <mesh position={[-0.27, 0.68, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.46, 0.34, 0.035]} />
        <StandardMaterial
          color="#142024"
          emissive={
            plan.readerReady
              ? INTERACTION_COLORS.lime
              : INTERACTION_COLORS.coral
          }
          emissiveIntensity={0.65}
          metalness={0.44}
          roughness={0.2}
        />
      </mesh>
      <mesh castShadow={shadows} position={[5.8, 0.18, 0]}>
        <cylinderGeometry args={[0.95, 1.12, 0.38, 10]} />
        <StandardMaterial
          color={DARK_STEEL}
          metalness={0.58}
          roughness={0.38}
        />
      </mesh>
      {plan.coreVisible ? (
        <VaultCore quality={plan.quality.modelQuality} />
      ) : null}
      {plan.bearerBondsVisible ? <BearerBondCase /> : null}
      {plan.quality.decorationLevel > 0 ? (
        <>
          <mesh position={[5.8, 1.4, 0]}>
            <cylinderGeometry args={[1.15, 1.15, 2.4, 12, 1, true]} />
            <StandardMaterial
              color={GLASS}
              metalness={0.1}
              opacity={0.16}
              roughness={0.1}
            />
          </mesh>
          <HazardStripe
            color={INTERACTION_COLORS.white}
            position={[2.06, 3.75, 0]}
            rotationY={Math.PI / 2}
            scale={[5.8, 0.1, 0.08]}
          />
        </>
      ) : null}
    </group>
  );
}

function Transformer({
  blackout,
  position,
  quality,
}: {
  readonly blackout: boolean;
  readonly position: readonly [number, number, number];
  readonly quality: ModelQuality;
}) {
  const coilColor = blackout ? "#333b3d" : "#d4dcdb";
  return (
    <group position={position}>
      <mesh position={[0, 0.65, 0]}>
        <boxGeometry args={[1.5, 1.3, 1.2]} />
        <StandardMaterial color="#344246" metalness={0.55} roughness={0.46} />
      </mesh>
      {[0, 0.34, 0.68].slice(0, quality === "desktop" ? 3 : 2).map((y) => (
        <mesh
          key={y}
          position={[0, 1.45 + y, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.48, 0.09, 6, 12]} />
          <StandardMaterial
            color={coilColor}
            emissive={blackout ? "#000000" : INTERACTION_COLORS.white}
            emissiveIntensity={blackout ? 0 : 0.12}
            metalness={0.66}
            roughness={0.33}
          />
        </mesh>
      ))}
    </group>
  );
}

function BlackoutSetpiece({ plan }: { readonly plan: BlackoutSetpiecePlan }) {
  const panelColor = plan.blackout
    ? "#111719"
    : plan.primed
      ? INTERACTION_COLORS.coral
      : INTERACTION_COLORS.lime;
  return (
    <group name="afterlight-substation" position={plan.anchor}>
      <mesh position={[0, -0.52, 0]} receiveShadow>
        <boxGeometry args={[13, 0.16, 10]} />
        <StandardMaterial color="#262d2f" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[2.2, 2.2, 1.15]} />
        <StandardMaterial color="#314044" metalness={0.52} roughness={0.43} />
      </mesh>
      <mesh position={[0, 1.22, -0.59]}>
        <boxGeometry args={[1.35, 1.05, 0.045]} />
        <StandardMaterial
          color="#132023"
          emissive={panelColor}
          emissiveIntensity={plan.blackout ? 0 : 0.55}
          metalness={0.4}
          roughness={0.18}
        />
      </mesh>
      {[-0.42, 0, 0.42].map((x, index) => (
        <mesh key={x} position={[x, 1.22, -0.64]}>
          <boxGeometry
            args={[0.12, index === 1 && plan.primed ? 0.44 : 0.3, 0.08]}
          />
          <meshBasicMaterial
            color={
              plan.blackout
                ? "#3a4243"
                : index === 1
                  ? INTERACTION_COLORS.coral
                  : INTERACTION_COLORS.lime
            }
            toneMapped={false}
          />
        </mesh>
      ))}
      <Transformer
        blackout={plan.blackout}
        position={[4.1, 0, -1.6]}
        quality={plan.quality.modelQuality}
      />
      <Transformer
        blackout={plan.blackout}
        position={[-4.1, 0, -1.6]}
        quality={plan.quality.modelQuality}
      />
      {plan.quality.decorationLevel > 0 ? (
        <>
          {[-5.7, 5.7].map((x) => (
            <mesh key={x} position={[x, 1.2, 0]}>
              <boxGeometry args={[0.1, 2.4, 8.5]} />
              <StandardMaterial
                color="#667174"
                metalness={0.55}
                roughness={0.46}
              />
            </mesh>
          ))}
          <HazardStripe
            color={plan.blackout ? "#545c5d" : INTERACTION_COLORS.coral}
            position={[0, -0.41, 3.6]}
            scale={[8.6, 0.04, 0.16]}
          />
        </>
      ) : null}
      {plan.overloadComplete ? (
        <mesh position={[0, 2.65, 0]}>
          <boxGeometry args={[1.7, 0.08, 0.08]} />
          <meshBasicMaterial
            color={INTERACTION_COLORS.white}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function RouteGate({
  color,
  position,
  quality,
  width,
}: {
  readonly color: string;
  readonly position: readonly [number, number, number];
  readonly quality: ModelQuality;
  readonly width: number;
}) {
  const height = quality === "desktop" ? 4.2 : 3.4;
  return (
    <group position={position}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * width * 0.48, height / 2, 0]}>
          <boxGeometry args={[0.24, height, 0.28]} />
          <StandardMaterial
            color="#586164"
            emissive={color}
            emissiveIntensity={0.18}
            metalness={0.52}
            roughness={0.42}
          />
        </mesh>
      ))}
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[width, 0.24, 0.28]} />
        <StandardMaterial
          color="#586164"
          emissive={color}
          emissiveIntensity={0.18}
          metalness={0.52}
          roughness={0.42}
        />
      </mesh>
      <HazardStripe
        color={color}
        position={[0, height, -0.16]}
        scale={[width * 0.72, 0.06, 0.035]}
      />
    </group>
  );
}

function BridgeRoadblock({
  roadblock,
}: {
  readonly roadblock: PursuitRoadblockPlan;
}) {
  return (
    <group
      name={`bridge-roadblock-${roadblock.id}`}
      position={roadblock.position}
      rotation={[0, roadblock.rotationY, 0]}
    >
      <mesh position={[0, 0.56, 0]}>
        <boxGeometry args={[5.7, 0.42, 0.38]} />
        <StandardMaterial color="#e6e7e2" metalness={0.24} roughness={0.56} />
      </mesh>
      {[-1.8, 0, 1.8].map((x) => (
        <HazardStripe
          key={x}
          position={[x, 0.56, -0.205]}
          scale={[0.78, 0.2, 0.035]}
        />
      ))}
      {[-2.35, 2.35].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.48, 0.44, 0.7]} />
          <StandardMaterial color="#343d40" metalness={0.32} roughness={0.62} />
        </mesh>
      ))}
      <mesh position={[0, 0.05, -1.1]}>
        <boxGeometry args={[4.8, 0.08, 0.72]} />
        <StandardMaterial color="#161c1e" metalness={0.64} roughness={0.34} />
      </mesh>
    </group>
  );
}

function PursuitSetpiece({ plan }: { readonly plan: PursuitSetpiecePlan }) {
  return (
    <group name={`afterlight-bridge-pursuit-${plan.encounter.id}`}>
      <RouteGate
        color={
          plan.launched ? INTERACTION_COLORS.coral : INTERACTION_COLORS.lime
        }
        position={plan.anchor}
        quality={plan.quality.modelQuality}
        width={14}
      />
      <RouteGate
        color={INTERACTION_COLORS.white}
        position={[0, 1.15, -218]}
        quality={plan.quality.modelQuality}
        width={14}
      />
      {plan.roadblocks.map((roadblock) => (
        <BridgeRoadblock key={roadblock.id} roadblock={roadblock} />
      ))}
      {plan.launched && !plan.escaped ? (
        <>
          <HazardStripe position={[-6.2, 0.54, -149]} scale={[0.12, 0.12, 9]} />
          <HazardStripe position={[6.2, 0.54, -149]} scale={[0.12, 0.12, 9]} />
        </>
      ) : null}
    </group>
  );
}

function SafehouseSetpiece({ plan }: { readonly plan: SafehouseSetpiecePlan }) {
  const doorHeight = plan.reached ? 2.2 : 3.7;
  return (
    <group name="afterlight-marin-safehouse" position={plan.anchor}>
      <mesh position={[0, -0.52, 0]} receiveShadow>
        <boxGeometry args={[15, 0.18, 12]} />
        <StandardMaterial color="#273033" roughness={0.86} />
      </mesh>
      <mesh position={[0, 2.75, 3.7]}>
        <boxGeometry args={[12, 5.5, 2.7]} />
        <StandardMaterial color="#586467" metalness={0.16} roughness={0.71} />
      </mesh>
      <mesh position={[0, doorHeight / 2, 2.3]}>
        <boxGeometry args={[6.6, doorHeight, 0.24]} />
        <StandardMaterial color="#222c2f" metalness={0.5} roughness={0.4} />
      </mesh>
      {[0.65, 1.3, 1.95, 2.6, 3.25].map((y) => (
        <HazardStripe
          color="#738083"
          key={y}
          position={[0, y, 2.16]}
          scale={[6.15, 0.035, 0.035]}
        />
      ))}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[1.12, 1.32, 0.4, 10]} />
        <StandardMaterial color="#182124" metalness={0.62} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.75, 0.9, 0.1, 10]} />
        <StandardMaterial
          color="#e6ede8"
          emissive={
            plan.delivered ? INTERACTION_COLORS.lime : INTERACTION_COLORS.white
          }
          emissiveIntensity={0.36}
          metalness={0.42}
          roughness={0.22}
        />
      </mesh>
      {plan.delivered ? (
        <VaultCore
          position={[0, 1.12, 0]}
          quality={plan.quality.modelQuality}
        />
      ) : null}
      {plan.bondsRetained ? (
        <BearerBondCase position={[-3.1, 0.42, 0.5]} />
      ) : null}
      {plan.quality.decorationLevel > 0 ? (
        <>
          <mesh position={[-4.3, 2.6, 2.14]}>
            <boxGeometry args={[1.4, 1.1, 0.05]} />
            <StandardMaterial
              color="#1a2b2f"
              emissive={INTERACTION_COLORS.white}
              emissiveIntensity={0.24}
              metalness={0.32}
              roughness={0.28}
            />
          </mesh>
          <HazardStripe
            color={INTERACTION_COLORS.lime}
            position={[0, -0.4, -3.7]}
            scale={[7.6, 0.04, 0.14]}
          />
        </>
      ) : null}
    </group>
  );
}

export const BoostYardSetpiece = memo(BoostYard);
export const CourierEncounterSetpiece = memo(CourierEncounter);
export const VaultMissionSetpiece = memo(VaultSetpiece);
export const BlackoutMissionSetpiece = memo(BlackoutSetpiece);
export const BridgePursuitSetpiece = memo(PursuitSetpiece);
export const MarinSafehouseSetpiece = memo(SafehouseSetpiece);
