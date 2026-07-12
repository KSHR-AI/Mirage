import type {
  BoxInstance,
  BuildingInstance,
  CityLayout,
  CityQuality,
  CityVec3,
} from "./types";

export const SIGNATURE_CORNER_BUILDING_ID = "building--14-14-1";

export type SignatureCornerMass = {
  readonly chamfer: number;
  readonly id: string;
  readonly position: CityVec3;
  readonly scale: CityVec3;
};

export type SignatureCornerPlan = {
  readonly frames: readonly BoxInstance[];
  readonly glass: readonly BoxInstance[];
  readonly groundStructure: readonly BoxInstance[];
  readonly lightPanels: readonly BoxInstance[];
  readonly mass: SignatureCornerMass;
  readonly roof: readonly BoxInstance[];
  readonly trim: readonly BoxInstance[];
};

export function findSignatureCornerBuilding(
  layout: CityLayout,
): BuildingInstance | undefined {
  return layout.buildings.find(
    (building) => building.id === SIGNATURE_CORNER_BUILDING_ID,
  );
}

export function replaceSignatureCornerBuilding(layout: CityLayout): CityLayout {
  return {
    ...layout,
    buildings: layout.buildings.filter(
      (building) => building.id !== SIGNATURE_CORNER_BUILDING_ID,
    ),
    roofDetails: layout.roofDetails.filter(
      (detail) => !detail.id.startsWith(`${SIGNATURE_CORNER_BUILDING_ID}-`),
    ),
    windows: layout.windows.filter(
      (window) => !window.id.startsWith(`${SIGNATURE_CORNER_BUILDING_ID}-`),
    ),
  };
}

export function createSignatureCornerPlan(
  building: BuildingInstance,
  quality: CityQuality,
): SignatureCornerPlan {
  const [centerX, centerY, centerZ] = building.position;
  const [width, height, depth] = building.scale;
  const baseY = centerY - height / 2;
  const minX = centerX - width / 2;
  const maxX = centerX + width / 2;
  const minZ = centerZ - depth / 2;
  const maxZ = centerZ + depth / 2;
  const chamfer = Math.min(2.15, width * 0.29, depth * 0.29);
  const groundHeight = Math.min(4.35, height * 0.24);
  const upperHeight = height - groundHeight;
  const wallInset = 0.42;
  const groundStructure: BoxInstance[] = [];
  const glass: BoxInstance[] = [];
  const frames: BoxInstance[] = [];
  const trim: BoxInstance[] = [];
  const lightPanels: BoxInstance[] = [];
  const roof: BoxInstance[] = [];

  const addBox = (
    collection: BoxInstance[],
    id: string,
    position: CityVec3,
    scale: CityVec3,
    color: string,
    rotationY = 0,
  ) => {
    collection.push({
      color,
      id: `${building.id}-${id}`,
      position,
      rotationY,
      scale,
    });
  };

  const southSpan = width - chamfer;
  const eastSpan = depth - chamfer;
  addBox(
    groundStructure,
    "ground-south-wall",
    [minX + southSpan / 2, baseY + groundHeight / 2, minZ + wallInset],
    [southSpan, groundHeight, 0.36],
    "#26383b",
  );
  addBox(
    groundStructure,
    "ground-east-wall",
    [maxX - wallInset, baseY + groundHeight / 2, maxZ - eastSpan / 2],
    [0.36, groundHeight, eastSpan],
    "#26383b",
  );
  addBox(
    groundStructure,
    "ground-west-wall",
    [minX + 0.2, baseY + groundHeight / 2, centerZ],
    [0.4, groundHeight, depth],
    "#1b2b2f",
  );
  addBox(
    groundStructure,
    "ground-north-wall",
    [centerX, baseY + groundHeight / 2, maxZ - 0.2],
    [width, groundHeight, 0.4],
    "#1b2b2f",
  );

  const portalCenter: CityVec3 = [
    maxX - chamfer / 2 - 0.055,
    baseY + 1.72,
    minZ + chamfer / 2 - 0.055,
  ];
  const portalSpan = chamfer * Math.SQRT2 - 0.54;
  addBox(
    glass,
    "portal-glass",
    portalCenter,
    [portalSpan, 3.18, 0.1],
    "#7fc6cb",
    -Math.PI / 4,
  );
  for (const side of [-1, 1] as const) {
    const along = (portalSpan / 2 + 0.15) * side;
    addBox(
      frames,
      `portal-jamb-${side}`,
      [
        portalCenter[0] + Math.cos(-Math.PI / 4) * along,
        portalCenter[1],
        portalCenter[2] - Math.sin(-Math.PI / 4) * along,
      ],
      [0.16, 3.5, 0.18],
      "#111c1f",
      -Math.PI / 4,
    );
  }
  addBox(
    frames,
    "portal-mullion",
    portalCenter,
    [0.11, 3.14, 0.16],
    "#111c1f",
    -Math.PI / 4,
  );
  addBox(
    trim,
    "portal-canopy",
    [portalCenter[0] + 0.22, baseY + 3.64, portalCenter[2] - 0.22],
    [portalSpan + 0.72, 0.18, 1.12],
    "#c95248",
    -Math.PI / 4,
  );
  addBox(
    lightPanels,
    "portal-light",
    [portalCenter[0] + 0.44, baseY + 3.57, portalCenter[2] - 0.44],
    [portalSpan * 0.72, 0.09, 0.12],
    "#ffc78c",
    -Math.PI / 4,
  );

  const groundBayCount = quality === "desktop" ? 3 : 2;
  addGroundFloorBays({
    addBox,
    frames,
    glass,
    lightPanels,
    baseY,
    count: groundBayCount,
    end: maxX - chamfer - 0.35,
    fixed: minZ - 0.035,
    id: "south",
    start: minX + 0.35,
    vertical: false,
  });
  addGroundFloorBays({
    addBox,
    frames,
    glass,
    lightPanels,
    baseY,
    count: groundBayCount,
    end: maxZ - 0.35,
    fixed: maxX + 0.035,
    id: "east",
    start: minZ + chamfer + 0.35,
    vertical: true,
  });

  const floorCount = Math.max(
    3,
    Math.min(quality === "desktop" ? 5 : 3, Math.floor(upperHeight / 2.9)),
  );
  for (let floor = 0; floor < floorCount; floor += 1) {
    const y = baseY + groundHeight + 1.58 + floor * 2.9;
    if (y > baseY + height - 1.25) break;
    addUpperWindows({
      addBox,
      frames,
      glass,
      lightPanels,
      floor,
      y,
      end: maxX - chamfer - 0.42,
      fixed: minZ - 0.045,
      id: "south",
      start: minX + 0.42,
      vertical: false,
    });
    addUpperWindows({
      addBox,
      frames,
      glass,
      lightPanels,
      floor,
      y,
      end: maxZ - 0.42,
      fixed: maxX + 0.045,
      id: "east",
      start: minZ + chamfer + 0.42,
      vertical: true,
    });
    addBox(
      trim,
      `south-belt-${floor}`,
      [minX + southSpan / 2, y - 1.25, minZ - 0.08],
      [southSpan, 0.13, 0.22],
      "#647276",
    );
    addBox(
      trim,
      `east-belt-${floor}`,
      [maxX + 0.08, y - 1.25, maxZ - eastSpan / 2],
      [0.22, 0.13, eastSpan],
      "#647276",
    );
  }

  addBox(
    trim,
    "south-cornice",
    [minX + southSpan / 2, baseY + height - 0.34, minZ - 0.13],
    [southSpan + 0.24, 0.42, 0.36],
    "#849094",
  );
  addBox(
    trim,
    "east-cornice",
    [maxX + 0.13, baseY + height - 0.34, maxZ - eastSpan / 2],
    [0.36, 0.42, eastSpan + 0.24],
    "#849094",
  );
  addBox(
    trim,
    "corner-cornice",
    [
      maxX - chamfer / 2 + 0.08,
      baseY + height - 0.34,
      minZ + chamfer / 2 - 0.08,
    ],
    [chamfer * Math.SQRT2 + 0.3, 0.42, 0.36],
    "#849094",
    -Math.PI / 4,
  );
  const cornerSignCenter: CityVec3 = [
    maxX - chamfer / 2 + 0.075,
    baseY + groundHeight + Math.min(6.1, upperHeight * 0.42),
    minZ + chamfer / 2 - 0.075,
  ];
  addBox(
    trim,
    "corner-sign-spine",
    cornerSignCenter,
    [0.82, Math.min(7.4, upperHeight * 0.52), 0.16],
    "#172326",
    -Math.PI / 4,
  );
  for (let marker = 0; marker < 4; marker += 1) {
    addBox(
      lightPanels,
      `corner-sign-marker-${marker}`,
      [
        cornerSignCenter[0] + 0.07,
        cornerSignCenter[1] - 2.45 + marker * 1.62,
        cornerSignCenter[2] - 0.07,
      ],
      [marker % 2 === 0 ? 0.48 : 0.3, 0.18, 0.08],
      marker % 2 === 0 ? "#ff765f" : "#72e0d8",
      -Math.PI / 4,
    );
  }
  const upperCenterY = baseY + groundHeight + upperHeight / 2;
  const verticalTrimHeight = Math.max(1, upperHeight - 0.7);
  addBox(
    trim,
    "south-west-pier",
    [minX + 0.14, upperCenterY, minZ - 0.1],
    [0.28, verticalTrimHeight, 0.25],
    "#728084",
  );
  addBox(
    trim,
    "south-corner-pier",
    [maxX - chamfer - 0.12, upperCenterY, minZ - 0.1],
    [0.3, verticalTrimHeight, 0.25],
    "#728084",
  );
  addBox(
    trim,
    "east-corner-pier",
    [maxX + 0.1, upperCenterY, minZ + chamfer + 0.12],
    [0.25, verticalTrimHeight, 0.3],
    "#728084",
  );
  addBox(
    trim,
    "east-north-pier",
    [maxX + 0.1, upperCenterY, maxZ - 0.14],
    [0.25, verticalTrimHeight, 0.28],
    "#728084",
  );

  addBox(
    roof,
    "roof-house",
    [centerX - width * 0.12, baseY + height + 0.72, centerZ + depth * 0.08],
    [width * 0.46, 1.25, depth * 0.42],
    "#26383c",
  );
  addBox(
    roof,
    "roof-vent",
    [centerX + width * 0.21, baseY + height + 0.52, centerZ + depth * 0.16],
    [width * 0.18, 0.78, depth * 0.2],
    "#6e7674",
  );
  addBox(
    roof,
    "roof-beacon-mast",
    [centerX - width * 0.16, baseY + height + 2.25, centerZ + depth * 0.08],
    [0.12, 2.25, 0.12],
    "#909a98",
  );
  addBox(
    lightPanels,
    "roof-beacon",
    [centerX - width * 0.16, baseY + height + 3.4, centerZ + depth * 0.08],
    [0.28, 0.28, 0.28],
    "#ff6a57",
  );

  return {
    frames,
    glass,
    groundStructure,
    lightPanels,
    mass: {
      chamfer,
      id: `${building.id}-upper-mass`,
      position: [centerX, baseY + groundHeight, centerZ],
      scale: [width, upperHeight, depth],
    },
    roof,
    trim,
  };
}

type AddBox = (
  collection: BoxInstance[],
  id: string,
  position: CityVec3,
  scale: CityVec3,
  color: string,
  rotationY?: number,
) => void;

type BayOptions = {
  readonly addBox: AddBox;
  readonly baseY: number;
  readonly count: number;
  readonly end: number;
  readonly fixed: number;
  readonly frames: BoxInstance[];
  readonly glass: BoxInstance[];
  readonly id: string;
  readonly lightPanels: BoxInstance[];
  readonly start: number;
  readonly vertical: boolean;
};

function addGroundFloorBays(options: BayOptions) {
  const span = options.end - options.start;
  const bay = span / options.count;
  for (let index = 0; index < options.count; index += 1) {
    const along = options.start + bay * (index + 0.5);
    const position: CityVec3 = options.vertical
      ? [options.fixed, options.baseY + 1.72, along]
      : [along, options.baseY + 1.72, options.fixed];
    options.addBox(
      options.glass,
      `${options.id}-shop-glass-${index}`,
      position,
      options.vertical ? [0.1, 2.92, bay * 0.78] : [bay * 0.78, 2.92, 0.1],
      index % 2 === 0 ? "#78b7ba" : "#a98f83",
    );
    options.addBox(
      options.frames,
      `${options.id}-shop-mullion-${index}`,
      options.vertical
        ? [options.fixed + 0.02, options.baseY + 1.72, along - bay * 0.43]
        : [along - bay * 0.43, options.baseY + 1.72, options.fixed - 0.02],
      options.vertical ? [0.15, 3.2, 0.12] : [0.12, 3.2, 0.15],
      "#111c1f",
    );
    options.addBox(
      options.lightPanels,
      `${options.id}-shop-light-${index}`,
      options.vertical
        ? [options.fixed + 0.04, options.baseY + 3.52, along]
        : [along, options.baseY + 3.52, options.fixed - 0.04],
      options.vertical ? [0.12, 0.16, bay * 0.7] : [bay * 0.7, 0.16, 0.12],
      index % 2 === 0 ? "#f8bc77" : "#78d9d2",
    );
  }
}

type UpperWindowOptions = Omit<BayOptions, "baseY" | "count"> & {
  readonly floor: number;
  readonly y: number;
};

function addUpperWindows(options: UpperWindowOptions) {
  const count = 3;
  const span = options.end - options.start;
  const bay = span / count;
  for (let index = 0; index < count; index += 1) {
    const along = options.start + bay * (index + 0.5);
    const position: CityVec3 = options.vertical
      ? [options.fixed, options.y, along]
      : [along, options.y, options.fixed];
    const windowScale: CityVec3 = options.vertical
      ? [0.1, 1.5, bay * 0.58]
      : [bay * 0.58, 1.5, 0.1];
    options.addBox(
      options.glass,
      `${options.id}-window-${options.floor}-${index}`,
      position,
      windowScale,
      (options.floor + index) % 3 === 0 ? "#e9b777" : "#70a5aa",
    );
    options.addBox(
      options.frames,
      `${options.id}-window-frame-${options.floor}-${index}`,
      position,
      options.vertical ? [0.13, 1.74, bay * 0.7] : [bay * 0.7, 1.74, 0.13],
      "#172225",
    );
    options.addBox(
      options.glass,
      `${options.id}-window-pane-${options.floor}-${index}`,
      options.vertical
        ? [options.fixed + 0.025, options.y, along]
        : [along, options.y, options.fixed - 0.025],
      windowScale,
      (options.floor + index) % 3 === 0 ? "#e9b777" : "#70a5aa",
    );
    if ((options.floor + index) % 3 === 0) {
      options.addBox(
        options.lightPanels,
        `${options.id}-window-light-${options.floor}-${index}`,
        options.vertical
          ? [options.fixed - 0.055, options.y, along]
          : [along, options.y, options.fixed + 0.055],
        options.vertical
          ? [0.055, 1.28, bay * 0.48]
          : [bay * 0.48, 1.28, 0.055],
        "#e7b777",
      );
    }
  }
}
