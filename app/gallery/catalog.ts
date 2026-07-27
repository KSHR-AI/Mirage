import generatedCatalog from "./catalog.generated.json";

const collectionDocument = generatedCatalog.collection as unknown;
const demoDocuments = generatedCatalog.demos as unknown[];

export type CaptureStatus = "published" | "partial" | "not-recorded";

export type DemoProvenance = {
  prompt: {
    status: CaptureStatus;
    text: string | null;
    note: string;
  };
  setup: {
    status: CaptureStatus;
    modelSnapshot: string | null;
    reasoning: string | null;
    harness: string | null;
    tools: string[];
    agentCount: number | null;
    subagentCount: number | null;
    baseCommit: string | null;
    resultCommit: string;
  };
  execution: {
    wallTimeSeconds: number | null;
    totalTokens: number | null;
    costUsd: number | null;
    retries: number | null;
    humanInterventions: number | null;
  };
  dependencies: {
    packageLock: string;
    thirdPartyAssets: number | null;
    licenseStatus: "verified" | "review-required";
  };
};

export type DemoRecord = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  model: string;
  builtOn: string;
  commit: string;
  playUrl: string;
  sourceUrl: string;
  previewImage: string;
  provenance: DemoProvenance;
  features: string[];
};

export type DemoCollection = {
  id: string;
  brandName: string;
  surfaceLabel: string;
  gameTitle: string;
  locationLabel: string;
  title: string;
  summary: string;
  updatedOn: string;
  featuredDemoId: string;
  repositoryUrl: string;
  contribution: {
    guidePath: string;
    slotLabel: string;
    slotDescription: string;
    slotAction: string;
    navAction: string;
  };
  metadata: {
    title: string;
    description: string;
    shareImage: {
      path: string;
      width: number;
      height: number;
      alt: string;
    };
  };
};

function parseCollection(value: unknown): DemoCollection {
  const collection = value as Partial<DemoCollection>;
  if (
    typeof collection.id !== "string" ||
    typeof collection.brandName !== "string" ||
    typeof collection.surfaceLabel !== "string" ||
    typeof collection.gameTitle !== "string" ||
    typeof collection.locationLabel !== "string" ||
    typeof collection.title !== "string" ||
    typeof collection.summary !== "string" ||
    !isIsoDate(collection.updatedOn) ||
    typeof collection.featuredDemoId !== "string" ||
    typeof collection.repositoryUrl !== "string" ||
    typeof collection.contribution?.guidePath !== "string" ||
    typeof collection.contribution.slotLabel !== "string" ||
    typeof collection.contribution.slotDescription !== "string" ||
    typeof collection.contribution.slotAction !== "string" ||
    typeof collection.contribution.navAction !== "string" ||
    typeof collection.metadata?.title !== "string" ||
    typeof collection.metadata.description !== "string" ||
    typeof collection.metadata.shareImage?.path !== "string" ||
    typeof collection.metadata.shareImage.width !== "number" ||
    collection.metadata.shareImage.width <= 0 ||
    typeof collection.metadata.shareImage.height !== "number" ||
    collection.metadata.shareImage.height <= 0 ||
    typeof collection.metadata.shareImage.alt !== "string"
  ) {
    throw new Error("Invalid demo collection");
  }
  return collection as DemoCollection;
}

function parseDemo(value: unknown): DemoRecord {
  const demo = value as Partial<DemoRecord>;
  if (
    typeof demo.id !== "string" ||
    typeof demo.title !== "string" ||
    typeof demo.tagline !== "string" ||
    typeof demo.description !== "string" ||
    typeof demo.model !== "string" ||
    !isIsoDate(demo.builtOn) ||
    typeof demo.commit !== "string" ||
    typeof demo.playUrl !== "string" ||
    typeof demo.sourceUrl !== "string" ||
    typeof demo.previewImage !== "string" ||
    typeof demo.provenance !== "object" ||
    demo.provenance === null ||
    !isCaptureStatus(demo.provenance.prompt?.status) ||
    !isCaptureStatus(demo.provenance.setup?.status) ||
    typeof demo.provenance.prompt.note !== "string" ||
    !Array.isArray(demo.provenance.setup.tools) ||
    typeof demo.provenance.setup.resultCommit !== "string" ||
    typeof demo.provenance.dependencies?.packageLock !== "string" ||
    (demo.provenance.dependencies.licenseStatus !== "verified" &&
      demo.provenance.dependencies.licenseStatus !== "review-required") ||
    !Array.isArray(demo.features) ||
    demo.features.length === 0 ||
    demo.features.some((feature) => typeof feature !== "string")
  ) {
    throw new Error("Invalid demo record");
  }
  return demo as DemoRecord;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function isCaptureStatus(value: unknown): value is CaptureStatus {
  return (
    value === "published" || value === "partial" || value === "not-recorded"
  );
}

export function hasPublishedPrompt(demo: DemoRecord) {
  return (
    demo.provenance.prompt.status === "published" &&
    Boolean(demo.provenance.prompt.text)
  );
}

export function hasPublishedSetup(demo: DemoRecord) {
  const setup = demo.provenance.setup;
  return (
    setup.status === "published" &&
    Boolean(setup.modelSnapshot) &&
    Boolean(setup.reasoning) &&
    Boolean(setup.harness) &&
    setup.tools.length > 0 &&
    setup.agentCount !== null &&
    setup.subagentCount !== null &&
    Boolean(setup.baseCommit) &&
    setup.resultCommit === demo.commit
  );
}

const collection = parseCollection(collectionDocument);
const discoveredDemos = demoDocuments.map((document) =>
  Object.freeze(parseDemo(document)),
);

if (discoveredDemos.length === 0) {
  throw new Error("The demo collection must contain at least one demo");
}

const demoIds = new Set(discoveredDemos.map((demo) => demo.id));
if (demoIds.size !== discoveredDemos.length) {
  throw new Error("Demo identifiers must be unique");
}

const featuredDemo = discoveredDemos.find(
  (demo) => demo.id === collection.featuredDemoId,
);
if (!featuredDemo) {
  throw new Error("The featured demo is missing from the collection");
}

const orderedDemos = [
  featuredDemo,
  ...discoveredDemos
    .filter((demo) => demo.id !== featuredDemo.id)
    .sort((left, right) => right.builtOn.localeCompare(left.builtOn)),
];

export const DEMO_COLLECTION = Object.freeze(collection);
export const DEMOS = Object.freeze(orderedDemos);
export const FEATURED_DEMO = featuredDemo;
