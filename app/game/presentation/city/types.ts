export type CityQuality = "mobile" | "desktop";

export type CityVec3 = [number, number, number];

export type CityDistrict =
  | "afterlight"
  | "breakwater"
  | "civic"
  | "grid"
  | "industrial"
  | "painted-row";

export type CityMissionZoneId =
  | "afterlight-spire"
  | "aurora-vault"
  | "breakwater"
  | "courier-yard"
  | "ember-span"
  | "grid-seven"
  | "safehouse";

export type BoxInstance = {
  color: string;
  id: string;
  position: CityVec3;
  rotationY: number;
  scale: CityVec3;
};

export type BuildingInstance = BoxInstance & {
  district: CityDistrict;
  roofHeight: number;
};

export type PointFeature = {
  color: string;
  id: string;
  position: CityVec3;
  rotationY: number;
};

export type StreetProp = PointFeature & {
  kind: "barrier" | "bin" | "bollard" | "hydrant" | "newsbox";
};

export type MissionZone = {
  accent: string;
  id: CityMissionZoneId;
  label: string;
  position: CityVec3;
  radius: number;
};

export type CityLayout = {
  alleys: BoxInstance[];
  buildings: BuildingInstance[];
  crosswalks: BoxInstance[];
  laneMarks: BoxInstance[];
  missionZones: readonly MissionZone[];
  neonSigns: BoxInstance[];
  props: StreetProp[];
  puddles: BoxInstance[];
  quality: CityQuality;
  roads: BoxInstance[];
  roofDetails: BoxInstance[];
  seed: number;
  sidewalks: BoxInstance[];
  streetlights: PointFeature[];
  trafficSignals: PointFeature[];
  trees: PointFeature[];
  windows: BoxInstance[];
};

export type CityDetailLimits = {
  crosswalks: number;
  laneMarks: number;
  neonSigns: number;
  props: number;
  puddles: number;
  streetlights: number;
  trafficSignals: number;
  trees: number;
  windows: number;
};
