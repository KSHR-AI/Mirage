import type { BoxInstance, CityQuality, CityVec3 } from "./types";

export type RouteStreetLifePlan = {
  readonly benchFrames: readonly BoxInstance[];
  readonly benchSlats: readonly BoxInstance[];
  readonly bollards: readonly BoxInstance[];
  readonly curbFaces: readonly BoxInstance[];
  readonly parkingMeterHeads: readonly BoxInstance[];
  readonly parkingMeterPoles: readonly BoxInstance[];
  readonly planterCrowns: readonly BoxInstance[];
  readonly planterPots: readonly BoxInstance[];
  readonly sidewalkSeams: readonly BoxInstance[];
  readonly signFrames: readonly BoxInstance[];
  readonly signGlyphs: readonly BoxInstance[];
  readonly storefrontArchitecture: readonly BoxInstance[];
  readonly storefrontBackdrops: readonly BoxInstance[];
  readonly storefrontDisplays: readonly BoxInstance[];
  readonly storefrontLightPanels: readonly BoxInstance[];
  readonly utilityCabinets: readonly BoxInstance[];
  readonly utilityPanels: readonly BoxInstance[];
};

type StorefrontSide = "east" | "north" | "south" | "west";

const CENTRAL_BLOCKS = Object.freeze([
  [-14, -14],
  [-14, 14],
  [14, -14],
  [14, 14],
] as const);
export const ROUTE_STREET_LIFE_DISTANCE = 68;

export function shouldShowRouteStreetLife(x: number, z: number): boolean {
  return x * x + z * z <= ROUTE_STREET_LIFE_DISTANCE ** 2;
}

function box(
  id: string,
  position: CityVec3,
  scale: CityVec3,
  color: string,
  rotationY = 0,
): BoxInstance {
  return { color, id, position, rotationY, scale };
}

function createPavementPlan(quality: CityQuality) {
  const blocks =
    quality === "desktop" ? CENTRAL_BLOCKS : CENTRAL_BLOCKS.slice(2);
  const curbFaces: BoxInstance[] = [];
  const sidewalkSeams: BoxInstance[] = [];

  for (const [x, z] of blocks) {
    const centralEdgeX = x > 0 ? 4.84 : -4.84;
    const centralEdgeZ = z > 0 ? 4.84 : -4.84;
    curbFaces.push(
      box(
        `route-curb-face-x-${x}-${z}`,
        [centralEdgeX, 0.215, z],
        [0.16, 0.25, 18.3],
        "#667579",
      ),
      box(
        `route-curb-face-z-${x}-${z}`,
        [x, 0.215, centralEdgeZ],
        [18.3, 0.25, 0.16],
        "#667579",
      ),
    );

    const seamOffsets = quality === "desktop" ? [-4.6, 0, 4.6] : [0];
    for (const offset of seamOffsets) {
      sidewalkSeams.push(
        box(
          `route-sidewalk-seam-x-${x}-${z}-${offset}`,
          [x + offset, 0.306, z],
          [0.035, 0.008, 18.15],
          "#35474b",
        ),
        box(
          `route-sidewalk-seam-z-${x}-${z}-${offset}`,
          [x, 0.307, z + offset],
          [18.15, 0.008, 0.035],
          "#35474b",
        ),
      );
    }
  }
  return { curbFaces, sidewalkSeams };
}

function storefrontSide(id: string): StorefrontSide | null {
  const match = id.match(
    /-storefront-(?:glass|sign)-(east|north|south|west)(?:-|$)/,
  );
  return (match?.[1] as StorefrontSide | undefined) ?? null;
}

function inwardOffset(side: StorefrontSide, distance: number): CityVec3 {
  if (side === "north") return [0, 0, distance];
  if (side === "south") return [0, 0, -distance];
  if (side === "east") return [-distance, 0, 0];
  return [distance, 0, 0];
}

function addPosition(position: CityVec3, offset: CityVec3): CityVec3 {
  return [
    position[0] + offset[0],
    position[1] + offset[1],
    position[2] + offset[2],
  ];
}

function createStorefrontDepthPlan(
  quality: CityQuality,
  glass: readonly BoxInstance[],
  signs: readonly BoxInstance[],
) {
  const selectedGlass = quality === "desktop" ? glass : glass.slice(0, 6);
  const storefrontArchitecture: BoxInstance[] = [];
  const storefrontBackdrops: BoxInstance[] = [];
  const storefrontDisplays: BoxInstance[] = [];
  const storefrontLightPanels: BoxInstance[] = [];

  selectedGlass.forEach((pane, index) => {
    const side = storefrontSide(pane.id);
    if (!side) return;
    const lateral = pane.scale[0] > pane.scale[2];
    const span = lateral ? pane.scale[0] : pane.scale[2];
    const depth = quality === "desktop" ? 0.1 : 0.065;
    const interiorPosition = addPosition(
      pane.position,
      inwardOffset(side, depth * 0.5),
    );
    const inset = inwardOffset(side, depth);
    const backdropPosition = addPosition(pane.position, inset);
    const floorY = pane.position[1] - pane.scale[1] / 2 + 0.055;
    const ceilingY = pane.position[1] + pane.scale[1] / 2 - 0.055;
    storefrontArchitecture.push(
      box(
        `${pane.id}-interior-floor`,
        [interiorPosition[0], floorY, interiorPosition[2]],
        lateral ? [span * 0.92, 0.07, depth] : [depth, 0.07, span * 0.92],
        "#3a3430",
      ),
      box(
        `${pane.id}-interior-ceiling`,
        [interiorPosition[0], ceilingY, interiorPosition[2]],
        lateral ? [span * 0.92, 0.07, depth] : [depth, 0.07, span * 0.92],
        "#766c5d",
      ),
    );
    if (quality === "desktop") {
      for (const edge of [-1, 1]) {
        storefrontArchitecture.push(
          box(
            `${pane.id}-interior-return-${edge < 0 ? "left" : "right"}`,
            lateral
              ? [
                  pane.position[0] + edge * span * 0.45,
                  pane.position[1],
                  interiorPosition[2],
                ]
              : [
                  interiorPosition[0],
                  pane.position[1],
                  pane.position[2] + edge * span * 0.45,
                ],
            lateral
              ? [0.065, pane.scale[1] * 0.9, depth]
              : [depth, pane.scale[1] * 0.9, 0.065],
            "#262a29",
          ),
        );
      }
    }
    storefrontLightPanels.push(
      box(
        `${pane.id}-interior-light`,
        [backdropPosition[0], ceilingY - 0.18, backdropPosition[2]],
        lateral ? [span * 0.38, 0.08, 0.045] : [0.045, 0.08, span * 0.38],
        index % 2 === 0 ? "#ffe0a2" : "#b8ece7",
      ),
    );
    const frontPosition = addPosition(
      pane.position,
      inwardOffset(side, -0.045),
    );
    const lowerY = pane.position[1] - pane.scale[1] / 2 + 0.16;
    storefrontArchitecture.push(
      box(
        `${pane.id}-front-mullion`,
        frontPosition,
        lateral
          ? [0.055, pane.scale[1] * 0.88, 0.08]
          : [0.08, pane.scale[1] * 0.88, 0.055],
        "#121d20",
      ),
      box(
        `${pane.id}-front-transom`,
        [
          frontPosition[0],
          pane.position[1] + pane.scale[1] * 0.24,
          frontPosition[2],
        ],
        lateral ? [span * 0.9, 0.055, 0.08] : [0.08, 0.055, span * 0.9],
        "#172326",
      ),
      box(
        `${pane.id}-front-kickplate`,
        [frontPosition[0], lowerY, frontPosition[2]],
        lateral ? [span * 0.9, 0.24, 0.08] : [0.08, 0.24, span * 0.9],
        "#253337",
      ),
      box(
        `${pane.id}-front-handle`,
        lateral
          ? [
              frontPosition[0] + span * 0.13,
              pane.position[1] - 0.08,
              frontPosition[2] - inwardOffset(side, 0.03)[2],
            ]
          : [
              frontPosition[0] - inwardOffset(side, 0.03)[0],
              pane.position[1] - 0.08,
              frontPosition[2] + span * 0.13,
            ],
        [0.045, 0.3, 0.045],
        "#c6a45e",
      ),
    );
    storefrontBackdrops.push(
      box(
        `${pane.id}-backdrop`,
        backdropPosition,
        lateral
          ? [pane.scale[0] * 0.92, pane.scale[1] * 0.88, 0.08]
          : [0.08, pane.scale[1] * 0.88, pane.scale[2] * 0.92],
        index % 3 === 0 ? "#6b4931" : index % 3 === 1 ? "#244c52" : "#533741",
      ),
    );

    if (quality !== "desktop") return;
    const displayPosition = addPosition(
      pane.position,
      inwardOffset(side, depth * 0.18),
    );
    for (let shelf = 0; shelf < 2; shelf += 1) {
      const y = pane.position[1] - 0.68 + shelf * 0.72;
      storefrontDisplays.push(
        box(
          `${pane.id}-display-shelf-${shelf}`,
          [displayPosition[0], y, displayPosition[2]],
          lateral
            ? [pane.scale[0] * 0.7, 0.075, 0.035]
            : [0.035, 0.075, pane.scale[2] * 0.7],
          "#c8a96c",
        ),
      );
      for (let product = 0; product < 3; product += 1) {
        const along = (product - 1) * 0.34;
        storefrontDisplays.push(
          box(
            `${pane.id}-display-product-${shelf}-${product}`,
            lateral
              ? [displayPosition[0] + along, y + 0.19, displayPosition[2]]
              : [displayPosition[0], y + 0.19, displayPosition[2] + along],
            lateral ? [0.23, 0.38, 0.045] : [0.045, 0.38, 0.23],
            product === 0 ? "#d8b15b" : product === 1 ? "#6bb3aa" : "#b96d63",
          ),
        );
      }
    }
  });

  const selectedSigns = quality === "desktop" ? signs : signs.slice(0, 3);
  const signFrames: BoxInstance[] = [];
  const signGlyphs: BoxInstance[] = [];
  selectedSigns.forEach((sign) => {
    const side = storefrontSide(sign.id);
    if (!side) return;
    const lateral = sign.scale[0] > sign.scale[2];
    const framePosition = addPosition(sign.position, inwardOffset(side, 0.08));
    const glyphOffset = inwardOffset(side, -0.065);
    signFrames.push(
      box(
        `${sign.id}-frame`,
        framePosition,
        lateral
          ? [sign.scale[0] + 0.3, sign.scale[1] + 0.2, sign.scale[2] + 0.08]
          : [sign.scale[0] + 0.08, sign.scale[1] + 0.2, sign.scale[2] + 0.3],
        "#101b1e",
        sign.rotationY,
      ),
    );
    const lineCount = quality === "desktop" ? 3 : 2;
    for (let line = 0; line < lineCount; line += 1) {
      const lineOffset = (line - (lineCount - 1) / 2) * 0.15;
      const glyphPosition = addPosition(sign.position, glyphOffset);
      signGlyphs.push(
        box(
          `${sign.id}-glyph-${line}`,
          lateral
            ? [
                sign.position[0] + lineOffset * 1.8,
                sign.position[1] + lineOffset,
                glyphPosition[2],
              ]
            : [
                glyphPosition[0],
                sign.position[1] + lineOffset,
                sign.position[2] + lineOffset * 1.8,
              ],
          lateral
            ? [sign.scale[0] * (0.17 + line * 0.04), 0.045, 0.035]
            : [0.035, 0.045, sign.scale[2] * (0.17 + line * 0.04)],
          "#f6e8c8",
          sign.rotationY,
        ),
      );
    }
  });

  return {
    signFrames,
    signGlyphs,
    storefrontArchitecture,
    storefrontBackdrops,
    storefrontDisplays,
    storefrontLightPanels,
  };
}

function createFurniturePlan(quality: CityQuality) {
  const parkingMeterPoles: BoxInstance[] = [];
  const parkingMeterHeads: BoxInstance[] = [];
  const meterPositions = [
    [-5.72, 0.32, -19],
    [-5.72, 0.32, -10],
    [5.72, 0.32, 10],
    [5.72, 0.32, 19],
    [-19, 0.32, 5.72],
    [-10, 0.32, 5.72],
    [10, 0.32, -5.72],
    [19, 0.32, -5.72],
  ] as const;
  const selectedMeters =
    quality === "desktop" ? meterPositions : meterPositions.slice(2, 6);
  selectedMeters.forEach((position, index) => {
    parkingMeterPoles.push(
      box(
        `route-parking-meter-${index}-pole`,
        [position[0], 0.92, position[2]],
        [0.09, 1.2, 0.09],
        "#314246",
      ),
    );
    parkingMeterHeads.push(
      box(
        `route-parking-meter-${index}-head`,
        [position[0], 1.56, position[2]],
        [0.24, 0.32, 0.18],
        index % 3 === 0 ? "#c6a857" : "#45575a",
      ),
    );
  });

  const cornerBollards = [
    [-5.62, 0.76, -5.62],
    [-5.62, 0.76, 5.62],
    [5.62, 0.76, -5.62],
    [5.62, 0.76, 5.62],
  ] as const;
  const bollards = cornerBollards
    .slice(0, quality === "desktop" ? 4 : 2)
    .map((position, index) =>
      box(
        `route-corner-bollard-${index}`,
        position,
        [0.24, 0.88, 0.24],
        index % 2 === 0 ? "#c9a840" : "#56666a",
      ),
    );

  const benchFrames: BoxInstance[] = [];
  const benchSlats: BoxInstance[] = [];
  const benches = [
    { position: [6.5, 0.32, 14] as CityVec3, rotationY: 0 },
    { position: [-6.5, 0.32, -14] as CityVec3, rotationY: Math.PI },
    { position: [14, 0.32, -6.5] as CityVec3, rotationY: Math.PI / 2 },
  ].slice(0, quality === "desktop" ? 3 : 1);
  benches.forEach((bench, index) => {
    const lateral = Math.abs(Math.sin(bench.rotationY)) < 0.5;
    const slatScale: CityVec3 = lateral
      ? [2.05, 0.12, 0.42]
      : [0.42, 0.12, 2.05];
    benchSlats.push(
      box(
        `route-bench-${index}-seat`,
        [bench.position[0], 0.78, bench.position[2]],
        slatScale,
        "#805e3f",
        bench.rotationY,
      ),
      box(
        `route-bench-${index}-back`,
        lateral
          ? [bench.position[0], 1.22, bench.position[2] + 0.28]
          : [bench.position[0] + 0.28, 1.22, bench.position[2]],
        lateral ? [2.05, 0.65, 0.1] : [0.1, 0.65, 2.05],
        "#6d4e35",
        bench.rotationY,
      ),
    );
    for (const offset of [-0.72, 0.72]) {
      benchFrames.push(
        box(
          `route-bench-${index}-leg-${offset}`,
          lateral
            ? [bench.position[0] + offset, 0.55, bench.position[2]]
            : [bench.position[0], 0.55, bench.position[2] + offset],
          [0.09, 0.48, 0.09],
          "#253337",
          bench.rotationY,
        ),
      );
    }
  });

  const planterPositions = [
    [6.65, 0.32, 9.2],
    [-6.65, 0.32, -9.2],
    [9.2, 0.32, -6.65],
    [-9.2, 0.32, 6.65],
  ] as const;
  const selectedPlanters = planterPositions.slice(
    0,
    quality === "desktop" ? 4 : 2,
  );
  const planterPots = selectedPlanters.map((position, index) =>
    box(
      `route-planter-${index}-pot`,
      [position[0], 0.72, position[2]],
      [0.72, 0.8, 0.72],
      index % 2 === 0 ? "#59696b" : "#6d554c",
    ),
  );
  const planterCrowns = selectedPlanters.map((position, index) =>
    box(
      `route-planter-${index}-crown`,
      [position[0], 1.46, position[2]],
      [0.9, 1.1, 0.9],
      index % 2 === 0 ? "#3e6753" : "#526b48",
      index * 0.7,
    ),
  );

  const cabinets = [
    [-6.72, 0.32, 21.2],
    [6.72, 0.32, -21.2],
    [21.2, 0.32, 6.72],
    [-21.2, 0.32, -6.72],
  ] as const;
  const selectedCabinets = cabinets.slice(0, quality === "desktop" ? 4 : 2);
  const utilityCabinets = selectedCabinets.map((position, index) =>
    box(
      `route-utility-${index}-cabinet`,
      [position[0], 1.06, position[2]],
      [0.82, 1.48, 0.54],
      index % 2 === 0 ? "#415b55" : "#48575a",
      index % 2 === 0 ? 0 : Math.PI / 2,
    ),
  );
  const utilityPanels = selectedCabinets.map((position, index) =>
    box(
      `route-utility-${index}-panel`,
      index % 2 === 0
        ? [position[0], 1.14, position[2] + 0.285]
        : [position[0] + 0.285, 1.14, position[2]],
      [0.4, 0.58, 0.025],
      "#182629",
      index % 2 === 0 ? 0 : Math.PI / 2,
    ),
  );

  return {
    benchFrames,
    benchSlats,
    bollards,
    parkingMeterHeads,
    parkingMeterPoles,
    planterCrowns,
    planterPots,
    utilityCabinets,
    utilityPanels,
  };
}

export function createRouteStreetLifePlan(
  quality: CityQuality,
  storefrontGlass: readonly BoxInstance[],
  signs: readonly BoxInstance[],
): RouteStreetLifePlan {
  return {
    ...createPavementPlan(quality),
    ...createStorefrontDepthPlan(quality, storefrontGlass, signs),
    ...createFurniturePlan(quality),
  };
}
