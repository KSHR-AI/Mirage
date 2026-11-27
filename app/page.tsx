import type { Metadata } from "next";
import { INITIAL_RATING, K_FACTOR, ratingRanks } from "./arena/elo";
import { loadRatings } from "./arena/ratings";
import { BenchBoard, type BoardRow, type BoardRun } from "./bench/BenchBoard";
import {
  BENCH_RUNS,
  getEntryForRun,
  getEntryLabel,
  getModelsLabel,
} from "./bench/entries";
import { getHighlights, type HighlightRow } from "./bench/highlights";
import { SubmitSection } from "./gallery/SubmitSection";
import {
  formatBuildDate,
  getEvidenceSignals,
  getModelLabel,
  getRecordedHarness,
} from "./registry/evidence";
import { loadPublishedRegistry } from "./registry/load";
import { loadSubmitPrompt } from "./registry/load-submit-prompt";
import { getRecordPath } from "./registry/share";
import {
  getDeploymentEntryUrl,
  getPresentationCoverUrl,
  getSourceRevisionUrl,
} from "./registry/urls";
import { SiteFooter, SiteHeader } from "./site/SiteChrome";
import styles from "./bench/Page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Page() {
  const [registry, arena, submitPrompt] = await Promise.all([
    loadPublishedRegistry(),
    loadRatings(),
    loadSubmitPrompt(),
  ]);

  const games = new Map(registry.games.map((game) => [game.id, game]));
  const ranks = ratingRanks(
    BENCH_RUNS.map((run) => run.id),
    arena.ratings,
  );

  // Every leaderboard run, highest Elo first; equal ratings sort by name.
  const ranked = BENCH_RUNS.map((run) => {
    const game = games.get(run.id);
    const standing = arena.ratings[run.id] ?? {
      rating: INITIAL_RATING,
      votes: 0,
    };
    const row: BoardRow = {
      id: run.id,
      title: game?.title ?? run.id,
      provider: run.provider,
      models: getModelsLabel(run),
      harness: run.harness,
      rating: standing.rating,
      votes: standing.votes,
      rank: ranks.get(run.id) ?? 1,
      built: game?.builtOn ? formatBuildDate(game.builtOn) : null,
      published: Boolean(game),
    };
    const highlight: HighlightRow = {
      ...row,
      entryId: run.entryId,
      builtOn: game?.builtOn ?? null,
    };
    return { row, highlight };
  }).sort(
    (a, b) =>
      b.row.rating - a.row.rating ||
      `${a.row.models} · ${a.row.harness} · ${a.row.title}`.localeCompare(
        `${b.row.models} · ${b.row.harness} · ${b.row.title}`,
      ),
  );

  // Every published run is listed, in registry order.
  const runs: BoardRun[] = registry.games.map((game) => {
    const entry = getEntryForRun(game.id);
    return {
      id: game.id,
      title: game.title,
      tagline: game.tagline,
      description: game.description,
      model: game.model,
      pair: entry
        ? { label: getEntryLabel(entry), provider: entry.provider }
        : null,
      modelLabel: getModelLabel(game),
      built: game.builtOn ? formatBuildDate(game.builtOn) : null,
      coverUrl: getPresentationCoverUrl(game),
      coverAlt: game.presentation.coverAlt,
      entryUrl: getDeploymentEntryUrl(game),
      protocolVersion: game.presentation.protocolVersion,
      recordPath: getRecordPath(game),
      deployment: {
        provider: game.deployment.provider,
        url: game.deployment.url,
      },
      source: game.source
        ? {
            url: getSourceRevisionUrl(game.source),
            commit: game.source.commit,
          }
        : null,
      harness: getRecordedHarness(game),
      signals: getEvidenceSignals(game),
      controls: game.presentation.controls,
    };
  });

  return (
    <div className={styles.page}>
      <SiteHeader current="leaderboard" />
      <main className={styles.main}>
        <BenchBoard
          rows={ranked.map((entry) => entry.row)}
          runs={runs}
          highlights={getHighlights(
            ranked.map((entry) => entry.highlight),
            arena.totalVotes,
            formatBuildDate,
          )}
          totalVotes={arena.totalVotes}
          arenaStatus={arena.status}
          notice={registry.kind === "ready" ? null : registry.message}
        />

        <section
          className={styles.section}
          id="methodology"
          aria-labelledby="methodology-title"
        >
          <div className={styles.sectionHead}>
            <h2 id="methodology-title">Methodology</h2>
          </div>
          <div className={styles.method}>
            <div>
              <h3>01 · Play</h3>
              <p>
                In the arena, a visitor plays two runs and votes for one, or
                calls a tie. Who built each run stays hidden until the vote is
                in.
              </p>
            </div>
            <div>
              <h3>02 · Vote</h3>
              <p>
                Each vote is a standard Elo update with K = {K_FACTOR}: the
                winner takes points from the loser, more for an upset. Every run
                starts at {INITIAL_RATING}.
              </p>
            </div>
            <div>
              <h3>03 · Nothing else</h3>
              <p>
                There are no maintainer scores. A rating moves only with votes,
                and the record for each run shows only what its submission
                states.
              </p>
            </div>
            <div>
              <h3>Why model + harness?</h3>
              <p>
                The same model scores differently in different agents: tools,
                context management, and browser access change what ships. Every
                run names both, so one model can appear once per run, in each
                harness it was tried in.
              </p>
            </div>
          </div>
        </section>

        <SubmitSection prompt={submitPrompt} />
      </main>
      <SiteFooter />
    </div>
  );
}
