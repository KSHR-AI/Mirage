import { WORLD_LAYOUT } from "../../world/world-layout";
import { createCityRng, hashCitySeed, stableCityOrder } from "./seed";
import type {
  BoxInstance,
  BuildingInstance,
  CityDetailLimits,
  CityDistrict,
  CityLayout,
  CityMissionZoneId,
  CityQuality,
  CityVec3,
  MissionZone,
  PointFeature,
  StreetProp,
} from "./types";

export const CITY_ROAD_LINES = WORLD_LAYOUT.roadLines;
export const CITY_BLOCK_CENTERS = WORLD_LAYOUT.blockCenters;
export const CITY_EXTENTS = WORLD_LAYOUT.extents;

export const CITY_MISSION_ZONES: readonly MissionZone[] = [
  {
    accent: "#ffcf70",
    id: "safehouse",
    label: "Northspan Safehouse",
    position: [0, 0.3, -232],
    radius: 12,
  },
  {
    accent: "#ff735f",
    id: "courier-yard",
    label: "Courier Yard",
    position: [70, 0.3, 42],
    radius: 13,
  },
  {
    accent: "#7ee7ff",
    id: "aurora-vault",
    label: "Aurora Exchange Vault",
    position: [14, 0.3, -42],
    radius: 12,
  },
  {
    accent: "#d8ff62",
    id: "grid-seven",
    label: "Grid Seven Substation",
    position: [-70, 0.3, -42],
    radius: 13,
  },
  {
    accent: "#6de0c3",
    id: "breakwater",
    label: "Breakwater Terminal",
    position: [98, 0.3, 14],
    radius: 15,
  },
  {
    accent: "#ffa557",
    id: "ember-span",
    label: "Ember Span",
    position: [0, 0.3, -114],
    radius: 14,
  },
  {
    accent: "#ef8cff",
    id: "afterlight-spire",
    label: "Afterlight Spire",
    position: [42, 0.3, -42],
    radius: 11,
  },
] as const;

export const CITY_DETAIL_LIMITS: Record<CityQuality, CityDetailLimits> = {
  desktop: {
    crosswalks: 192,
    laneMarks: 256,
    neonSigns: 28,
    props: 84,
    puddles: 44,
    streetlights: 84,
    trafficSignals: 30,
    trees: 60,
    windows: 1_400,
  },
  mobile: {
    crosswalks: 88,
    laneMarks: 128,
    neonSigns: 12,
    props: 34,
    puddles: 18,
    streetlights: 38,
    trafficSignals: 14,
    trees: 28,
    windows: 520,
  },
};

const FACADE_PALETTES: Record<CityDistrict, readonly string[]> = {
  afterlight: ["#263842", "#304851", "#4c5557", "#23313d", "#665b58"],
  breakwater: ["#315965", "#46727a", "#8b8273", "#48525a", "#6c4e4d"],
  civic: ["#52636a", "#77756f", "#41545d", "#8b796c", "#36545a"],
  grid: ["#37444b", "#4c5d5c", "#685b4d", "#2d3e43"],
  industrial: ["#435159", "#6b5c4e", "#35575b", "#71514b", "#596568"],
  "painted-row": ["#a55361", "#3f7f83", "#bc814e", "#6f6190", "#557960"],
};

const WINDOW_PALETTE = ["#ffd37a", "#ff9f68", "#a9e9ef", "#f3c0ff"] as const;
const NEON_PALETTE = ["#ff547d", "#5de4dc", "#f6ce5b", "#c48cff"] as const;

type LayoutOptions = {
  quality?: CityQuality;
  seed?: number | string;
};

export const CITY_STREET_FEATURE_CLEARANCES = Object.freeze([
  Object.freeze({
    id: "opening-spawn",
    position: [64, 56] as const,
    radius: 7,
  }),
  Object.freeze({
    id: "boost-coupe",
    position: [61.3, 51] as const,
    radius: 5.5,
  }),
  Object.freeze({
    id: "courier-checkpoint",
    position: [70, 48] as const,
    radius: 5,
  }),
  Object.freeze({
    id: "vault-entry",
    position: [14, -32] as const,
    radius: 5.5,
  }),
  Object.freeze({
    id: "substation-entry",
    position: [-64, -36] as const,
    radius: 5,
  }),
  Object.freeze({
    id: "bridge-entry",
    position: [0, -106] as const,
    radius: 7,
  }),
]);

function outsideStreetFeatureClearances<T extends { position: CityVec3 }>(
  feature: T,
): boolean {
  return CITY_STREET_FEATURE_CLEARANCES.every((clearance) => {
    const dx = feature.position[0] - clearance.position[0];
    const dz = feature.position[2] - clearance.position[1];
    return dx * dx + dz * dz > clearance.radius * clearance.radius;
  });
}

function box(
  id: string,
  position: [number, number, number],
  scale: [number, number, number],
  color: string,
  rotationY = 0,
): BoxInstance {
  return { color, id, position, rotationY, scale };
}

function districtAt(x: number, z: number): CityDistrict {
  if (x < -42 && z > 28) return "painted-row";
  if (x < -42 && z < 0) return "grid";
  if (x > 42 && z > 28) return "industrial";
  if (x > 56) return "breakwater";
  if (z < 14 && x > -14) return "afterlight";
  return "civic";
}

function isReservedBlock(x: number, z: number): boolean {
  return CITY_MISSION_ZONES.some((zone) => {
    if (zone.id === "breakwater" || zone.id === "ember-span") return false;
    const dx = x - zone.position[0];
    const dz = z - zone.position[2];
    return dx * dx + dz * dz < (zone.radius + 2) ** 2;
  });
}

function heightForDistrict(
  district: CityDistrict,
  x: number,
  z: number,
  roll: number,
): number {
  switch (district) {
    case "afterlight": {
      const centerBias = Math.max(0, 1 - Math.hypot(x - 24, z + 26) / 100);
      return 18 + roll * 25 + centerBias * 19;
    }
    case "breakwater":
      return 8 + roll * 15;
    case "industrial":
      return 6 + roll * 8;
    case "painted-row":
      return 8 + roll * 10;
    case "grid":
      return 9 + roll * 15;
    default:
      return 11 + roll * 20;
  }
}

function buildArchitecture(seed: number) {
  const rng = createCityRng(seed, "architecture");
  const buildings: BuildingInstance[] = [];
  const roofDetails: BoxInstance[] = [];
  const windows: BoxInstance[] = [];

  for (const blockX of CITY_BLOCK_CENTERS) {
    for (const blockZ of CITY_BLOCK_CENTERS) {
      if (isReservedBlock(blockX, blockZ)) continue;

      const district = districtAt(blockX, blockZ);
      const occupancy = district === "industrial" ? 2 : rng.int(2, 4);
      const slots = [
        [-4.7, -4.7],
        [4.7, -4.7],
        [-4.7, 4.7],
        [4.7, 4.7],
      ] as const;

      for (let slotIndex = 0; slotIndex < occupancy; slotIndex += 1) {
        const [offsetX, offsetZ] = slots[slotIndex] as readonly [
          number,
          number,
        ];
        const width =
          district === "industrial"
            ? rng.range(8.4, 10.8)
            : rng.range(6.8, 8.8);
        const depth =
          district === "industrial"
            ? rng.range(8.4, 10.8)
            : rng.range(6.8, 8.8);
        const height = heightForDistrict(district, blockX, blockZ, rng.next());
        const x = blockX + offsetX + rng.range(-0.45, 0.45);
        const z = blockZ + offsetZ + rng.range(-0.45, 0.45);
        const id = `building-${blockX}-${blockZ}-${slotIndex}`;
        const facade = rng.pick(FACADE_PALETTES[district]);
        const roofHeight = rng.range(0.45, 1.25);

        buildings.push({
          ...box(id, [x, height / 2 + 0.34, z], [width, height, depth], facade),
          district,
          roofHeight,
        });

        roofDetails.push(
          box(
            `${id}-roof`,
            [x, height + 0.34 + roofHeight / 2, z],
            [
              width * rng.range(0.55, 0.82),
              roofHeight,
              depth * rng.range(0.55, 0.82),
            ],
            rng.bool(0.5) ? "#25343b" : "#544e4a",
          ),
        );

        if (height > 22 && rng.bool(0.68)) {
          roofDetails.push(
            box(
              `${id}-crown`,
              [x, height + 1.2 + roofHeight, z],
              [width * 0.24, rng.range(1.2, 3.4), depth * 0.24],
              rng.bool() ? "#1f3138" : "#6f665e",
            ),
          );
        }

        const floorCount = Math.max(2, Math.min(15, Math.floor(height / 3.15)));
        const windowColor = rng.pick(WINDOW_PALETTE);
        for (let floor = 0; floor < floorCount; floor += 1) {
          if (rng.bool(0.15)) continue;
          const y = 2.1 + floor * 2.85;
          if (y > height - 0.8) break;
          windows.push(
            box(
              `${id}-window-s-${floor}`,
              [x, y, z + depth / 2 + 0.035],
              [width * rng.range(0.48, 0.76), 0.24, 0.055],
              windowColor,
            ),
            box(
              `${id}-window-e-${floor}`,
              [x + width / 2 + 0.035, y, z],
              [0.055, 0.24, depth * rng.range(0.48, 0.76)],
              windowColor,
            ),
          );
        }
      }
    }
  }

  return { buildings, roofDetails, windows };
}

function buildSurfaces(seed: number, quality: CityQuality) {
  const roads: BoxInstance[] = [];
  const sidewalks: BoxInstance[] = [];
  const alleys: BoxInstance[] = [];
  const puddles: BoxInstance[] = [];

  for (const line of CITY_ROAD_LINES) {
    roads.push(
      box(
        `road-v-${line}`,
        [line, 0.08, 0],
        [WORLD_LAYOUT.roadWidth, 0.16, 208],
        "#17262d",
      ),
      box(
        `road-h-${line}`,
        [0, 0.085, line],
        [208, 0.17, WORLD_LAYOUT.roadWidth],
        "#17262d",
      ),
    );
  }

  for (const x of CITY_BLOCK_CENTERS) {
    for (const z of CITY_BLOCK_CENTERS) {
      sidewalks.push(
        box(`sidewalk-${x}-${z}`, [x, 0.19, z], [18.4, 0.22, 18.4], "#536367"),
      );
      if ((Math.abs(x + z) / 28) % 2 === 0) {
        alleys.push(
          box(`alley-${x}-${z}`, [x, 0.325, z], [2.2, 0.06, 18], "#26343a"),
        );
      }
    }
  }

  const markCandidates: BoxInstance[] = [];
  const intersectionClearance = WORLD_LAYOUT.roadWidth / 2 + 2.4;
  for (const line of CITY_ROAD_LINES) {
    for (let axis = -96; axis <= 96; axis += 12) {
      if (
        CITY_ROAD_LINES.some(
          (intersection) =>
            Math.abs(axis - intersection) < intersectionClearance,
        )
      ) {
        continue;
      }
      markCandidates.push(
        box(
          `mark-v-${line}-${axis}`,
          [line, 0.185, axis],
          [0.14, 0.025, 4.8],
          "#d8b957",
        ),
        box(
          `mark-h-${line}-${axis}`,
          [axis, 0.19, line],
          [4.8, 0.025, 0.14],
          "#d8b957",
        ),
      );
    }
  }

  const crosswalkCandidates: BoxInstance[] = [];
  const intersections = CITY_ROAD_LINES.flatMap((x) =>
    CITY_ROAD_LINES.map((z) => ({ id: `${x}-${z}`, x, z })),
  ).filter(({ x, z }) => (Math.abs(x / 28) + Math.abs(z / 28)) % 2 === 0);
  for (const { id, x, z } of intersections) {
    for (let stripe = -3; stripe <= 3; stripe += 1) {
      crosswalkCandidates.push(
        box(
          `crosswalk-a-${id}-${stripe}`,
          [x + stripe * 0.8, 0.205, z - 6.1],
          [0.42, 0.025, 2.4],
          "#b9c7c4",
        ),
        box(
          `crosswalk-b-${id}-${stripe}`,
          [x + 6.1, 0.21, z + stripe * 0.8],
          [2.4, 0.025, 0.42],
          "#b9c7c4",
        ),
      );
    }
  }

  const rng = createCityRng(seed, "wet-streets");
  for (let index = 0; index < CITY_DETAIL_LIMITS.desktop.puddles; index += 1) {
    const vertical = rng.bool();
    const road = rng.pick(CITY_ROAD_LINES);
    const travel = rng.range(-96, 96);
    const side = rng.bool() ? -2.5 : 2.5;
    puddles.push(
      box(
        `puddle-${index}`,
        vertical ? [road + side, 0.195, travel] : [travel, 0.2, road + side],
        vertical
          ? [rng.range(0.7, 1.6), 0.018, rng.range(2.2, 5.8)]
          : [rng.range(2.2, 5.8), 0.018, rng.range(0.7, 1.6)],
        rng.bool(0.2) ? "#5f7f83" : "#345c68",
      ),
    );
  }

  const limits = CITY_DETAIL_LIMITS[quality];
  return {
    alleys,
    crosswalks: crosswalkCandidates.slice(0, limits.crosswalks),
    laneMarks:
      quality === "mobile"
        ? markCandidates
            .filter((_, index) => Math.floor(index / 2) % 2 === 0)
            .slice(0, limits.laneMarks)
        : markCandidates.slice(0, limits.laneMarks),
    puddles: puddles.slice(0, limits.puddles),
    roads,
    sidewalks,
  };
}

function buildStreetFeatures(seed: number, quality: CityQuality) {
  const rng = createCityRng(seed, "street-features");
  const streetlights: PointFeature[] = [];
  const trafficSignals: PointFeature[] = [];
  const trees: PointFeature[] = [];
  const props: StreetProp[] = [];
  const neonSigns: BoxInstance[] = [];

  for (const road of CITY_ROAD_LINES) {
    for (let travel = -84; travel <= 84; travel += 28) {
      const vertical = ((road + travel) / 28) % 2 === 0;
      streetlights.push({
        color: rng.bool(0.82) ? "#ffd879" : "#85e8e6",
        id: `light-${road}-${travel}`,
        position: vertical
          ? [road + 6.25, 0.31, travel]
          : [travel, 0.31, road - 6.25],
        rotationY: vertical ? 0 : Math.PI / 2,
      });
    }
  }

  for (const x of CITY_ROAD_LINES) {
    for (const z of CITY_ROAD_LINES) {
      if ((Math.abs(x / 28) + Math.abs(z / 28)) % 2 !== 0) continue;
      trafficSignals.push({
        color: rng.bool() ? "#ff5d55" : "#65e687",
        id: `signal-${x}-${z}`,
        position: [x + 5.4, 0.3, z + 5.4],
        rotationY: rng.bool() ? 0 : Math.PI / 2,
      });
    }
  }

  for (let index = 0; index < CITY_DETAIL_LIMITS.desktop.trees; index += 1) {
    const road = rng.pick(CITY_ROAD_LINES);
    const travel = rng.range(-90, 90);
    const vertical = rng.bool();
    trees.push({
      color: rng.bool(0.25) ? "#50745c" : "#315b50",
      id: `tree-${index}`,
      position: vertical
        ? [road + (rng.bool() ? -7.1 : 7.1), 0.31, travel]
        : [travel, 0.31, road + (rng.bool() ? -7.1 : 7.1)],
      rotationY: rng.range(0, Math.PI * 2),
    });
  }

  const propKinds = [
    "barrier",
    "bin",
    "bollard",
    "hydrant",
    "newsbox",
  ] as const;
  const propColors = [
    "#e25d4f",
    "#2f6d70",
    "#d7a84d",
    "#5f6868",
    "#945b67",
  ] as const;
  for (let index = 0; index < CITY_DETAIL_LIMITS.desktop.props; index += 1) {
    const road = rng.pick(CITY_ROAD_LINES);
    const travel = rng.range(-94, 94);
    const vertical = rng.bool();
    props.push({
      color: rng.pick(propColors),
      id: `prop-${index}`,
      kind: rng.pick(propKinds),
      position: vertical
        ? [road + (rng.bool() ? -6.3 : 6.3), 0.32, travel]
        : [travel, 0.32, road + (rng.bool() ? -6.3 : 6.3)],
      rotationY: rng.range(0, Math.PI * 2),
    });
  }

  for (
    let index = 0;
    index < CITY_DETAIL_LIMITS.desktop.neonSigns;
    index += 1
  ) {
    const x = rng.pick(CITY_BLOCK_CENTERS) + (rng.bool() ? -8.9 : 8.9);
    const z = rng.pick(CITY_BLOCK_CENTERS);
    const vertical = rng.bool();
    neonSigns.push(
      box(
        `neon-${index}`,
        vertical ? [x, rng.range(3.6, 8.8), z] : [z, rng.range(3.6, 8.8), x],
        vertical
          ? [0.12, rng.range(0.8, 1.8), rng.range(1.4, 3.1)]
          : [rng.range(1.4, 3.1), rng.range(0.8, 1.8), 0.12],
        rng.pick(NEON_PALETTE),
      ),
    );
  }

  const limits = CITY_DETAIL_LIMITS[quality];
  const byStableId = <T extends { id: string }>(values: T[]) =>
    values.toSorted(
      (left, right) =>
        stableCityOrder(left.id, seed) - stableCityOrder(right.id, seed),
    );

  return {
    neonSigns: byStableId(neonSigns).slice(0, limits.neonSigns),
    props: byStableId(props)
      .filter(outsideStreetFeatureClearances)
      .slice(0, limits.props),
    streetlights: byStableId(streetlights)
      .filter(outsideStreetFeatureClearances)
      .slice(0, limits.streetlights),
    trafficSignals: byStableId(trafficSignals)
      .filter(outsideStreetFeatureClearances)
      .slice(0, limits.trafficSignals),
    trees: byStableId(trees)
      .filter(outsideStreetFeatureClearances)
      .slice(0, limits.trees),
  };
}

function selectWindows(
  windows: BoxInstance[],
  quality: CityQuality,
  seed: number,
): BoxInstance[] {
  const limit = CITY_DETAIL_LIMITS[quality].windows;
  const selected =
    quality === "desktop"
      ? windows
      : windows.filter((window) => stableCityOrder(window.id, seed) % 3 !== 0);
  return selected.slice(0, limit);
}

export function createBayCityLayout(options: LayoutOptions = {}): CityLayout {
  const quality = options.quality ?? "desktop";
  const seed = hashCitySeed(options.seed ?? "mirage-afterlight-2407");
  const architecture = buildArchitecture(seed);
  const surfaces = buildSurfaces(seed, quality);
  const street = buildStreetFeatures(seed, quality);

  return {
    ...architecture,
    ...surfaces,
    ...street,
    missionZones: CITY_MISSION_ZONES,
    quality,
    seed,
    windows: selectWindows(architecture.windows, quality, seed),
  };
}

export function cityMissionZone(id: CityMissionZoneId): MissionZone {
  const zone = CITY_MISSION_ZONES.find((candidate) => candidate.id === id);
  if (!zone) throw new Error(`Unknown Bay City mission zone: ${id}`);
  return zone;
}

export function cityLayoutFingerprint(layout: CityLayout): string {
  const values = [
    layout.seed,
    layout.quality,
    ...layout.buildings.flatMap((item) => [
      item.id,
      ...item.position.map((value) => value.toFixed(3)),
      ...item.scale.map((value) => value.toFixed(3)),
      item.color,
    ]),
    ...layout.windows.map((item) => item.id),
    ...layout.streetlights.map((item) => item.id),
    ...layout.props.map((item) => item.id),
  ];
  return hashCitySeed(values.join("|")).toString(16).padStart(8, "0");
}

export function cityLayoutCounts(layout: CityLayout) {
  return {
    buildings: layout.buildings.length,
    crosswalks: layout.crosswalks.length,
    laneMarks: layout.laneMarks.length,
    neonSigns: layout.neonSigns.length,
    props: layout.props.length,
    puddles: layout.puddles.length,
    streetlights: layout.streetlights.length,
    trafficSignals: layout.trafficSignals.length,
    trees: layout.trees.length,
    windows: layout.windows.length,
  };
}
