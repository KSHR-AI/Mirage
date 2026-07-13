import type { BoxInstance, CityQuality, CityVec3 } from "./types";

export const SF_CABLE_CAR_POSITION = [
  -28, 0.46, 34,
] as const satisfies CityVec3;

export type SanFranciscoBackdrop = {
  readonly houses: readonly BoxInstance[];
  readonly roofs: readonly BoxInstance[];
};

export type PaintedRowPlan = {
  readonly glazing: readonly BoxInstance[];
  readonly opaque: readonly BoxInstance[];
  readonly porchLights: readonly BoxInstance[];
  readonly roofs: readonly BoxInstance[];
};

export type CaliforniaCableCarPlan = {
  readonly glazing: readonly BoxInstance[];
  readonly lamps: readonly BoxInstance[];
  readonly opaque: readonly BoxInstance[];
};

const HOUSE_COLORS = [
  "#d97873",
  "#70a7a2",
  "#e0a45e",
  "#8d7caf",
  "#7eaa78",
  "#d98c9d",
] as const;

const PAINTED_ROW_COLORS = [
  { body: "#bd5f72", bay: "#d67885", door: "#263f45", trim: "#f0dfc6" },
  { body: "#4d8e8b", bay: "#65a6a0", door: "#843f3e", trim: "#f1e4cb" },
  { body: "#c88a4f", bay: "#dfa25f", door: "#a94342", trim: "#f3e1bd" },
  { body: "#76678f", bay: "#9180a8", door: "#293e43", trim: "#eadbc6" },
  { body: "#648b65", bay: "#7aa276", door: "#7d3f3c", trim: "#efe0c7" },
] as const;

function box(
  id: string,
  position: CityVec3,
  scale: CityVec3,
  color: string,
  rotationY = 0,
): BoxInstance {
  return { color, id, position, rotationY, scale };
}

export function createPaintedRowPlan(): PaintedRowPlan {
  const opaque: BoxInstance[] = [];
  const glazing: BoxInstance[] = [];
  const porchLights: BoxInstance[] = [];
  const roofs: BoxInstance[] = [];

  PAINTED_ROW_COLORS.forEach((palette, index) => {
    const x = -78 + index * 4;
    const id = `painted-row-${index}`;
    opaque.push(
      box(`${id}-body`, [x, 4.35, 70], [3.68, 8.5, 8.15], palette.body),
      box(`${id}-foundation`, [x, 0.62, 74.02], [3.82, 0.92, 0.42], "#344246"),
      box(`${id}-cornice`, [x, 8.45, 74.05], [4.02, 0.42, 0.58], palette.trim),
      box(`${id}-belt`, [x, 4.62, 74.08], [3.78, 0.18, 0.44], palette.trim),
      box(
        `${id}-corner-left`,
        [x - 1.7, 4.55, 74.08],
        [0.16, 7.45, 0.42],
        palette.trim,
      ),
      box(
        `${id}-corner-right`,
        [x + 1.7, 4.55, 74.08],
        [0.16, 7.45, 0.42],
        palette.trim,
      ),
      box(
        `${id}-bay-low`,
        [x + 0.42, 3.25, 74.28],
        [2.14, 2.2, 0.64],
        palette.bay,
      ),
      box(
        `${id}-bay-high`,
        [x + 0.42, 6.35, 74.28],
        [2.14, 2.2, 0.64],
        palette.bay,
      ),
      box(
        `${id}-bay-low-sill`,
        [x + 0.42, 2.08, 74.42],
        [2.36, 0.18, 0.88],
        palette.trim,
      ),
      box(
        `${id}-bay-mid-sill`,
        [x + 0.42, 5.18, 74.42],
        [2.36, 0.18, 0.88],
        palette.trim,
      ),
      box(
        `${id}-bay-cap`,
        [x + 0.42, 7.52, 74.42],
        [2.36, 0.2, 0.88],
        palette.trim,
      ),
      box(
        `${id}-door`,
        [x - 1.08, 1.65, 74.27],
        [0.78, 2.32, 0.2],
        palette.door,
      ),
      box(
        `${id}-door-frame`,
        [x - 1.08, 1.72, 74.39],
        [1.04, 2.68, 0.12],
        palette.trim,
      ),
      box(
        `${id}-door-face`,
        [x - 1.08, 1.65, 74.48],
        [0.7, 2.22, 0.08],
        palette.door,
      ),
      box(
        `${id}-step-top`,
        [x - 1.08, 0.46, 74.64],
        [1.18, 0.3, 0.72],
        "#707574",
      ),
      box(
        `${id}-step-mid`,
        [x - 1.08, 0.3, 75.02],
        [1.38, 0.22, 0.86],
        "#7b7f7c",
      ),
      box(
        `${id}-step-low`,
        [x - 1.08, 0.17, 75.45],
        [1.62, 0.14, 1],
        "#888b85",
      ),
      box(
        `${id}-rail-left`,
        [x - 1.78, 1.18, 75.05],
        [0.07, 0.08, 1.45],
        "#263538",
      ),
      box(
        `${id}-rail-right`,
        [x - 0.4, 1.18, 75.05],
        [0.07, 0.08, 1.45],
        "#263538",
      ),
      box(
        `${id}-chimney`,
        [x - 1.15, 9.55, 68.5],
        [0.5, 1.85, 0.65],
        "#4d4240",
      ),
      box(
        `${id}-dormer-cap`,
        [x + 0.55, 9.15, 73.15],
        [1.52, 0.78, 1.1],
        palette.trim,
      ),
    );

    for (const y of [3.25, 6.35]) {
      for (const offset of [-0.42, 0.42]) {
        glazing.push(
          box(
            `${id}-window-${y}-${offset}`,
            [x + 0.42 + offset, y, 74.62],
            [0.58, 1.28, 0.055],
            (index + (y > 5 ? 1 : 0)) % 3 === 0 ? "#e8bd73" : "#355e68",
          ),
        );
      }
    }
    glazing.push(
      box(
        `${id}-transom`,
        [x - 1.08, 2.62, 74.5],
        [0.58, 0.22, 0.05],
        "#e7c879",
      ),
    );
    porchLights.push(
      box(
        `${id}-porch-light`,
        [x - 0.54, 2.48, 74.56],
        [0.13, 0.2, 0.1],
        index === 2 ? "#d9f46d" : "#ffd38a",
      ),
    );
    roofs.push(
      box(
        `${id}-roof`,
        [x, 9.72, 69.55],
        [4.3, 2.7, 6.75],
        "#3c383e",
        Math.PI / 4,
      ),
    );
  });

  return { glazing, opaque, porchLights, roofs };
}

export function createCaliforniaCableCarPlan(): CaliforniaCableCarPlan {
  const opaque: BoxInstance[] = [
    box("sf-cable-car-chassis", [0, 0.42, 0], [3.55, 0.42, 7], "#4a2926"),
    box(
      "sf-cable-car-undercarriage",
      [0, 0.12, 0],
      [2.6, 0.38, 5.45],
      "#252b2d",
    ),
    box("sf-cable-car-lower", [0, 1.08, 0], [3.32, 0.95, 6.65], "#a83f35"),
    box("sf-cable-car-cabin", [0, 2.1, 0], [3.14, 1.3, 4.25], "#ecd6a9"),
    box("sf-cable-car-front", [0, 2.02, -2.7], [3.16, 1.38, 1.15], "#b7463b"),
    box("sf-cable-car-rear", [0, 2.02, 2.7], [3.16, 1.38, 1.15], "#b7463b"),
    box("sf-cable-car-roof", [0, 3.06, 0], [3.72, 0.3, 6.9], "#f0dfb8"),
    box("sf-cable-car-roof-cap", [0, 3.27, 0], [3.25, 0.16, 5.7], "#d2b87e"),
    box(
      "sf-cable-car-platform-front",
      [0, 0.78, -3.58],
      [3.62, 0.18, 0.82],
      "#b7463b",
    ),
    box(
      "sf-cable-car-platform-rear",
      [0, 0.78, 3.58],
      [3.62, 0.18, 0.82],
      "#b7463b",
    ),
    box(
      "sf-cable-car-step-front",
      [0, 0.52, -3.95],
      [3.2, 0.16, 0.42],
      "#d6b45d",
    ),
    box(
      "sf-cable-car-step-rear",
      [0, 0.52, 3.95],
      [3.2, 0.16, 0.42],
      "#d6b45d",
    ),
  ];
  const glazing: BoxInstance[] = [];
  const lamps: BoxInstance[] = [];

  [-2.05, -0.68, 0.68, 2.05].forEach((z, index) => {
    for (const x of [-1.59, 1.59]) {
      glazing.push(
        box(
          `sf-cable-car-side-window-${x}-${index}`,
          [x, 2.2, z],
          [0.07, 0.86, 0.96],
          "#315e69",
        ),
      );
    }
  });
  for (const z of [-3.29, 3.29]) {
    for (const x of [-0.72, 0.72]) {
      glazing.push(
        box(
          `sf-cable-car-end-window-${x}-${z}`,
          [x, 2.18, z],
          [0.92, 0.78, 0.06],
          "#315e69",
        ),
      );
    }
  }
  for (const x of [-1.66, 1.66]) {
    opaque.push(
      box(`sf-cable-car-belt-${x}`, [x, 1.45, 0], [0.09, 0.16, 6.5], "#f1c55f"),
      box(
        `sf-cable-car-roof-trim-${x}`,
        [x, 2.82, 0],
        [0.1, 0.13, 6.5],
        "#70402f",
      ),
    );
    [-2.7, -1.36, 0, 1.36, 2.7].forEach((z, index) =>
      opaque.push(
        box(
          `sf-cable-car-post-${x}-${index}`,
          [x, 2.18, z],
          [0.1, 1.48, 0.1],
          "#7b402f",
        ),
      ),
    );
  }
  for (const z of [-3.62, 3.62]) {
    opaque.push(
      box(
        `sf-cable-car-platform-top-${z}`,
        [0, 2.08, z],
        [3.02, 0.07, 0.08],
        "#ead7aa",
      ),
      box(
        `sf-cable-car-destination-${z}`,
        [0, 2.64, z > 0 ? 3.31 : -3.31],
        [2.3, 0.44, 0.08],
        "#243437",
      ),
    );
    [-1.42, -0.7, 0.7, 1.42].forEach((x, index) =>
      opaque.push(
        box(
          `sf-cable-car-platform-post-${z}-${index}`,
          [x, 1.43, z],
          [0.07, 1.22, 0.07],
          "#ead7aa",
        ),
      ),
    );
    lamps.push(
      box(
        `sf-cable-car-headlamp-${z}`,
        [0, 1.75, z > 0 ? 3.34 : -3.34],
        [0.24, 0.24, 0.08],
        "#ffe39a",
      ),
    );
  }
  opaque.push(
    box(
      "sf-cable-car-destination-mark-front",
      [0, 2.64, -3.36],
      [1.42, 0.08, 0.04],
      "#f0d78a",
    ),
    box(
      "sf-cable-car-destination-mark-rear",
      [0, 2.64, 3.36],
      [1.42, 0.08, 0.04],
      "#f0d78a",
    ),
  );

  return { glazing, lamps, opaque };
}

export function createSanFranciscoBackdrop(
  quality: CityQuality,
): SanFranciscoBackdrop {
  const rows = quality === "desktop" ? 3 : 2;
  const columns = quality === "desktop" ? 6 : 4;
  const houses: BoxInstance[] = [];
  const roofs: BoxInstance[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const z = quality === "desktop" ? -76 + column * 19 : -66 + column * 26;
      const x = -116 - row * 9;
      const height = 5.6 + ((row + column) % 3) * 0.55;
      const hillSurfaceY =
        -20 +
        47.6 *
          Math.sqrt(
            Math.max(0.04, 1 - ((x + 162) / 101.5) ** 2 - ((z + 25) / 84) ** 2),
          );
      const centerY = hillSurfaceY + height / 2 - 0.18;
      const width = 6.2 + ((row + column) % 2) * 0.5;
      const depth = 8.2;
      const id = `sf-hillside-home-${row}-${column}`;

      houses.push({
        color: HOUSE_COLORS[(row * 2 + column) % HOUSE_COLORS.length],
        id,
        position: [x, centerY, z],
        rotationY: 0,
        scale: [width, height, depth],
      });
      roofs.push({
        color: (row + column) % 2 === 0 ? "#765a51" : "#5e6664",
        id: `${id}-roof`,
        position: [x, centerY + height / 2 + 1.15, z],
        rotationY: Math.PI / 4,
        scale: [width * 1.12, 2.3, width * 1.12],
      });
    }
  }

  return { houses, roofs };
}
