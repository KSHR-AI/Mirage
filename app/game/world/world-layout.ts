const ROAD_LINES = Object.freeze([-84, -56, -28, 0, 28, 56, 84] as const);

const BLOCK_CENTERS = Object.freeze(
  ROAD_LINES.slice(0, -1).map(
    (line, index) => (line + (ROAD_LINES[index + 1] as number)) / 2,
  ),
);

const EXTENTS = Object.freeze({
  bridgeEndZ: -238,
  landMax: 104,
  landMin: -104,
  waterfrontX: 106,
});

export const WORLD_LAYOUT = Object.freeze({
  blockCenters: BLOCK_CENTERS,
  extents: EXTENTS,
  roadLines: ROAD_LINES,
  roadWidth: 9.6,
});
