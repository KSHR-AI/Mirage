import {
  AUTHORED_ROUTE_FACADE_NODES,
  type AuthoredFacadePlacement,
  type AuthoredModelPlacement,
  type AuthoredRoutePlan,
} from "./authored-route-layout";
import type { BoxInstance, CityVec3 } from "./types";

export type BlockRouteAssetPlan = {
  readonly barrierBodies: readonly BoxInstance[];
  readonly barrierStripes: readonly BoxInstance[];
  readonly binBodies: readonly BoxInstance[];
  readonly binLids: readonly BoxInstance[];
  readonly escapePlatforms: readonly BoxInstance[];
  readonly escapeRails: readonly BoxInstance[];
  readonly facadeDoors: readonly BoxInstance[];
  readonly facadeGlass: readonly BoxInstance[];
  readonly facadeTrim: readonly BoxInstance[];
  readonly facadeWalls: readonly BoxInstance[];
  readonly streetlightArms: readonly BoxInstance[];
  readonly streetlightHeads: readonly BoxInstance[];
  readonly streetlightPoles: readonly BoxInstance[];
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

function offset(
  base: CityVec3,
  rotationY: number,
  distance: number,
  y: number,
): CityVec3 {
  return [
    base[0] + Math.cos(rotationY) * distance,
    base[1] + y,
    base[2] - Math.sin(rotationY) * distance,
  ];
}

function localBox(
  placement: AuthoredModelPlacement,
  id: string,
  localPosition: CityVec3,
  localScale: CityVec3,
  color: string,
): BoxInstance {
  const scaledX = localPosition[0] * placement.scale[0];
  const scaledZ = localPosition[2] * placement.scale[2];
  const cos = Math.cos(placement.rotationY);
  const sin = Math.sin(placement.rotationY);
  return box(
    `${placement.id}-${id}`,
    [
      placement.position[0] + scaledX * cos + scaledZ * sin,
      placement.position[1] + localPosition[1] * placement.scale[1],
      placement.position[2] - scaledX * sin + scaledZ * cos,
    ],
    [
      localScale[0] * placement.scale[0],
      localScale[1] * placement.scale[1],
      localScale[2] * placement.scale[2],
    ],
    color,
    placement.rotationY,
  );
}

function createFacadeParts(placements: readonly AuthoredFacadePlacement[]) {
  const walls: BoxInstance[] = [];
  const glass: BoxInstance[] = [];
  const trim: BoxInstance[] = [];
  const doors: BoxInstance[] = [];

  for (const placement of placements) {
    const moduleWidth = placement.scale[0] * 3;
    const moduleHeight = placement.scale[1] * 3;
    const centeredY = placement.position[1] + moduleHeight / 2;
    const position: CityVec3 = [
      placement.position[0],
      centeredY,
      placement.position[2],
    ];
    const isWindow =
      placement.nodeName === AUTHORED_ROUTE_FACADE_NODES.largeWindow ||
      placement.nodeName === AUTHORED_ROUTE_FACADE_NODES.smallWindow;
    const isDoor = placement.nodeName === AUTHORED_ROUTE_FACADE_NODES.door;
    const isTrim =
      placement.nodeName === AUTHORED_ROUTE_FACADE_NODES.base ||
      placement.nodeName === AUTHORED_ROUTE_FACADE_NODES.cornice;

    if (isWindow) {
      const small =
        placement.nodeName === AUTHORED_ROUTE_FACADE_NODES.smallWindow;
      glass.push(
        box(
          placement.id,
          position,
          [moduleWidth * (small ? 0.46 : 0.72), moduleHeight * 0.54, 0.09],
          small ? "#7ba4a4" : "#9cc4c1",
          placement.rotationY,
        ),
      );
    } else if (isDoor) {
      doors.push(
        box(
          placement.id,
          [
            position[0],
            placement.position[1] + moduleHeight * 0.42,
            position[2],
          ],
          [moduleWidth * 0.58, moduleHeight * 0.84, 0.12],
          "#24383d",
          placement.rotationY,
        ),
      );
    } else if (isTrim) {
      trim.push(
        box(
          placement.id,
          [position[0], placement.position[1] + 0.18, position[2]],
          [moduleWidth, 0.34, 0.18],
          placement.nodeName === AUTHORED_ROUTE_FACADE_NODES.cornice
            ? "#c7a98f"
            : "#536064",
          placement.rotationY,
        ),
      );
    } else {
      walls.push(
        box(
          placement.id,
          position,
          [moduleWidth, moduleHeight, 0.11],
          "#a88e7f",
          placement.rotationY,
        ),
      );
    }
  }
  return { doors, glass, trim, walls };
}

function createFireEscapes(placements: readonly AuthoredModelPlacement[]) {
  const platforms: BoxInstance[] = [];
  const rails: BoxInstance[] = [];
  for (const placement of placements) {
    for (const level of [3.1, 6.1]) {
      platforms.push(
        localBox(
          placement,
          `platform-${level}`,
          [0, level, 0],
          [2.25, 0.12, 0.82],
          "#283438",
        ),
      );
      rails.push(
        localBox(
          placement,
          `rail-${level}`,
          [0, level + 0.62, 0.36],
          [2.25, 1.18, 0.08],
          "#657073",
        ),
      );
    }
    for (const x of [-0.34, 0.34]) {
      rails.push(
        localBox(
          placement,
          `ladder-${x}`,
          [x, 4.62, 0.39],
          [0.08, 3.05, 0.08],
          "#7c8789",
        ),
      );
    }
    for (let rung = 0; rung < 7; rung += 1) {
      rails.push(
        localBox(
          placement,
          `rung-${rung}`,
          [0, 3.2 + rung * 0.47, 0.39],
          [0.76, 0.055, 0.07],
          "#7c8789",
        ),
      );
    }
  }
  return { platforms, rails };
}

function createStreetlights(placements: readonly AuthoredModelPlacement[]) {
  return {
    arms: placements.map((placement) =>
      box(
        `${placement.id}-block-arm`,
        offset(placement.position, placement.rotationY, 1.12, 4.88),
        [2.28, 0.11, 0.11],
        "#334348",
        placement.rotationY,
      ),
    ),
    heads: placements.map((placement) =>
      box(
        `${placement.id}-block-head`,
        offset(placement.position, placement.rotationY, 2.25, 4.77),
        [0.46, 0.22, 0.34],
        "#d7c58f",
        placement.rotationY,
      ),
    ),
    poles: placements.map((placement) =>
      box(
        `${placement.id}-block-pole`,
        offset(placement.position, placement.rotationY, 0, 2.55),
        [0.14, 5.1, 0.14],
        "#27383d",
        placement.rotationY,
      ),
    ),
  };
}

function createBins(placements: readonly AuthoredModelPlacement[]) {
  return {
    bodies: placements.map((placement) =>
      box(
        `${placement.id}-block-body`,
        offset(placement.position, placement.rotationY, 0, 0.52),
        [0.7, 1.02, 0.7],
        "#35494b",
        placement.rotationY,
      ),
    ),
    lids: placements.map((placement) =>
      box(
        `${placement.id}-block-lid`,
        offset(placement.position, placement.rotationY, 0, 1.08),
        [0.78, 0.1, 0.78],
        "#182629",
        placement.rotationY,
      ),
    ),
  };
}

function createBarriers(placements: readonly AuthoredModelPlacement[]) {
  return {
    bodies: placements.map((placement) =>
      box(
        `${placement.id}-block-body`,
        offset(placement.position, placement.rotationY, 0, 0.38),
        [1.72, 0.74, 0.3],
        "#929592",
        placement.rotationY,
      ),
    ),
    stripes: placements.map((placement) =>
      box(
        `${placement.id}-block-stripe`,
        offset(placement.position, placement.rotationY, 0, 0.42),
        [0.72, 0.18, 0.315],
        "#d2584c",
        placement.rotationY,
      ),
    ),
  };
}

export function createBlockRouteAssetPlan(
  plan: AuthoredRoutePlan,
): BlockRouteAssetPlan {
  const facade = createFacadeParts(plan.facade);
  const escapes = createFireEscapes(plan.fireEscapes);
  const streetlights = createStreetlights(plan.streetlights);
  const bins = createBins(plan.bins);
  const barriers = createBarriers(plan.barriers);
  return {
    barrierBodies: barriers.bodies,
    barrierStripes: barriers.stripes,
    binBodies: bins.bodies,
    binLids: bins.lids,
    escapePlatforms: escapes.platforms,
    escapeRails: escapes.rails,
    facadeDoors: facade.doors,
    facadeGlass: facade.glass,
    facadeTrim: facade.trim,
    facadeWalls: facade.walls,
    streetlightArms: streetlights.arms,
    streetlightHeads: streetlights.heads,
    streetlightPoles: streetlights.poles,
  };
}
