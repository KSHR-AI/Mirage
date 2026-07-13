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
  readonly depotGlazing: readonly BoxInstance[];
  readonly depotLightPanels: readonly BoxInstance[];
  readonly depotRelief: readonly BoxInstance[];
  readonly depotRoofline: readonly BoxInstance[];
  readonly dockStructure: readonly BoxInstance[];
  readonly drainSlats: readonly BoxInstance[];
  readonly drains: readonly BoxInstance[];
  readonly interior: readonly BoxInstance[];
  readonly perimeterDetails: readonly BoxInstance[];
  readonly perimeterLights: readonly BoxInstance[];
  readonly perimeterStructure: readonly BoxInstance[];
  readonly palletBoards: readonly BoxInstance[];
  readonly safetyMarkings: readonly BoxInstance[];
  readonly tireMarks: readonly BoxInstance[];
  readonly wetPatches: readonly BoxInstance[];
};

export type CourierYardSecurityLight = {
  readonly color: string;
  readonly id: string;
  readonly intensity: number;
  readonly position: CityVec3;
};

export const COURIER_YARD_SECURITY_LIGHTS: readonly CourierYardSecurityLight[] =
  Object.freeze([
    Object.freeze({
      color: "#cdebf0",
      id: "yard-security-west",
      intensity: 15,
      position: [65.2, 5.36, 48.72] as CityVec3,
    }),
    Object.freeze({
      color: "#ffe2ad",
      id: "yard-security-east",
      intensity: 15,
      position: [74.8, 5.36, 48.72] as CityVec3,
    }),
  ]);

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
  const depotRoofline = [
    box(
      "courier-depot-roof-monitor",
      [70, 7.26, 33.5],
      [8.8, 1.16, 4.7],
      "#45575a",
    ),
    box(
      "courier-depot-roof-monitor-cap",
      [70, 7.91, 33.5],
      [9.2, 0.16, 5.08],
      "#1d2b2f",
    ),
    box(
      "courier-depot-roof-west-step",
      [63.45, 7.04, 33.45],
      [2.7, 0.72, 3.75],
      "#34464a",
    ),
    box(
      "courier-depot-roof-east-step",
      [76.55, 7.04, 33.45],
      [2.7, 0.72, 3.75],
      "#34464a",
    ),
    ...(desktop
      ? [
          box(
            "courier-depot-exhaust-stack-west",
            [62.5, 8.05, 32.7],
            [0.44, 1.85, 0.44],
            "#506064",
          ),
          box(
            "courier-depot-exhaust-cap-west",
            [62.5, 9, 32.7],
            [0.72, 0.12, 0.72],
            "#202e31",
          ),
          box(
            "courier-depot-exhaust-stack-east",
            [77.1, 7.75, 34.1],
            [0.36, 1.35, 0.36],
            "#526266",
          ),
          box(
            "courier-depot-exhaust-cap-east",
            [77.1, 8.45, 34.1],
            [0.62, 0.11, 0.62],
            "#202e31",
          ),
        ]
      : []),
  ];
  const depotGlazing = [-3.2, -1.6, 0, 1.6, 3.2].map((offset, index) =>
    box(
      `courier-depot-clerestory-${index}`,
      [70 + offset, 7.28, 35.89],
      [1.26, 0.56, 0.08],
      index === 1 || index === 4 ? "#9ec5c0" : "#172f35",
    ),
  );
  const depotLightPanels = [
    box(
      "courier-depot-clerestory-light-west",
      [68.4, 7.28, 35.84],
      [0.76, 0.3, 0.035],
      "#c8ebe4",
    ),
    box(
      "courier-depot-clerestory-light-east",
      [73.2, 7.28, 35.84],
      [0.76, 0.3, 0.035],
      "#ffe1a3",
    ),
    box(
      "courier-depot-bay-light-west",
      [64.6, 4.94, 37.52],
      [1.18, 0.08, 0.16],
      "#caebe6",
    ),
    box(
      "courier-depot-bay-light-center",
      [70, 4.94, 37.52],
      [1.18, 0.08, 0.16],
      "#ffe0a0",
    ),
    box(
      "courier-depot-bay-light-east",
      [75.4, 4.94, 37.52],
      [1.18, 0.08, 0.16],
      "#d1ece8",
    ),
  ];
  const depotRelief = [
    ...[61.05, 67.25, 72.75, 78.95].map((x, index) =>
      box(
        `courier-depot-pier-${index}`,
        [x, 3.32, 36.84],
        [0.34, 6.14, 0.46],
        index === 0 || index === 3 ? "#70807e" : "#4f6264",
      ),
    ),
    ...[62.3, 64.75, 67.2, 72.8, 75.25, 77.7].map((x, index) =>
      box(
        `courier-depot-upper-panel-${index}`,
        [x, 5.62, 36.74],
        [2.08, 0.88, 0.14],
        index % 2 === 0 ? "#5d6d6c" : "#71807d",
      ),
    ),
    box(
      "courier-depot-upper-reveal",
      [70, 5.08, 36.86],
      [17.7, 0.1, 0.12],
      "#1b2a2d",
    ),
    box(
      "courier-depot-foundation-reveal",
      [70, 0.54, 36.85],
      [17.7, 0.14, 0.14],
      "#243236",
    ),
    box(
      "courier-depot-service-conduit",
      [78.48, 3.6, 37.1],
      [0.12, 3.4, 0.12],
      "#a2aaa6",
    ),
    box(
      "courier-depot-service-box",
      [78.48, 2.55, 37.18],
      [0.72, 0.86, 0.24],
      "#405356",
    ),
  ];
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
  const perimeterStructure = [
    box(
      "yard-gantry-west-column",
      [59.55, 3.55, 49],
      [0.42, 6.5, 0.48],
      "#314347",
    ),
    box(
      "yard-gantry-east-column",
      [79.45, 3.55, 49],
      [0.42, 6.5, 0.48],
      "#314347",
    ),
    box(
      "yard-gantry-top-beam",
      [69.5, 6.78, 49],
      [20.3, 0.42, 0.55],
      "#34474b",
    ),
    box(
      "yard-gantry-lower-beam",
      [69.5, 5.58, 49],
      [20, 0.18, 0.28],
      "#687678",
    ),
    box(
      "yard-gantry-sign-back",
      [70, 6.18, 48.67],
      [4.8, 0.92, 0.16],
      "#101f24",
    ),
    ...[63.4, 66.2, 73.8, 76.6].map((x) =>
      box(`yard-gantry-web-${x}`, [x, 6.18, 49], [0.14, 1.02, 0.24], "#526367"),
    ),
  ];
  const perimeterDetails = [
    box(
      "yard-catwalk-platform",
      [78.18, 4.42, 43.1],
      [1.62, 0.18, 10.4],
      "#37484b",
    ),
    box(
      "yard-catwalk-outer-rail",
      [77.4, 5.25, 43.1],
      [0.1, 0.1, 10.1],
      "#899493",
    ),
    ...[38.2, 40.7, 43.2, 45.7, 48.2].map((z) =>
      box(
        `yard-catwalk-post-${z}`,
        [77.4, 4.86, z],
        [0.11, 0.86, 0.11],
        "#758282",
      ),
    ),
    box(
      "yard-catwalk-ladder-west",
      [77.38, 2.3, 48.05],
      [0.1, 4.25, 0.1],
      "#778382",
    ),
    box(
      "yard-catwalk-ladder-east",
      [77.98, 2.3, 48.05],
      [0.1, 4.25, 0.1],
      "#778382",
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      box(
        `yard-catwalk-ladder-rung-${index}`,
        [77.68, 0.68 + index * 0.48, 48.05],
        [0.68, 0.07, 0.09],
        "#899493",
      ),
    ),
    ...[41, 43.5, 46, 48.5, 51].map((z) =>
      box(
        `yard-west-fence-post-${z}`,
        [59.96, 1.35, z],
        [0.14, 2.15, 0.14],
        "#657476",
      ),
    ),
    box(
      "yard-west-fence-rail-low",
      [59.96, 0.8, 46],
      [0.1, 0.1, 10.2],
      "#657476",
    ),
    box(
      "yard-west-fence-rail-high",
      [59.96, 1.78, 46],
      [0.1, 0.1, 10.2],
      "#657476",
    ),
    box(
      "yard-utility-cabinet-a",
      [60.72, 1.08, 42.6],
      [1.05, 1.52, 0.72],
      "#3d5154",
    ),
    box(
      "yard-utility-cabinet-b",
      [60.68, 0.86, 44.05],
      [0.82, 1.08, 0.62],
      "#516164",
    ),
  ];
  const perimeterLights = [
    box(
      "yard-gantry-light-west",
      [65.2, 5.42, 48.72],
      [2.35, 0.1, 0.17],
      "#ffe7b4",
    ),
    box(
      "yard-gantry-light-east",
      [74.8, 5.42, 48.72],
      [2.35, 0.1, 0.17],
      "#ffe7b4",
    ),
    box(
      "yard-gantry-column-marker-west",
      [59.55, 1.18, 48.73],
      [0.46, 0.18, 0.08],
      "#ff6b57",
    ),
    box(
      "yard-gantry-column-marker-east",
      [79.45, 1.18, 48.73],
      [0.46, 0.18, 0.08],
      "#d8ff62",
    ),
  ];
  const wetPatches = [
    box(
      "yard-wet-gate-west",
      [64.2, 0.309, 50.9],
      [2.65, 0.008, 1.18],
      "#25383b",
      0.18,
    ),
    box(
      "yard-wet-gate-east",
      [73.8, 0.309, 50.2],
      [2.25, 0.008, 1.05],
      "#3a3630",
      -0.22,
    ),
    box(
      "yard-wet-coupe",
      [61.9, 0.309, 52.6],
      [1.85, 0.008, 0.82],
      "#233336",
      -0.08,
    ),
    box(
      "yard-wet-dock",
      [69.8, 0.309, 41.15],
      [3.2, 0.008, 1.35],
      "#3a3129",
      0.11,
    ),
    box(
      "yard-wet-drain",
      [67.1, 0.309, 45.55],
      [2.15, 0.008, 0.62],
      "#203033",
      -0.3,
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
    depotGlazing,
    depotLightPanels,
    depotRelief,
    depotRoofline,
    dockStructure,
    drainSlats: desktop ? drainPlan.drainSlats : [],
    drains: drainPlan.drains,
    interior,
    perimeterDetails: desktop ? perimeterDetails : perimeterDetails.slice(-2),
    perimeterLights: desktop ? perimeterLights : perimeterLights.slice(0, 2),
    perimeterStructure,
    palletBoards: [
      ...pallet("dock-pallet-west", [62.6, 0.32, 39.5], 0.05),
      ...(desktop ? pallet("dock-pallet-east", [76.2, 0.32, 39.3], -0.08) : []),
    ],
    safetyMarkings,
    tireMarks,
    wetPatches: desktop ? wetPatches : wetPatches.slice(0, 3),
  };
}
