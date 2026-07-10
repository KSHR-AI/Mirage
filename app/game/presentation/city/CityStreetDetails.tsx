"use client";

import { memo, useMemo } from "react";
import { InstancedPrimitives } from "./InstancedPrimitives";
import type {
  BoxInstance,
  CityLayout,
  PointFeature,
  StreetProp,
} from "./types";

type CityStreetDetailsProps = {
  layout: CityLayout;
};

export const CityStreetDetails = memo(function CityStreetDetails({
  layout,
}: CityStreetDetailsProps) {
  const lights = useMemo(
    () => createStreetlightParts(layout.streetlights),
    [layout.streetlights],
  );
  const signals = useMemo(
    () => createTrafficSignalParts(layout.trafficSignals),
    [layout.trafficSignals],
  );
  const vegetation = useMemo(
    () => createTreeParts(layout.trees),
    [layout.trees],
  );

  return (
    <group name="street-furniture">
      <InstancedPrimitives
        instances={lights.poles}
        metalness={0.72}
        roughness={0.36}
      />
      <InstancedPrimitives
        instances={lights.arms}
        metalness={0.72}
        roughness={0.36}
      />
      <InstancedPrimitives
        depthWrite={false}
        instances={lights.bulbs}
        material="basic"
        shape="sphere"
        toneMapped={false}
      />
      <InstancedPrimitives
        depthWrite={false}
        instances={lights.halos}
        material="basic"
        opacity={0.12}
        shape="sphere"
        toneMapped={false}
        transparent
      />

      <InstancedPrimitives
        instances={vegetation.trunks}
        roughness={0.98}
        shape="cylinder"
      />
      <InstancedPrimitives
        instances={vegetation.crowns}
        roughness={0.9}
        shape="icosahedron"
      />

      <InstancedPrimitives
        instances={signals.poles}
        metalness={0.7}
        roughness={0.4}
      />
      <InstancedPrimitives
        instances={signals.arms}
        metalness={0.7}
        roughness={0.4}
      />
      <InstancedPrimitives
        instances={signals.heads}
        metalness={0.28}
        roughness={0.66}
      />
      <InstancedPrimitives
        instances={signals.lamps}
        material="basic"
        shape="sphere"
        toneMapped={false}
      />

      <StreetProps props={layout.props} />
    </group>
  );
});

function createStreetlightParts(features: readonly PointFeature[]) {
  const poles: BoxInstance[] = [];
  const arms: BoxInstance[] = [];
  const bulbs: BoxInstance[] = [];
  const halos: BoxInstance[] = [];

  for (const feature of features) {
    const armCenter = offset(feature.position, feature.rotationY, 0.48, 5.05);
    const lamp = offset(feature.position, feature.rotationY, 0.98, 4.92);
    poles.push(
      instance(
        `${feature.id}-pole`,
        feature.position,
        [0.12, 5.2, 0.12],
        "#24343a",
        2.6,
      ),
    );
    arms.push({
      color: "#24343a",
      id: `${feature.id}-arm`,
      position: armCenter,
      rotationY: feature.rotationY,
      scale: [1.12, 0.11, 0.11],
    });
    bulbs.push({
      color: feature.color,
      id: `${feature.id}-bulb`,
      position: lamp,
      rotationY: 0,
      scale: [0.28, 0.2, 0.28],
    });
    halos.push({
      color: feature.color,
      id: `${feature.id}-halo`,
      position: lamp,
      rotationY: 0,
      scale: [0.92, 0.62, 0.92],
    });
  }
  return { arms, bulbs, halos, poles };
}

function createTrafficSignalParts(features: readonly PointFeature[]) {
  const poles: BoxInstance[] = [];
  const arms: BoxInstance[] = [];
  const heads: BoxInstance[] = [];
  const lamps: BoxInstance[] = [];

  for (const feature of features) {
    poles.push(
      instance(
        `${feature.id}-pole`,
        feature.position,
        [0.14, 4.9, 0.14],
        "#243238",
        2.45,
      ),
    );
    arms.push({
      color: "#243238",
      id: `${feature.id}-arm`,
      position: offset(feature.position, feature.rotationY, 1.65, 4.62),
      rotationY: feature.rotationY,
      scale: [3.4, 0.13, 0.13],
    });
    const headPosition = offset(feature.position, feature.rotationY, 3.2, 4.35);
    heads.push({
      color: "#172226",
      id: `${feature.id}-head`,
      position: headPosition,
      rotationY: feature.rotationY,
      scale: [0.46, 1.08, 0.46],
    });
    lamps.push({
      color: feature.color,
      id: `${feature.id}-lamp`,
      position: offset(
        headPosition,
        feature.rotationY + Math.PI / 2,
        0.25,
        0.08,
      ),
      rotationY: 0,
      scale: [0.21, 0.21, 0.21],
    });
  }
  return { arms, heads, lamps, poles };
}

function createTreeParts(features: readonly PointFeature[]) {
  return {
    crowns: features.map((feature) => ({
      color: feature.color,
      id: `${feature.id}-crown`,
      position: [
        feature.position[0],
        feature.position[1] + 3.25,
        feature.position[2],
      ] as [number, number, number],
      rotationY: feature.rotationY,
      scale: [2.35, 2.85, 2.35] as [number, number, number],
    })),
    trunks: features.map((feature) => ({
      color: "#4c3c34",
      id: `${feature.id}-trunk`,
      position: [
        feature.position[0],
        feature.position[1] + 1.25,
        feature.position[2],
      ] as [number, number, number],
      rotationY: feature.rotationY,
      scale: [0.34, 2.5, 0.34] as [number, number, number],
    })),
  };
}

function StreetProps({ props }: { props: readonly StreetProp[] }) {
  const batches = useMemo(() => {
    const byKind = new Map<StreetProp["kind"], BoxInstance[]>();
    for (const prop of props) {
      const values = byKind.get(prop.kind) ?? [];
      values.push(propToInstance(prop));
      byKind.set(prop.kind, values);
    }
    return byKind;
  }, [props]);

  return (
    <group name="street-props">
      {Array.from(batches.entries()).map(([kind, instances]) => (
        <InstancedPrimitives
          instances={instances}
          key={kind}
          metalness={kind === "bollard" || kind === "hydrant" ? 0.46 : 0.16}
          roughness={0.62}
          shape={kind === "bollard" || kind === "hydrant" ? "cylinder" : "box"}
        />
      ))}
    </group>
  );
}

function propToInstance(prop: StreetProp): BoxInstance {
  const dimensions: Record<StreetProp["kind"], [number, number, number]> = {
    barrier: [1.65, 0.72, 0.28],
    bin: [0.66, 1.04, 0.66],
    bollard: [0.26, 0.9, 0.26],
    hydrant: [0.44, 0.76, 0.44],
    newsbox: [0.7, 1.2, 0.56],
  };
  const scale = dimensions[prop.kind];
  return {
    color: prop.color,
    id: prop.id,
    position: [
      prop.position[0],
      prop.position[1] + scale[1] / 2,
      prop.position[2],
    ],
    rotationY: prop.rotationY,
    scale,
  };
}

function instance(
  id: string,
  base: [number, number, number],
  scale: [number, number, number],
  color: string,
  yOffset: number,
): BoxInstance {
  return {
    color,
    id,
    position: [base[0], base[1] + yOffset, base[2]],
    rotationY: 0,
    scale,
  };
}

function offset(
  base: [number, number, number],
  rotationY: number,
  distance: number,
  y: number,
): [number, number, number] {
  return [
    base[0] + Math.cos(rotationY) * distance,
    base[1] + y,
    base[2] - Math.sin(rotationY) * distance,
  ];
}
