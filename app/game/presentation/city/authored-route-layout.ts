import type {
  BuildingInstance,
  CityLayout,
  CityQuality,
  CityVec3,
  PointFeature,
  StreetProp,
} from "./types";

export const AUTHORED_ROUTE_FACADE_TARGET = "building-14-14-0";

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
  readonly barriers: readonly AuthoredModelPlacement[];
  readonly bins: readonly AuthoredModelPlacement[];
  readonly facade: readonly AuthoredFacadePlacement[];
  readonly fireEscapes: readonly AuthoredModelPlacement[];
  readonly licensedPropIds: readonly string[];
  readonly licensedStreetlightIds: readonly string[];
  readonly streetlights: readonly AuthoredModelPlacement[];
};

const ROUTE_ANCHORS = Object.freeze([
  [70, 42],
  [14, -42],
  [-70, -42],
  [0, -114],
] as const);

const STREET_ASSET_LIMITS: Readonly<
  Record<CityQuality, { barriers: number; bins: number; streetlights: number }>
> = Object.freeze({
  desktop: Object.freeze({ barriers: 5, bins: 5, streetlights: 7 }),
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
): AuthoredFacadePlacement {
  return { id, nodeName, position, rotationY: 0, scale };
}

function createFacadePlan(
  building: BuildingInstance | undefined,
  quality: CityQuality,
): {
  facade: AuthoredFacadePlacement[];
  fireEscapes: AuthoredModelPlacement[];
} {
  if (!building) return { facade: [], fireEscapes: [] };

  const facade: AuthoredFacadePlacement[] = [];
  const width = building.scale[0];
  const height = building.scale[1];
  const depth = building.scale[2];
  const baseY = building.position[1] - height / 2;
  const bayCount = Math.max(
    2,
    Math.min(quality === "desktop" ? 3 : 2, Math.floor(width / 2.7)),
  );
  const floorCount = Math.max(
    2,
    Math.min(quality === "desktop" ? 5 : 3, Math.floor(height / 3)),
  );
  const bayWidth = width / bayCount;
  const floorHeight = 3;
  const moduleScale: CityVec3 = [bayWidth / 3, floorHeight / 3, 1];
  const faceZ = building.position[2] - depth / 2 - 0.025;
  const doorBay = Math.floor(bayCount / 2);

  for (let floor = 0; floor < floorCount; floor += 1) {
    const floorY = baseY + floor * floorHeight;
    for (let bay = 0; bay < bayCount; bay += 1) {
      const x = building.position[0] - width / 2 + bayWidth * (bay + 0.5);
      const prefix = `${building.id}-facade-${floor}-${bay}`;
      if (floor === 0 && bay === doorBay) {
        facade.push(
          facadePlacement(
            `${prefix}-wall`,
            AUTHORED_ROUTE_FACADE_NODES.doorWall,
            [x, floorY, faceZ],
            moduleScale,
          ),
          facadePlacement(
            `${prefix}-door`,
            AUTHORED_ROUTE_FACADE_NODES.door,
            [x, floorY, faceZ - 0.055],
            moduleScale,
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
          [x, floorY, faceZ],
          moduleScale,
        ),
        facadePlacement(
          `${prefix}-window`,
          small
            ? AUTHORED_ROUTE_FACADE_NODES.smallWindow
            : AUTHORED_ROUTE_FACADE_NODES.largeWindow,
          [x, floorY, faceZ - 0.055],
          moduleScale,
        ),
      );
    }
  }

  for (let bay = 0; bay < bayCount; bay += 1) {
    const x = building.position[0] - width / 2 + bayWidth * (bay + 0.5);
    facade.push(
      facadePlacement(
        `${building.id}-base-${bay}`,
        AUTHORED_ROUTE_FACADE_NODES.base,
        [x, baseY, faceZ - 0.01],
        [bayWidth / 3, 1, 1],
      ),
      facadePlacement(
        `${building.id}-cornice-${bay}`,
        AUTHORED_ROUTE_FACADE_NODES.cornice,
        [x, baseY + floorCount * floorHeight - 0.18, faceZ - 0.01],
        [bayWidth / 3, 1, 1],
      ),
    );
  }

  if (quality !== "desktop") return { facade, fireEscapes: [] };
  const escapeScale = Math.min(0.86, Math.max(0.58, (height - 1) / 9.76));
  return {
    facade,
    fireEscapes: [
      {
        id: `${building.id}-fire-escape`,
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
  const target = layout.buildings.find(
    (building) => building.id === AUTHORED_ROUTE_FACADE_TARGET,
  );
  const facade = createFacadePlan(target, layout.quality);

  return {
    barriers: barriers.map((barrier) => featurePlacement(barrier, 1)),
    bins: bins.map((bin) => featurePlacement(bin, 1)),
    facade: facade.facade,
    fireEscapes: facade.fireEscapes,
    licensedPropIds: [...bins, ...barriers].map((prop) => prop.id),
    licensedStreetlightIds: streetlights.map((light) => light.id),
    streetlights: streetlights.map((light) => featurePlacement(light, 3.1)),
  };
}
