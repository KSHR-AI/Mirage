import type { BoxInstance, CityQuality, CityVec3 } from "./types";

export type CourierYardModelPlacement = {
  readonly id: string;
  readonly position: CityVec3;
  readonly rotationY: number;
  readonly scale: CityVec3;
};

export type CourierYardDetailPlan = {
  readonly barrels: readonly CourierYardModelPlacement[];
  readonly crateBodies: readonly BoxInstance[];
  readonly crateTrim: readonly BoxInstance[];
  readonly dockStructure: readonly BoxInstance[];
  readonly drainSlats: readonly BoxInstance[];
  readonly drains: readonly BoxInstance[];
  readonly interior: readonly BoxInstance[];
  readonly palletBoards: readonly BoxInstance[];
  readonly safetyMarkings: readonly BoxInstance[];
  readonly tireMarks: readonly BoxInstance[];
};

function box(
  id: string,
  position: CityVec3,
  scale: CityVec3,
  color: string,
  rotationY = 0,
): BoxInstance {
  return { color, id, position, rotationY, scale };
}

function pallet(
  id: string,
  center: CityVec3,
  rotationY: number,
): BoxInstance[] {
  const [x, y, z] = center;
  const boards: BoxInstance[] = [];
  for (let index = -3; index <= 3; index += 1) {
    boards.push(
      box(
        `${id}-deck-${index + 3}`,
        [x + index * 0.19, y + 0.16, z],
        [0.15, 0.09, 1.18],
        index % 2 === 0 ? "#75523a" : "#65452f",
        rotationY,
      ),
    );
  }
  for (const offset of [-0.43, 0, 0.43]) {
    boards.push(
      box(
        `${id}-runner-${offset}`,
        [x, y + 0.04, z + offset],
        [1.32, 0.14, 0.12],
        "#493326",
        rotationY,
      ),
    );
  }
  return boards;
}

function crate(
  id: string,
  position: CityVec3,
  scale: CityVec3,
  rotationY: number,
): { body: BoxInstance; trim: BoxInstance[] } {
  const [x, y, z] = position;
  const [width, height, depth] = scale;
  const trimColor = "#3d2b22";
  return {
    body: box(id, position, scale, "#886346", rotationY),
    trim: [
      box(
        `${id}-top`,
        [x, y + height / 2 - 0.055, z],
        [width + 0.04, 0.11, depth + 0.04],
        trimColor,
        rotationY,
      ),
      box(
        `${id}-bottom`,
        [x, y - height / 2 + 0.055, z],
        [width + 0.04, 0.11, depth + 0.04],
        trimColor,
        rotationY,
      ),
      box(
        `${id}-band-a`,
        [x - width * 0.28, y, z + depth / 2 + 0.012],
        [0.1, height * 0.88, 0.045],
        trimColor,
        rotationY,
      ),
      box(
        `${id}-band-b`,
        [x + width * 0.28, y, z + depth / 2 + 0.012],
        [0.1, height * 0.88, 0.045],
        trimColor,
        rotationY,
      ),
    ],
  };
}

function createDrainPlan(): {
  drains: BoxInstance[];
  drainSlats: BoxInstance[];
} {
  const drains = [
    box("yard-drain-west", [64.2, 0.314, 45.2], [6.4, 0.025, 0.34], "#162327"),
    box("yard-drain-east", [73.5, 0.314, 45.2], [5.4, 0.025, 0.34], "#162327"),
  ];
  const drainSlats = drains.flatMap((drain) => {
    const width = drain.scale[0];
    const count = Math.floor(width / 0.28);
    return Array.from({ length: count }, (_, index) =>
      box(
        `${drain.id}-slat-${index}`,
        [
          drain.position[0] - width / 2 + 0.14 + index * 0.28,
          0.334,
          drain.position[2],
        ],
        [0.045, 0.025, 0.3],
        "#657478",
      ),
    );
  });
  return { drains, drainSlats };
}

export function createCourierYardDetailPlan(
  quality: CityQuality,
): CourierYardDetailPlan {
  const desktop = quality === "desktop";
  const dockStructure = [
    box("open-bay-aperture", [70, 2.46, 36.71], [4.08, 4.25, 0.08], "#071014"),
    box(
      "open-bay-jamb-west",
      [67.86, 2.5, 37.02],
      [0.24, 4.65, 0.62],
      "#1f3034",
    ),
    box(
      "open-bay-jamb-east",
      [72.14, 2.5, 37.02],
      [0.24, 4.65, 0.62],
      "#1f3034",
    ),
    box("open-bay-header", [70, 4.84, 37.02], [4.55, 0.26, 0.62], "#1b2a2e"),
    box("open-bay-ramp", [70, 0.24, 37.55], [4.3, 0.22, 1.65], "#4e5a59"),
    box(
      "open-bay-bollard-west",
      [67.7, 0.78, 38.2],
      [0.16, 0.96, 0.16],
      "#d5bd45",
    ),
    box(
      "open-bay-bollard-east",
      [72.3, 0.78, 38.2],
      [0.16, 0.96, 0.16],
      "#d5bd45",
    ),
  ];
  const interior = [
    box("open-bay-ceiling", [70, 4.3, 37.12], [3.76, 0.13, 0.44], "#dda85e"),
    box(
      "open-bay-workbench",
      [71.15, 0.85, 37.2],
      [1.35, 0.72, 0.52],
      "#26383b",
    ),
    box(
      "open-bay-tool-cabinet",
      [71.55, 1.28, 36.98],
      [0.58, 1.72, 0.36],
      "#8f3f39",
    ),
    box("open-bay-shelf", [68.62, 1.38, 37.02], [0.88, 2.05, 0.34], "#314347"),
    box(
      "open-bay-shelf-a",
      [68.62, 0.85, 37.24],
      [0.76, 0.08, 0.42],
      "#899291",
    ),
    box(
      "open-bay-shelf-b",
      [68.62, 1.42, 37.24],
      [0.76, 0.08, 0.42],
      "#899291",
    ),
    box(
      "open-bay-shelf-c",
      [68.62, 1.99, 37.24],
      [0.76, 0.08, 0.42],
      "#899291",
    ),
  ];

  const crateDefinitions = [
    crate("dock-crate-a", [62.15, 0.68, 39.45], [1.08, 0.82, 0.92], 0.08),
    ...(desktop
      ? [
          crate("dock-crate-b", [63.2, 0.62, 39.72], [0.88, 0.7, 0.76], -0.12),
          crate("dock-crate-c", [62.45, 1.38, 39.5], [0.82, 0.62, 0.7], 0.05),
          crate("dock-crate-d", [75.8, 0.61, 39.1], [0.84, 0.7, 0.74], 0.16),
          crate("dock-crate-e", [76.54, 0.54, 39.46], [0.68, 0.56, 0.65], -0.1),
        ]
      : []),
  ];
  const drainPlan = createDrainPlan();
  const tireMarks = desktop
    ? Array.from({ length: 12 }, (_, index) => {
        const lane = index % 2;
        const segment = Math.floor(index / 2);
        return box(
          `yard-tire-mark-${lane}-${segment}`,
          [63.36 + lane * 0.72, 0.319, 43.2 + segment * 1.72],
          [0.1, 0.016, 1.18],
          "#20292a",
          -0.028 + lane * 0.012,
        );
      })
    : [];
  const safetyMarkings = [
    box(
      "bay-chevron-west",
      [67.58, 0.323, 39.08],
      [0.18, 0.018, 1.25],
      "#e4cb49",
      -0.48,
    ),
    box(
      "bay-chevron-east",
      [72.42, 0.323, 39.08],
      [0.18, 0.018, 1.25],
      "#e4cb49",
      0.48,
    ),
    box("bay-stop-line", [70, 0.323, 39.72], [4.72, 0.018, 0.12], "#d8c84d"),
  ];
  const barrels: CourierYardModelPlacement[] = [
    {
      id: "yard-barrel-a",
      position: [76.15, 0.31, 40.4],
      rotationY: 0.12,
      scale: [1, 1, 1],
    },
    ...(desktop
      ? [
          {
            id: "yard-barrel-b",
            position: [76.82, 0.31, 40.76] as CityVec3,
            rotationY: -0.2,
            scale: [1, 1, 1] as CityVec3,
          },
          {
            id: "yard-barrel-c",
            position: [61.55, 0.31, 41.35] as CityVec3,
            rotationY: 0.34,
            scale: [1, 1, 1] as CityVec3,
          },
        ]
      : []),
  ];

  return {
    barrels,
    crateBodies: crateDefinitions.map((value) => value.body),
    crateTrim: crateDefinitions.flatMap((value) => value.trim),
    dockStructure,
    drainSlats: desktop ? drainPlan.drainSlats : [],
    drains: drainPlan.drains,
    interior,
    palletBoards: [
      ...pallet("dock-pallet-west", [62.6, 0.32, 39.5], 0.05),
      ...(desktop ? pallet("dock-pallet-east", [76.2, 0.32, 39.3], -0.08) : []),
    ],
    safetyMarkings,
    tireMarks,
  };
}
