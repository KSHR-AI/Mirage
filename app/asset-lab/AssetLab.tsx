"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  BLOCK_ASSET_BUDGETS,
  BLOCK_BARREL,
  BLOCK_HYDRANT,
  BlockAssetModel,
  type BlockAssetQuality,
} from "../game/presentation/blocks";
import {
  ArmoredCourierModel,
  CivilianModel,
  GuardModel,
  HeroCoupeModel,
  PlayerAgentModel,
  PoliceInterceptorModel,
  PoliceOfficerModel,
  TrafficSedanModel,
  TrafficVanModel,
} from "../game/presentation/models";
import styles from "./asset-lab.module.css";

function AssetLabScene({ quality }: { readonly quality: BlockAssetQuality }) {
  return (
    <>
      <color attach="background" args={["#172326"]} />
      <fog attach="fog" args={["#172326", 24, 48]} />
      <ambientLight color="#b7d4cf" intensity={1.15} />
      <directionalLight
        castShadow
        color="#fff0cf"
        intensity={3.2}
        position={[8, 14, 10]}
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight
        color="#d85d4f"
        intensity={1.4}
        position={[-10, 5, -8]}
      />

      <group name="block-asset-lab">
        <PlayerAgentModel
          entityId="lab-player"
          position={[-6, 0, 1.8]}
          quality={quality}
        />
        <CivilianModel
          entityId="lab-civilian"
          position={[-4, 0, 1.8]}
          quality={quality}
        />
        <GuardModel
          aim
          entityId="lab-guard"
          position={[-2, 0, 1.8]}
          quality={quality}
        />
        <PoliceOfficerModel
          entityId="lab-police"
          position={[0, 0, 1.8]}
          quality={quality}
        />
        <BlockAssetModel
          asset={BLOCK_HYDRANT}
          position={[3, 0, 1.8]}
          quality={quality}
        />
        <BlockAssetModel
          asset={BLOCK_BARREL}
          position={[5, 0, 1.8]}
          quality={quality}
        />

        <HeroCoupeModel
          entityId="lab-hero"
          position={[-6, 0, -3]}
          quality={quality}
        />
        <TrafficSedanModel
          entityId="lab-sedan"
          position={[-3, 0, -3]}
          quality={quality}
        />
        <TrafficVanModel
          entityId="lab-van"
          position={[0.5, 0, -3]}
          quality={quality}
        />
        <ArmoredCourierModel
          entityId="lab-courier"
          position={[4.2, 0, -3]}
          quality={quality}
        />
        <PoliceInterceptorModel
          emergencyLights
          entityId="lab-interceptor"
          position={[8, 0, -3]}
          quality={quality}
          sirenPhase={0.25}
        />

        <mesh position={[0.8, -0.12, -0.7]} receiveShadow>
          <boxGeometry args={[22, 0.2, 10]} />
          <meshStandardMaterial
            color="#59666a"
            metalness={0.08}
            roughness={0.92}
          />
        </mesh>
        <gridHelper
          args={[22, 22, "#d8e85e", "#3b5053"]}
          position={[0.8, 0, -0.7]}
        />
      </group>

      <OrbitControls
        enableDamping
        maxDistance={30}
        maxPolarAngle={Math.PI * 0.48}
        minDistance={8}
        target={[0.8, 1, -0.7]}
      />
    </>
  );
}

export function AssetLab() {
  const [quality, setQuality] = useState<BlockAssetQuality>("desktop");
  const budget = BLOCK_ASSET_BUDGETS[quality];

  return (
    <main
      className={styles.shell}
      data-testid="asset-lab"
      data-quality={quality}
    >
      <Canvas
        camera={{ far: 80, fov: 50, near: 0.08, position: [13, 10, 17] }}
        dpr={quality === "desktop" ? [1, 1.5] : 1}
        gl={{
          antialias: quality === "desktop",
          powerPreference: "high-performance",
        }}
        shadows
      >
        <AssetLabScene quality={quality} />
      </Canvas>

      <header className={styles.toolbar}>
        <Link
          aria-label="Return to game"
          className={styles.iconButton}
          href="/"
          title="Return to game"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </Link>
        <div>
          <p className={styles.eyebrow}>MIRAGE / PROCEDURAL PIPELINE</p>
          <h1>BLOCK ASSET LAB</h1>
        </div>
        <div
          aria-label="Asset quality"
          className={styles.segmented}
          role="group"
        >
          {(["desktop", "mobile"] as const).map((option) => (
            <button
              aria-pressed={quality === option}
              className={
                quality === option ? styles.activeSegment : styles.segment
              }
              key={option}
              onClick={() => setQuality(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      <aside className={styles.readout}>
        <span>{budget.parts} PARTS / ASSET</span>
        <span>{budget.colliders} COLLIDERS</span>
        <span>{budget.sockets} SOCKETS</span>
      </aside>
    </main>
  );
}
