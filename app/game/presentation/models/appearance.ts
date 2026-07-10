import type { ModelQuality, VisualId } from "./types";

export type AgentVisualRole = "player" | "civilian" | "guard" | "police";
export type HairStyle = "crop" | "swept" | "bun" | "cap";

export interface AgentAppearance {
  readonly skin: string;
  readonly hair: string;
  readonly jacket: string;
  readonly shirt: string;
  readonly trousers: string;
  readonly shoes: string;
  readonly accent: string;
  readonly hairStyle: HairStyle;
  readonly heightScale: number;
  readonly shoulderScale: number;
  readonly phase: number;
}

export type VehicleVisualKind =
  | "hero-coupe"
  | "traffic-sedan"
  | "traffic-van"
  | "armored-courier"
  | "police-interceptor";

export interface VehicleAppearance {
  readonly body: string;
  readonly secondary: string;
  readonly cabin: string;
  readonly trim: string;
  readonly interior: string;
  readonly rim: string;
}

export interface ModelGeometryDetail {
  readonly radialSegments: number;
  readonly sphereWidthSegments: number;
  readonly sphereHeightSegments: number;
  readonly roundedSmoothness: number;
}

const SKIN_TONES = [
  "#f2c7a5",
  "#d99c76",
  "#b87554",
  "#8f563f",
  "#603b32",
] as const;

const HAIR_TONES = [
  "#171517",
  "#3a2722",
  "#65452f",
  "#a77445",
  "#d7c3a2",
] as const;

const CIVILIAN_TOPS = [
  "#c95c51",
  "#277c7b",
  "#d5a848",
  "#6b6999",
  "#5683a5",
  "#b76582",
] as const;

const CIVILIAN_SHIRTS = ["#f1e6d2", "#b8d9d4", "#efb26b", "#c8c6de"] as const;

const CIVILIAN_TROUSERS = ["#252a31", "#3d4148", "#243f44", "#51483f"] as const;

const HAIR_STYLES: readonly HairStyle[] = ["crop", "swept", "bun", "cap"];

const TRAFFIC_BODIES = [
  "#b84d45",
  "#2c7c78",
  "#d5a33e",
  "#657ea1",
  "#d9d6cb",
  "#5d586c",
  "#58685e",
] as const;

const TRAFFIC_SECONDARIES = [
  "#e9c86f",
  "#d86f62",
  "#6bb8b3",
  "#ebe7dc",
] as const;

const GEOMETRY_DETAILS: Readonly<Record<ModelQuality, ModelGeometryDetail>> =
  Object.freeze({
    desktop: Object.freeze({
      radialSegments: 16,
      sphereWidthSegments: 20,
      sphereHeightSegments: 14,
      roundedSmoothness: 4,
    }),
    mobile: Object.freeze({
      radialSegments: 8,
      sphereWidthSegments: 10,
      sphereHeightSegments: 7,
      roundedSmoothness: 2,
    }),
  });

function idString(id: VisualId): string {
  if (typeof id === "number") {
    return Number.isFinite(id) ? `${id}` : "0";
  }
  return id;
}

/** Stable FNV-1a hash used only for presentation variation. */
export function hashVisualId(id: VisualId, salt = "mirage"): number {
  const text = `${salt}:${idString(id)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function sample<T>(values: readonly T[], hash: number, shift: number): T {
  return values[(hash >>> shift) % values.length];
}

function roleBase(
  role: AgentVisualRole,
): Omit<
  AgentAppearance,
  "skin" | "hair" | "hairStyle" | "heightScale" | "shoulderScale" | "phase"
> {
  if (role === "player") {
    return {
      jacket: "#174e55",
      shirt: "#e26d5c",
      trousers: "#202831",
      shoes: "#101417",
      accent: "#d7ec62",
    };
  }
  if (role === "guard") {
    return {
      jacket: "#34363b",
      shirt: "#9a503f",
      trousers: "#1d2329",
      shoes: "#101316",
      accent: "#e0a54d",
    };
  }
  if (role === "police") {
    return {
      jacket: "#263f54",
      shirt: "#d8e0df",
      trousers: "#1b2935",
      shoes: "#0c1115",
      accent: "#58bfd0",
    };
  }
  return {
    jacket: CIVILIAN_TOPS[0],
    shirt: CIVILIAN_SHIRTS[0],
    trousers: CIVILIAN_TROUSERS[0],
    shoes: "#202125",
    accent: "#e4ba56",
  };
}

export function getAgentAppearance(
  id: VisualId,
  role: AgentVisualRole,
): AgentAppearance {
  const hash = hashVisualId(id, role);
  const base = roleBase(role);
  const civilian = role === "civilian";
  const appearance: AgentAppearance = {
    ...base,
    jacket: civilian ? sample(CIVILIAN_TOPS, hash, 3) : base.jacket,
    shirt: civilian ? sample(CIVILIAN_SHIRTS, hash, 9) : base.shirt,
    trousers: civilian ? sample(CIVILIAN_TROUSERS, hash, 14) : base.trousers,
    skin: sample(SKIN_TONES, hash, 0),
    hair: sample(HAIR_TONES, hash, 7),
    hairStyle:
      role === "police" || role === "guard"
        ? hash % 3 === 0
          ? "cap"
          : "crop"
        : sample(HAIR_STYLES, hash, 17),
    heightScale: 0.94 + ((hash >>> 22) % 13) / 100,
    shoulderScale: 0.94 + ((hash >>> 18) % 12) / 100,
    phase: ((hash >>> 10) % 628) / 100,
  };
  return Object.freeze(appearance);
}

export function getVehicleAppearance(
  id: VisualId,
  kind: VehicleVisualKind,
): VehicleAppearance {
  const hash = hashVisualId(id, kind);
  if (kind === "hero-coupe") {
    return Object.freeze({
      body: "#d85d4f",
      secondary: "#133e46",
      cabin: "#182b34",
      trim: "#d9e86b",
      interior: "#2b2424",
      rim: "#c9d0ce",
    });
  }
  if (kind === "armored-courier") {
    return Object.freeze({
      body: "#454c47",
      secondary: "#242c2c",
      cabin: "#101a1d",
      trim: "#d69f43",
      interior: "#171b1b",
      rim: "#69716c",
    });
  }
  if (kind === "police-interceptor") {
    return Object.freeze({
      body: "#dbe3e1",
      secondary: "#203847",
      cabin: "#101f2a",
      trim: "#54b9c8",
      interior: "#161d22",
      rim: "#77858a",
    });
  }
  const body = sample(TRAFFIC_BODIES, hash, 0);
  return Object.freeze({
    body,
    secondary: sample(TRAFFIC_SECONDARIES, hash, 12),
    cabin: "#1d3038",
    trim: "#bec8c5",
    interior: "#28272a",
    rim: kind === "traffic-van" ? "#777d78" : "#a7afac",
  });
}

export function getModelGeometryDetail(
  quality: ModelQuality = "desktop",
): ModelGeometryDetail {
  return GEOMETRY_DETAILS[quality];
}

export function clampPresentationSignal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
