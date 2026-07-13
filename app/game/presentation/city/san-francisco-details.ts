import type { BoxInstance, CityQuality, CityVec3 } from "./types";

export const SF_CABLE_CAR_POSITION = [
  -28, 0.46, 34,
] as const satisfies CityVec3;

export type SanFranciscoBackdrop = {
  readonly houses: readonly BoxInstance[];
  readonly roofs: readonly BoxInstance[];
};

const HOUSE_COLORS = [
  "#d97873",
  "#70a7a2",
  "#e0a45e",
  "#8d7caf",
  "#7eaa78",
  "#d98c9d",
] as const;

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
