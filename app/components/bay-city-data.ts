export type Vec3 = [number, number, number];

export type Mission = {
  id: string;
  chapter: string;
  objective: string;
  location: string;
  target: Vec3;
  kind: "vehicle" | "checkpoint";
  reward: number;
  wanted: number;
};

export type Building = {
  id: string;
  position: Vec3;
  size: Vec3;
  color: string;
  roofColor: string;
  windowColor: string;
  style: "tower" | "terrace" | "office";
};

export const ROAD_LINES = [-70, -42, -14, 14, 42, 70];
export const BLOCK_CENTERS = [-56, -28, 0, 28, 56];
export const CAR_SPAWN: Vec3 = [14, 1.35, 72];
export const PLAYER_SPAWN: Vec3 = [10, 1.1, 74];
export const CITY_MIN = -96;
export const CITY_MAX = 96;
export const BRIDGE_END = -194;

export const MISSIONS: Mission[] = [
  {
    id: "take-the-wheel",
    chapter: "The Bay Job",
    objective: "Take the wheel.",
    location: "SoMa",
    target: CAR_SPAWN,
    kind: "vehicle",
    reward: 0,
    wanted: 0,
  },
  {
    id: "mission-echo",
    chapter: "Signal 01",
    objective: "Intercept the Mission echo.",
    location: "Mission District",
    target: [70, 0.65, 70],
    kind: "checkpoint",
    reward: 2500,
    wanted: 0,
  },
  {
    id: "north-beach-echo",
    chapter: "Signal 02",
    objective: "Cut north for the second echo.",
    location: "North Beach",
    target: [70, 0.65, -70],
    kind: "checkpoint",
    reward: 4500,
    wanted: 1,
  },
  {
    id: "twin-peaks-echo",
    chapter: "Signal 03",
    objective: "Steal the Twin Peaks signal.",
    location: "Twin Peaks",
    target: [-70, 0.65, -70],
    kind: "checkpoint",
    reward: 8000,
    wanted: 2,
  },
  {
    id: "golden-gate-run",
    chapter: "Afterlight",
    objective: "Break north across the bridge.",
    location: "Golden Gate",
    target: [0, 1.1, -183],
    kind: "checkpoint",
    reward: 20000,
    wanted: 3,
  },
];

const BUILDING_COLORS = [
  "#ef6f61",
  "#f4b860",
  "#4ca6a8",
  "#6d79a8",
  "#d97093",
  "#cad6c8",
  "#e9d8a6",
  "#7d9d88",
];

const ROOF_COLORS = ["#343d46", "#564653", "#35535a", "#5c493e"];
const WINDOW_COLORS = ["#8ae0ff", "#ffe39a", "#f7a6d2"];

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBuildings(seed = 2407): Building[] {
  const random = mulberry32(seed);
  const buildings: Building[] = [];

  for (const x of BLOCK_CENTERS) {
    for (const z of BLOCK_CENTERS) {
      if ((x === 28 && z === -28) || (x === -56 && z === 28)) continue;

      const offsets: Array<[number, number]> = [
        [-5.2, -5.2],
        [5.2, -5.2],
        [-5.2, 5.2],
        [5.2, 5.2],
      ];

      offsets.forEach(([offsetX, offsetZ], index) => {
        const centerBias = 1 - Math.min(1, Math.hypot(x, z) / 110);
        const width = 7.2 + random() * 2.4;
        const depth = 7.2 + random() * 2.4;
        const height = 7 + random() * 14 + centerBias * random() * 19;
        const colorIndex = Math.floor(random() * BUILDING_COLORS.length);
        const styleRoll = random();

        buildings.push({
          id: `${x}-${z}-${index}`,
          position: [x + offsetX, height / 2 + 0.35, z + offsetZ],
          size: [width, height, depth],
          color: BUILDING_COLORS[colorIndex],
          roofColor: ROOF_COLORS[Math.floor(random() * ROOF_COLORS.length)],
          windowColor: WINDOW_COLORS[Math.floor(random() * WINDOW_COLORS.length)],
          style: styleRoll > 0.72 ? "office" : styleRoll > 0.38 ? "terrace" : "tower",
        });
      });
    }
  }

  return buildings;
}

export function districtAt(x: number, z: number) {
  if (z < -102 && Math.abs(x) < 16) return "Golden Gate";
  if (x > 48 && z < -35) return "North Beach";
  if (x < -45 && z < -34) return "Twin Peaks";
  if (x > 45 && z > 34) return "Mission District";
  if (z > 42) return "SoMa";
  if (x > 42) return "Embarcadero";
  if (x < -42) return "Haight";
  if (z < -42) return "Nob Hill";
  return "Downtown";
}
