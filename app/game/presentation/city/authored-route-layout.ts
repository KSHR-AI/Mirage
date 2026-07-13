import type {
  BoxInstance,
  BuildingInstance,
  CityLayout,
  CityQuality,
  CityVec3,
  PointFeature,
  StreetProp,
} from "./types";
import { createRouteStreetLifePlan } from "./route-street-life";

export const AUTHORED_ROUTE_FACADE_TARGET = "building-14-14-0";

export const AUTHORED_ROUTE_FACADE_TARGETS = Object.freeze([
  Object.freeze({
    id: AUTHORED_ROUTE_FACADE_TARGET,
    includeFireEscape: false,
    side: "west" as const,
    storefront: true,
  }),
  Object.freeze({
    id: "building--14-14-1",
    includeFireEscape: false,
    side: "east" as const,
    storefront: true,
  }),
  Object.freeze({
    id: AUTHORED_ROUTE_FACADE_TARGET,
    includeFireEscape: true,
    side: "north" as const,
    storefront: false,
  }),
  Object.freeze({
    id: "building-14-14-1",
    includeFireEscape: false,
    side: "north" as const,
    storefront: true,
  }),
  Object.freeze({
    id: "building--14-14-1",
    includeFireEscape: false,
    side: "north" as const,
    storefront: true,
  }),
  Object.freeze({
    id: "building-14--14-0",
    includeFireEscape: false,
    side: "south" as const,
    storefront: true,
  }),
  Object.freeze({
    id: "building--14--14-1",
    includeFireEscape: false,
    side: "south" as const,
    storefront: true,
  }),
] as const);

export const AUTHORED_ROUTE_FACADE_NODES = Object.freeze({
  base: "base_standard_01",
  cornice: "cornice_standard_standard_01",
  door: "door_centered_large_01",
  doorWall: "wall_door_centered_large_01",
  largeWindow: "window_centered_large_01",
  largeWindowWall: "wall_window_centered_large_01",
  smallWindow: "window_centered_small_01",
  smallWindowWall: "wall_window_centered_small_01",
} as const);

export type AuthoredRouteFacadeNodeName =
  (typeof AUTHORED_ROUTE_FACADE_NODES)[keyof typeof AUTHORED_ROUTE_FACADE_NODES];

export type AuthoredModelPlacement = {
  readonly id: string;
  readonly position: CityVec3;
  readonly rotationY: number;
  readonly scale: CityVec3;
};

export type AuthoredFacadePlacement = AuthoredModelPlacement & {
  readonly nodeName: AuthoredRouteFacadeNodeName;
};

export type AuthoredRoutePlan = {
  readonly awnings: readonly BoxInstance[];
  readonly barriers: readonly AuthoredModelPlacement[];
  readonly benchFrames: readonly BoxInstance[];
  readonly benchSlats: readonly BoxInstance[];
  readonly bins: readonly AuthoredModelPlacement[];
  readonly bollards: readonly BoxInstance[];
  readonly curbFaces: readonly BoxInstance[];
  readonly curbPaint: readonly BoxInstance[];
  readonly drainSlats: readonly BoxInstance[];
  readonly drains: readonly BoxInstance[];
  readonly facade: readonly AuthoredFacadePlacement[];
  readonly fireEscapes: readonly AuthoredModelPlacement[];
  readonly licensedPropIds: readonly string[];
  readonly licensedStreetlightIds: readonly string[];
  readonly manholes: readonly BoxInstance[];
  readonly parkingMeterHeads: readonly BoxInstance[];
  readonly parkingMeterPoles: readonly BoxInstance[];
  readonly planterCrowns: readonly BoxInstance[];
  readonly planterPots: readonly BoxInstance[];
  readonly practicalLights: readonly RoutePracticalLight[];
  readonly sidewalkSeams: readonly BoxInstance[];
  readonly signFrames: readonly BoxInstance[];
  readonly signGlyphs: readonly BoxInstance[];
  readonly signs: readonly BoxInstance[];
  readonly streetlights: readonly AuthoredModelPlacement[];
  readonly storefrontArchitecture: readonly BoxInstance[];
  readonly storefrontBackdrops: readonly BoxInstance[];
  readonly storefrontDisplays: readonly BoxInstance[];
  readonly storefrontFrames: readonly BoxInstance[];
  readonly storefrontGlass: readonly BoxInstance[];
  readonly storefrontLightPanels: readonly BoxInstance[];
  readonly suppressedPropIds: readonly string[];
  readonly surfacePatches: readonly BoxInstance[];
  readonly utilityCabinets: readonly BoxInstance[];
  readonly utilityPanels: readonly BoxInstance[];
};

export type RoutePracticalLight = {
  readonly color: string;
  readonly distance: number;
  readonly id: string;
  readonly intensity: number;
  readonly position: CityVec3;
};

type FacadeSide = "east" | "north" | "south" | "west";

const ROUTE_ANCHORS = Object.freeze([
  [70, 42],
  [14, -42],
  [-70, -42],
  [0, -114],
] as const);

const STREET_ASSET_LIMITS: Readonly<
  Record<CityQuality, { barriers: number; bins: number; streetlights: number }>
> = Object.freeze({
  desktop: Object.freeze({ barriers: 10, bins: 10, streetlights: 7 }),
  mobile: Object.freeze({ barriers: 1, bins: 1, streetlights: 2 }),
});

function routeDistanceSquared(feature: PointFeature): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const [x, z] of ROUTE_ANCHORS) {
    const dx = feature.position[0] - x;
    const dz = feature.position[2] - z;
    nearest = Math.min(nearest, dx * dx + dz * dz);
  }
  return nearest;
}

function closestToRoute<T extends PointFeature>(
  features: readonly T[],
  limit: number,
): T[] {
  return features
    .toSorted(
      (left, right) =>
        routeDistanceSquared(left) - routeDistanceSquared(right) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}

function featurePlacement(
  feature: PointFeature,
  scale: number,
): AuthoredModelPlacement {
  return {
    id: feature.id,
    position: feature.position,
    rotationY: feature.rotationY,
    scale: [scale, scale, scale],
  };
}

function facadePlacement(
  id: string,
  nodeName: AuthoredRouteFacadeNodeName,
  position: CityVec3,
  scale: CityVec3,
  rotationY: number,
): AuthoredFacadePlacement {
  return { id, nodeName, position, rotationY, scale };
}

function createFacadePlan(
  building: BuildingInstance | undefined,
  quality: CityQuality,
  side: FacadeSide,
  includeFireEscape: boolean,
): {
  facade: AuthoredFacadePlacement[];
  fireEscapes: AuthoredModelPlacement[];
} {
  if (!building) return { facade: [], fireEscapes: [] };

  const facade: AuthoredFacadePlacement[] = [];
  const width = building.scale[0];
  const height = building.scale[1];
  const depth = building.scale[2];
  const lateral = side === "north" || side === "south";
  const span = lateral ? width : depth;
  const baseY = building.position[1] - height / 2;
  const bayCount = Math.max(
    2,
    Math.min(quality === "desktop" ? 3 : 2, Math.floor(span / 2.7)),
  );
  const floorCount = Math.max(
    2,
    Math.min(quality === "desktop" ? 12 : 4, Math.floor(height / 3)),
  );
  const bayWidth = span / bayCount;
  const floorHeight = 3;
  const moduleScale: CityVec3 = [bayWidth / 3, floorHeight / 3, 1];
  const outwardX = side === "west" ? -1 : side === "east" ? 1 : 0;
  const outwardZ = side === "north" ? -1 : side === "south" ? 1 : 0;
  const rotationY =
    side === "north"
      ? 0
      : side === "south"
        ? Math.PI
        : side === "west"
          ? -Math.PI / 2
          : Math.PI / 2;
  const faceX = building.position[0] + outwardX * (width / 2 + 0.025);
  const faceZ = building.position[2] + outwardZ * (depth / 2 + 0.025);
  const doorBay = Math.floor(bayCount / 2);

  const modulePosition = (
    bay: number,
    y: number,
    detailOffset = 0,
  ): CityVec3 => {
    const along =
      (lateral ? building.position[0] : building.position[2]) -
      span / 2 +
      bayWidth * (bay + 0.5);
    return lateral
      ? [along, y, faceZ + outwardZ * detailOffset]
      : [faceX + outwardX * detailOffset, y, along];
  };

  for (let floor = 0; floor < floorCount; floor += 1) {
    const floorY = baseY + floor * floorHeight;
    for (let bay = 0; bay < bayCount; bay += 1) {
      const prefix = `${building.id}-facade-${side}-${floor}-${bay}`;
      if (floor === 0 && bay === doorBay) {
        facade.push(
          facadePlacement(
            `${prefix}-wall`,
            AUTHORED_ROUTE_FACADE_NODES.doorWall,
            modulePosition(bay, floorY),
            moduleScale,
            rotationY,
          ),
          facadePlacement(
            `${prefix}-door`,
            AUTHORED_ROUTE_FACADE_NODES.door,
            modulePosition(bay, floorY, 0.055),
            moduleScale,
            rotationY,
          ),
        );
        continue;
      }

      const small = (floor + bay) % 3 === 0;
      facade.push(
        facadePlacement(
          `${prefix}-wall`,
          small
            ? AUTHORED_ROUTE_FACADE_NODES.smallWindowWall
            : AUTHORED_ROUTE_FACADE_NODES.largeWindowWall,
          modulePosition(bay, floorY),
          moduleScale,
          rotationY,
        ),
        facadePlacement(
          `${prefix}-window`,
          small
            ? AUTHORED_ROUTE_FACADE_NODES.smallWindow
            : AUTHORED_ROUTE_FACADE_NODES.largeWindow,
          modulePosition(bay, floorY, 0.055),
          moduleScale,
          rotationY,
        ),
      );
    }
  }

  for (let bay = 0; bay < bayCount; bay += 1) {
    facade.push(
      facadePlacement(
        `${building.id}-base-${side}-${bay}`,
        AUTHORED_ROUTE_FACADE_NODES.base,
        modulePosition(bay, baseY, 0.01),
        [bayWidth / 3, 1, 1],
        rotationY,
      ),
      facadePlacement(
        `${building.id}-cornice-${side}-${bay}`,
        AUTHORED_ROUTE_FACADE_NODES.cornice,
        modulePosition(bay, baseY + floorCount * floorHeight - 0.18, 0.01),
        [bayWidth / 3, 1, 1],
        rotationY,
      ),
    );
  }

  if (quality !== "desktop" || !includeFireEscape || side !== "north") {
    return { facade, fireEscapes: [] };
  }
  const escapeScale = Math.min(0.86, Math.max(0.58, (height - 1) / 9.76));
  return {
    facade,
    fireEscapes: [
      {
        id: `${building.id}-fire-escape-${side}`,
        position: [
          building.position[0] - width / 2 - 0.7,
          baseY,
          building.position[2],
        ],
        rotationY: Math.PI / 2,
        scale: [escapeScale, escapeScale, escapeScale],
      },
    ],
  };
}

type StorefrontPlan = {
  readonly awnings: readonly BoxInstance[];
  readonly frames: readonly BoxInstance[];
  readonly glass: readonly BoxInstance[];
  readonly signs: readonly BoxInstance[];
};

function routeBox(
  id: string,
  position: CityVec3,
  scale: CityVec3,
  color: string,
  rotationY = 0,
): BoxInstance {
  return { color, id, position, rotationY, scale };
}

function createStorefrontPlan(
  building: BuildingInstance,
  quality: CityQuality,
  side: FacadeSide,
  ordinal: number,
): StorefrontPlan {
  const width = building.scale[0];
  const depth = building.scale[2];
  const lateral = side === "north" || side === "south";
  const span = lateral ? width : depth;
  const baseY = building.position[1] - building.scale[1] / 2;
  const outwardX = side === "west" ? -1 : side === "east" ? 1 : 0;
  const outwardZ = side === "north" ? -1 : side === "south" ? 1 : 0;
  const faceX = building.position[0] + outwardX * (width / 2 + 0.12);
  const faceZ = building.position[2] + outwardZ * (depth / 2 + 0.12);
  const bayCount = quality === "desktop" ? 3 : 2;
  const bayWidth = span / bayCount;
  const glass: BoxInstance[] = [];
  const frames: BoxInstance[] = [];
  const position = (along: number, y: number, detailOffset = 0): CityVec3 =>
    lateral
      ? [along, y, faceZ + outwardZ * detailOffset]
      : [faceX + outwardX * detailOffset, y, along];

  for (let bay = 0; bay < bayCount; bay += 1) {
    const along =
      (lateral ? building.position[0] : building.position[2]) -
      span / 2 +
      bayWidth * (bay + 0.5);
    glass.push(
      routeBox(
        `${building.id}-storefront-glass-${side}-${bay}`,
        position(along, baseY + 1.34),
        lateral
          ? [bayWidth * 0.82, 2.46, 0.075]
          : [0.075, 2.46, bayWidth * 0.82],
        (ordinal + bay) % 2 === 0 ? "#548083" : "#8d6757",
      ),
    );
  }
  for (let edge = 0; edge <= bayCount; edge += 1) {
    const along =
      (lateral ? building.position[0] : building.position[2]) -
      span / 2 +
      bayWidth * edge;
    frames.push(
      routeBox(
        `${building.id}-storefront-frame-${side}-${edge}`,
        position(along, baseY + 1.36, 0.045),
        lateral ? [0.09, 2.7, 0.1] : [0.1, 2.7, 0.09],
        "#18282c",
      ),
    );
  }

  return {
    awnings: [
      routeBox(
        `${building.id}-storefront-awning-${side}`,
        position(
          lateral ? building.position[0] : building.position[2],
          baseY + 2.86,
          0.46,
        ),
        lateral ? [span * 0.88, 0.16, 1.04] : [1.04, 0.16, span * 0.88],
        ordinal % 2 === 0 ? "#b84f45" : "#28777b",
      ),
    ],
    frames,
    glass,
    signs: [
      routeBox(
        `${building.id}-storefront-sign-${side}`,
        position(
          lateral ? building.position[0] : building.position[2],
          baseY + 3.43,
          0.08,
        ),
        lateral ? [span * 0.58, 0.5, 0.09] : [0.09, 0.5, span * 0.58],
        ordinal % 2 === 0 ? "#ff7866" : "#5de1d8",
      ),
    ],
  };
}

function createRouteSurfacePlan(quality: CityQuality) {
  const patches = [
    routeBox(
      "route-patch-south",
      [0.8, 0.178, 13.5],
      [3.8, 0.018, 5.4],
      "#25383d",
      0.08,
    ),
    routeBox(
      "route-patch-west",
      [-13.8, 0.181, -0.7],
      [5.6, 0.018, 3.2],
      "#213238",
      -0.06,
    ),
    routeBox(
      "route-patch-north",
      [-0.9, 0.178, -15.2],
      [3.3, 0.018, 4.6],
      "#2a3c40",
      0.04,
    ),
  ];
  const manholePositions: readonly CityVec3[] = [
    [1.7, 0.19, 11.2],
    [-11.4, 0.19, 1.6],
    [-1.8, 0.19, -13.6],
    [13.4, 0.19, -1.7],
  ];
  const manholes = manholePositions.map((position, index) =>
    routeBox(
      `route-manhole-${index}`,
      position,
      [1.25, 0.028, 1.25],
      "#344247",
      index * 0.31,
    ),
  );
  const drainPositions = [
    [-4.35, 0.195, 8.5],
    [4.35, 0.195, -8.5],
    [-8.5, 0.195, -4.35],
    [8.5, 0.195, 4.35],
  ] as const;
  const drains = drainPositions.map((position, index) =>
    routeBox(
      `route-drain-${index}`,
      position,
      index < 2 ? [0.68, 0.025, 1.25] : [1.25, 0.025, 0.68],
      "#202d31",
    ),
  );
  const drainSlats = drainPositions.flatMap((position, drainIndex) =>
    Array.from({ length: 5 }, (_, slatIndex) => {
      const offset = (slatIndex - 2) * 0.2;
      const vertical = drainIndex < 2;
      return routeBox(
        `route-drain-${drainIndex}-slat-${slatIndex}`,
        [
          position[0] + (vertical ? 0 : offset),
          position[1] + 0.018,
          position[2] + (vertical ? offset : 0),
        ],
        vertical ? [0.56, 0.018, 0.07] : [0.07, 0.018, 0.56],
        "#667377",
      );
    }),
  );
  const curbPaint = [
    routeBox("route-curb-ne", [5.02, 0.325, -10], [0.11, 0.05, 7], "#d2594f"),
    routeBox("route-curb-sw", [-5.02, 0.325, 10], [0.11, 0.05, 7], "#d2594f"),
    routeBox("route-curb-nw", [-10, 0.325, -5.02], [7, 0.05, 0.11], "#d8b957"),
    routeBox("route-curb-se", [10, 0.325, 5.02], [7, 0.05, 0.11], "#d8b957"),
  ];
  const practicalLights: RoutePracticalLight[] = [
    {
      color: "#ffd28d",
      distance: 21,
      id: "route-practical-ne",
      intensity: 24,
      position: [5.8, 4.7, -5.8],
    },
    {
      color: "#b8e9e4",
      distance: 20,
      id: "route-practical-sw",
      intensity: 19,
      position: [-5.8, 4.7, 5.8],
    },
    {
      color: "#ffc77f",
      distance: 20,
      id: "route-practical-nw",
      intensity: 21,
      position: [-5.8, 4.7, -5.8],
    },
    {
      color: "#a9dcd9",
      distance: 20,
      id: "route-practical-se",
      intensity: 17,
      position: [5.8, 4.7, 5.8],
    },
  ];

  if (quality === "desktop") {
    return {
      curbPaint,
      drainSlats,
      drains,
      manholes,
      patches,
      practicalLights,
    };
  }
  return {
    curbPaint: curbPaint.slice(0, 2),
    drainSlats: [],
    drains: drains.slice(0, 2),
    manholes: manholes.slice(0, 2),
    patches: patches.slice(0, 1),
    practicalLights: practicalLights.slice(0, 2),
  };
}

function propsOfKind(
  props: readonly StreetProp[],
  kind: StreetProp["kind"],
): StreetProp[] {
  return props.filter((prop) => prop.kind === kind);
}

export function createAuthoredRoutePlan(layout: CityLayout): AuthoredRoutePlan {
  const limits = STREET_ASSET_LIMITS[layout.quality];
  const bins = closestToRoute(propsOfKind(layout.props, "bin"), limits.bins);
  const barriers = closestToRoute(
    propsOfKind(layout.props, "barrier"),
    limits.barriers,
  );
  const streetlights = closestToRoute(layout.streetlights, limits.streetlights);
  const facadeTargets = AUTHORED_ROUTE_FACADE_TARGETS.slice(
    0,
    layout.quality === "desktop" ? AUTHORED_ROUTE_FACADE_TARGETS.length : 3,
  );
  const facadePlans = facadeTargets.map((target) =>
    createFacadePlan(
      layout.buildings.find((building) => building.id === target.id),
      layout.quality,
      target.side,
      target.includeFireEscape,
    ),
  );
  const proceduralStorefrontPlans = facadeTargets.flatMap((target, index) => {
    if (!target.storefront) return [];
    const building = layout.buildings.find(
      (candidate) => candidate.id === target.id,
    );
    return building
      ? [createStorefrontPlan(building, layout.quality, target.side, index)]
      : [];
  });
  const storefrontPlans = proceduralStorefrontPlans;
  const storefrontGlass = storefrontPlans.flatMap((plan) => plan.glass);
  const signs = storefrontPlans.flatMap((plan) => plan.signs);
  const streetLife = createRouteStreetLifePlan(
    layout.quality,
    storefrontGlass,
    signs,
  );
  const surface = createRouteSurfacePlan(layout.quality);
  const licensedPropIds = new Set(
    [...bins, ...barriers].map((prop) => prop.id),
  );
  const suppressedPropIds = layout.props
    .filter(
      (prop) =>
        Math.abs(prop.position[0]) <= 24 &&
        Math.abs(prop.position[2]) <= 24 &&
        !licensedPropIds.has(prop.id),
    )
    .map((prop) => prop.id);

  return {
    ...streetLife,
    awnings: storefrontPlans.flatMap((plan) => plan.awnings),
    barriers: barriers.map((barrier) => featurePlacement(barrier, 1)),
    bins: bins.map((bin) => featurePlacement(bin, 1)),
    curbPaint: surface.curbPaint,
    drainSlats: surface.drainSlats,
    drains: surface.drains,
    facade: facadePlans.flatMap((plan) => plan.facade),
    fireEscapes: facadePlans.flatMap((plan) => plan.fireEscapes),
    licensedPropIds: [...licensedPropIds],
    licensedStreetlightIds: streetlights.map((light) => light.id),
    manholes: surface.manholes,
    practicalLights: surface.practicalLights,
    signs,
    streetlights: streetlights.map((light) => featurePlacement(light, 3.1)),
    storefrontFrames: storefrontPlans.flatMap((plan) => plan.frames),
    storefrontGlass,
    suppressedPropIds,
    surfacePatches: surface.patches,
  };
}
