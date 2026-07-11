import { hashCitySeed } from "./seed";
import type {
  BoxInstance,
  BuildingInstance,
  CityDistrict,
  CityQuality,
  CityVec3,
} from "./types";

export type FacadeDetailPlan = {
  readonly frames: readonly BoxInstance[];
  readonly glazing: readonly BoxInstance[];
  readonly structure: readonly BoxInstance[];
};

type FacadeDetailOptions = {
  readonly buildings: readonly BuildingInstance[];
  readonly quality: CityQuality;
  readonly windows: readonly BoxInstance[];
};

const GLASS_COLORS = ["#10242a", "#132b31", "#182a30", "#102d32"] as const;
const TRIM_COLORS: Record<CityDistrict, string> = {
  afterlight: "#26373a",
  breakwater: "#2f3d3f",
  civic: "#383e3e",
  grid: "#283337",
  industrial: "#313a3a",
  "painted-row": "#392f3a",
};
const AWNING_COLORS: Record<CityDistrict, string> = {
  afterlight: "#4d9fa3",
  breakwater: "#d3705f",
  civic: "#d2a653",
  grid: "#9abd55",
  industrial: "#b86c58",
  "painted-row": "#b7677a",
};

function detail(
  id: string,
  position: CityVec3,
  scale: CityVec3,
  color: string,
  rotationY = 0,
): BoxInstance {
  return { color, id, position, rotationY, scale };
}

function localPosition(
  building: BuildingInstance,
  localX: number,
  y: number,
  localZ: number,
): CityVec3 {
  const cosine = Math.cos(building.rotationY);
  const sine = Math.sin(building.rotationY);
  return [
    building.position[0] + cosine * localX + sine * localZ,
    y,
    building.position[2] - sine * localX + cosine * localZ,
  ];
}

function stableChoice<T>(id: string, values: readonly T[]): T {
  return values[hashCitySeed(id) % values.length] as T;
}

function addWindowBay(
  glazing: BoxInstance[],
  frames: BoxInstance[],
  window: BoxInstance,
  quality: CityQuality,
) {
  const southFacing = window.scale[0] >= window.scale[2];
  const length = southFacing ? window.scale[0] : window.scale[2];
  const glassColor = stableChoice(`${window.id}:glass`, GLASS_COLORS);
  const glazingPosition: CityVec3 = southFacing
    ? [window.position[0], window.position[1], window.position[2] - 0.025]
    : [window.position[0] - 0.025, window.position[1], window.position[2]];
  const facadeRotation = window.rotationY + (southFacing ? 0 : Math.PI / 2);
  glazing.push(
    detail(
      `${window.id}-glazing`,
      glazingPosition,
      [length, 1.42, 1],
      glassColor,
      facadeRotation,
    ),
  );

  const frameColor = "#111a1d";
  for (const verticalOffset of [-0.75, 0.75]) {
    frames.push(
      detail(
        `${window.id}-frame-${verticalOffset < 0 ? "bottom" : "top"}`,
        [
          window.position[0] + (southFacing ? 0 : 0.025),
          window.position[1] + verticalOffset,
          window.position[2] + (southFacing ? 0.025 : 0),
        ],
        [length + 0.14, 0.08, 1],
        frameColor,
        facadeRotation,
      ),
    );
  }

  const divisions =
    quality === "desktop"
      ? Math.max(2, Math.min(3, Math.round(length / 1.55)))
      : 2;
  for (let division = 1; division < divisions; division += 1) {
    const offset = -length / 2 + (length * division) / divisions;
    frames.push(
      detail(
        `${window.id}-mullion-${division}`,
        southFacing
          ? [
              window.position[0] + offset,
              window.position[1],
              window.position[2] + 0.025,
            ]
          : [
              window.position[0] + 0.025,
              window.position[1],
              window.position[2] + offset,
            ],
        [0.075, 1.46, 1],
        frameColor,
        facadeRotation,
      ),
    );
  }
}

function addStorefront(
  glazing: BoxInstance[],
  structure: BoxInstance[],
  building: BuildingInstance,
  side: "east" | "south",
  baseY: number,
) {
  const width = building.scale[0];
  const depth = building.scale[2];
  const southFacing = side === "south";
  const length = (southFacing ? width : depth) * 0.7;
  const faceX = southFacing ? 0 : width / 2 + 0.055;
  const faceZ = southFacing ? depth / 2 + 0.055 : 0;
  const centerY = baseY + 1.32;
  const glassColor = stableChoice(`${building.id}:${side}:shop`, GLASS_COLORS);
  glazing.push(
    detail(
      `${building.id}-${side}-storefront`,
      localPosition(building, faceX, centerY, faceZ),
      [length, 1.86, 1],
      glassColor,
      building.rotationY + (southFacing ? 0 : Math.PI / 2),
    ),
  );

  const frameColor = "#1b292d";
  for (const offset of [-length / 2, 0, length / 2]) {
    structure.push(
      detail(
        `${building.id}-${side}-storefront-post-${offset.toFixed(2)}`,
        localPosition(
          building,
          southFacing ? offset : faceX + 0.035,
          centerY,
          southFacing ? faceZ + 0.035 : offset,
        ),
        southFacing ? [0.09, 1.98, 0.12] : [0.12, 1.98, 0.09],
        frameColor,
        building.rotationY,
      ),
    );
  }
  structure.push(
    detail(
      `${building.id}-${side}-storefront-header`,
      localPosition(
        building,
        southFacing ? 0 : faceX + 0.04,
        baseY + 2.32,
        southFacing ? faceZ + 0.04 : 0,
      ),
      southFacing ? [length + 0.18, 0.12, 0.14] : [0.14, 0.12, length + 0.18],
      frameColor,
      building.rotationY,
    ),
    detail(
      `${building.id}-${side}-awning`,
      localPosition(
        building,
        southFacing ? 0 : faceX + 0.34,
        baseY + 2.52,
        southFacing ? faceZ + 0.34 : 0,
      ),
      southFacing ? [length + 0.32, 0.14, 0.68] : [0.68, 0.14, length + 0.32],
      AWNING_COLORS[building.district],
      building.rotationY,
    ),
  );
}

function addBuildingStructure(
  glazing: BoxInstance[],
  structure: BoxInstance[],
  building: BuildingInstance,
  quality: CityQuality,
) {
  const width = building.scale[0];
  const height = building.scale[1];
  const depth = building.scale[2];
  const baseY = building.position[1] - height / 2;
  const topY = baseY + height;
  const trim = TRIM_COLORS[building.district];

  const parapetY = topY + 0.27;
  structure.push(
    detail(
      `${building.id}-parapet-south`,
      localPosition(building, 0, parapetY, depth / 2 + 0.045),
      [width + 0.28, 0.52, 0.2],
      trim,
      building.rotationY,
    ),
    detail(
      `${building.id}-parapet-north`,
      localPosition(building, 0, parapetY, -depth / 2 - 0.045),
      [width + 0.28, 0.52, 0.2],
      trim,
      building.rotationY,
    ),
    detail(
      `${building.id}-parapet-east`,
      localPosition(building, width / 2 + 0.045, parapetY, 0),
      [0.2, 0.52, depth + 0.28],
      trim,
      building.rotationY,
    ),
    detail(
      `${building.id}-parapet-west`,
      localPosition(building, -width / 2 - 0.045, parapetY, 0),
      [0.2, 0.52, depth + 0.28],
      trim,
      building.rotationY,
    ),
  );

  addStorefront(glazing, structure, building, "south", baseY);
  if (quality === "desktop") {
    addStorefront(glazing, structure, building, "east", baseY);
  }

  const balconyEligible =
    quality === "desktop" &&
    (building.district === "painted-row" ||
      (building.district === "civic" && hashCitySeed(building.id) % 5 === 0));
  if (!balconyEligible) return;
  const levels = Math.max(0, Math.min(3, Math.floor((height - 5) / 3)));
  for (let level = 0; level < levels; level += 1) {
    const y = baseY + 4.2 + level * 3;
    const balconyWidth = width * 0.56;
    structure.push(
      detail(
        `${building.id}-balcony-${level}-deck`,
        localPosition(building, 0, y, depth / 2 + 0.48),
        [balconyWidth, 0.12, 0.96],
        "#3a4648",
        building.rotationY,
      ),
      detail(
        `${building.id}-balcony-${level}-rail`,
        localPosition(building, 0, y + 0.34, depth / 2 + 0.94),
        [balconyWidth, 0.54, 0.08],
        "#253235",
        building.rotationY,
      ),
    );
  }
}

export function createFacadeDetailPlan({
  buildings,
  quality,
  windows,
}: FacadeDetailOptions): FacadeDetailPlan {
  const frames: BoxInstance[] = [];
  const glazing: BoxInstance[] = [];
  const structure: BoxInstance[] = [];
  const detailedWindows =
    quality === "desktop"
      ? windows.filter(
          (window) => hashCitySeed(`${window.id}:facade-detail`) % 2 === 0,
        )
      : windows;
  detailedWindows.forEach((window) =>
    addWindowBay(glazing, frames, window, quality),
  );
  buildings.forEach((building) =>
    addBuildingStructure(glazing, structure, building, quality),
  );
  return { frames, glazing, structure };
}
