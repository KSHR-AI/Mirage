import type { VehicleClass } from "../game/engine";

export const FIXED_TIMESTEP = 1 / 60;
export const WORLD_WIDTH = 120;
export const WORLD_DEPTH = 100;
export const ROAD_WIDTH = 16;

export interface Vehicle3DProfile {
  label: string;
  trait: string;
  color: number;
  mass: number;
  engineForce: number;
  brakeForce: number;
  maxSpeed: number;
  reverseSpeed: number;
  steeringTorque: number;
  grip: number;
  driftGrip: number;
  maxHealth: number;
  damageMultiplier: number;
  packageDamageMultiplier: number;
  width: number;
  height: number;
  length: number;
}

export const VEHICLE_3D_PROFILES: Record<VehicleClass, Vehicle3DProfile> = {
  sport: {
    label: "Flash",
    trait: "Fast · fragile",
    color: 0x58c9d6,
    mass: 950,
    engineForce: 18_500,
    brakeForce: 14_000,
    maxSpeed: 34,
    reverseSpeed: 11,
    steeringTorque: 5_600,
    grip: 9.5,
    driftGrip: 2.1,
    maxHealth: 72,
    damageMultiplier: 1.28,
    packageDamageMultiplier: 1.15,
    width: 2,
    height: 0.8,
    length: 4.2,
  },
  muscle: {
    label: "Bruiser",
    trait: "Strong · heavy",
    color: 0xf06842,
    mass: 1_280,
    engineForce: 20_500,
    brakeForce: 16_500,
    maxSpeed: 28,
    reverseSpeed: 10,
    steeringTorque: 4_800,
    grip: 8.4,
    driftGrip: 1.8,
    maxHealth: 118,
    damageMultiplier: 0.82,
    packageDamageMultiplier: 0.78,
    width: 2.15,
    height: 0.92,
    length: 4.65,
  },
  van: {
    label: "Lockbox",
    trait: "Armored · protective",
    color: 0x7dbf83,
    mass: 1_680,
    engineForce: 21_000,
    brakeForce: 18_000,
    maxSpeed: 22,
    reverseSpeed: 8,
    steeringTorque: 4_100,
    grip: 7.7,
    driftGrip: 1.45,
    maxHealth: 155,
    damageMultiplier: 0.62,
    packageDamageMultiplier: 0.38,
    width: 2.35,
    height: 1.35,
    length: 5.05,
  },
};

export interface BuildingSpec {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: number;
}

const BUILDING_COLORS = [
  0xe36b3f, 0xd5ab4d, 0x4f8d83, 0xc7c6ad, 0xb7534f, 0x6c7d6f,
];

export const CITY_BUILDINGS: BuildingSpec[] = [
  { x: -19.5, z: -15, width: 33, depth: 24, height: 12 },
  { x: 19.5, z: -15, width: 33, depth: 24, height: 17 },
  { x: -19.5, z: 15, width: 33, depth: 24, height: 9 },
  { x: 19.5, z: 15, width: 33, depth: 24, height: 14 },
].map((building, index) => ({
  ...building,
  id: `building-${index}`,
  color: BUILDING_COLORS[index % BUILDING_COLORS.length],
}));

export const ROAD_SEGMENTS = [
  { x: 0, z: -35, width: WORLD_WIDTH, depth: ROAD_WIDTH },
  { x: 0, z: 35, width: WORLD_WIDTH, depth: ROAD_WIDTH },
  { x: -45, z: 0, width: ROAD_WIDTH, depth: WORLD_DEPTH },
  { x: 45, z: 0, width: ROAD_WIDTH, depth: WORLD_DEPTH },
] as const;

export const TRAFFIC_ROUTE = [
  { x: -45, z: 27 },
  { x: -45, z: -35 },
  { x: 45, z: -35 },
  { x: 45, z: 35 },
  { x: -45, z: 35 },
] as const;

export const STARTER_POSITION = { x: -45, y: 0.9, z: 17, yaw: 0 };
export const FOOT_START = { x: -49, y: 1.1, z: 18.5 };
export const PACKAGE_POSITION = { x: 45, y: 0.35, z: -18 };
export const DELIVERY_POSITION = { x: -45, y: 0.2, z: -24 };

export interface RampSpec {
  id: string;
  x: number;
  z: number;
  yaw: number;
  tiltAxis: "x" | "z";
  tilt: number;
}

export const RAMPS: RampSpec[] = [
  {
    id: "south-ramp",
    x: 13,
    z: -35,
    yaw: 0,
    tiltAxis: "z",
    tilt: 0.2,
  },
  {
    id: "east-ramp",
    x: 45,
    z: 12,
    yaw: 0,
    tiltAxis: "x",
    tilt: 0.2,
  },
];

export interface PropSpec {
  id: string;
  x: number;
  z: number;
  kind: "crate" | "cone" | "hydrant";
  value: number;
}

export const BREAKABLE_PROPS: PropSpec[] = [
  { id: "crate-0", x: -19, z: -35, kind: "crate", value: 90 },
  { id: "crate-1", x: -16.5, z: -35, kind: "crate", value: 90 },
  { id: "cone-0", x: 45, z: 22, kind: "cone", value: 50 },
  { id: "cone-1", x: 45, z: 25, kind: "cone", value: 50 },
  { id: "hydrant-0", x: -45, z: -8, kind: "hydrant", value: 120 },
  { id: "hydrant-1", x: 25, z: 35, kind: "hydrant", value: 120 },
];
