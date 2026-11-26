import type { JsonValue, PublishedGame } from "./schema";

export type EvidenceState = "recorded" | "partial" | "missing";

export type EvidenceKey =
  "source" | "prompt" | "lineage" | "license" | "snapshot" | "interventions";

export type EvidenceSignal = {
  key: EvidenceKey;
  label: string;
  state: EvidenceState;
  value: string;
  /** The record's own explanation, where it gives one. */
  note: string | null;
};

/**
 * Reports what a record states, never a grade: each signal is a recorded fact,
 * a partial record, or an explicit absence.
 */
export function getEvidenceSignals(
  game: PublishedGame,
): readonly EvidenceSignal[] {
  return [
    sourceSignal(game),
    promptSignal(game),
    lineageSignal(game),
    licenseSignal(game),
    snapshotSignal(game),
    interventionsSignal(game),
  ];
}

/** Returns null when the record names no model. */
export function getRecordedModel(game: Pick<PublishedGame, "model">) {
  return isUnknown(game.model) ? null : game.model;
}

export function getModelLabel(game: Pick<PublishedGame, "model">) {
  return getRecordedModel(game) ?? "Model not recorded";
}

/** Each model the record names; several when a run used more than one. */
export function getRecordedModels(
  game: Pick<PublishedGame, "model" | "provenance">,
): readonly string[] {
  const recorded = game.provenance.model;
  const names = Array.isArray(recorded) ? recorded : [game.model];
  return names.filter(
    (name): name is string => typeof name === "string" && !isUnknown(name),
  );
}

/** Returns null when the record names no harness. */
export function getRecordedHarness(game: Pick<PublishedGame, "provenance">) {
  const harness = game.provenance.harness;
  return typeof harness === "string" && !isUnknown(harness) ? harness : null;
}

export type RegistryStats = {
  runs: number;
  models: number;
  latestBuild: string | null;
};

export function getRegistryStats(
  games: readonly PublishedGame[],
): RegistryStats {
  const models = new Set<string>();
  let latestBuild: string | null = null;

  for (const game of games) {
    for (const model of getRecordedModels(game)) {
      models.add(model.toLowerCase());
    }
    if (game.builtOn && (!latestBuild || game.builtOn > latestBuild)) {
      latestBuild = game.builtOn;
    }
  }

  return { runs: games.length, models: models.size, latestBuild };
}

/** Newest build first; undated records last; ties keep ID order. */
export function sortByBuildDate<
  Game extends Pick<PublishedGame, "builtOn" | "id">,
>(games: readonly Game[]): Game[] {
  return [...games].sort((left, right) => {
    if (left.builtOn !== right.builtOn) {
      if (left.builtOn === null) return 1;
      if (right.builtOn === null) return -1;
      return left.builtOn < right.builtOn ? 1 : -1;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

export function formatBuildDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function sourceSignal(game: PublishedGame): EvidenceSignal {
  return game.source
    ? {
        key: "source",
        label: "Source",
        state: "recorded",
        value: game.source.commit.slice(0, 7),
        note: null,
      }
    : {
        key: "source",
        label: "Source",
        state: "missing",
        value: "Not published",
        note: null,
      };
}

function promptSignal(game: PublishedGame): EvidenceSignal {
  const prompt = game.provenance.prompt;
  const status = isJsonObject(prompt) ? prompt.status : null;
  const note =
    isJsonObject(prompt) && typeof prompt.note === "string"
      ? prompt.note
      : null;
  const [state, value]: [EvidenceState, string] =
    status === "published"
      ? ["recorded", "Published"]
      : status === "partial"
        ? ["partial", "Partial"]
        : ["missing", "Not recorded"];
  return { key: "prompt", label: "Prompt", state, value, note };
}

function lineageSignal(game: PublishedGame): EvidenceSignal {
  if (game.lineage.kind === "independent") {
    return {
      key: "lineage",
      label: "Lineage",
      state: "recorded",
      value: "Independent",
      note: `Neutral seed ${game.lineage.seedDigest}`,
    };
  }
  if (game.lineage.kind === "derived") {
    return {
      key: "lineage",
      label: "Lineage",
      state: "recorded",
      value: "Derived",
      note: `Parent ${game.lineage.parentId} at ${game.lineage.parentSource.commit}`,
    };
  }
  return {
    key: "lineage",
    label: "Lineage",
    state: "missing",
    value: "Unverified",
    note: game.lineage.note,
  };
}

function licenseSignal(game: PublishedGame): EvidenceSignal {
  const code = game.licenses.code;
  return typeof code === "string" && code !== "NOASSERTION" && !isUnknown(code)
    ? {
        key: "license",
        label: "Code license",
        state: "recorded",
        value: code,
        note: null,
      }
    : {
        key: "license",
        label: "Code license",
        state: "missing",
        value: "No assertion",
        note: null,
      };
}

function snapshotSignal(game: PublishedGame): EvidenceSignal {
  const snapshot = game.provenance.modelSnapshot;
  return typeof snapshot === "string" && !isUnknown(snapshot)
    ? {
        key: "snapshot",
        label: "Model snapshot",
        state: "recorded",
        value: snapshot,
        note: null,
      }
    : {
        key: "snapshot",
        label: "Model snapshot",
        state: "missing",
        value: "Not recorded",
        note: null,
      };
}

function interventionsSignal(game: PublishedGame): EvidenceSignal {
  const count = game.provenance.humanInterventions;
  return typeof count === "number"
    ? {
        key: "interventions",
        label: "Human interventions",
        state: "recorded",
        value: String(count),
        note: null,
      }
    : {
        key: "interventions",
        label: "Human interventions",
        state: "missing",
        value: "Not recorded",
        note: null,
      };
}

function isUnknown(value: string) {
  return value.trim() === "" || value.trim().toLowerCase() === "unknown";
}

function isJsonObject(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
