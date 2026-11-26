import { ArrowRight, Play } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { K_FACTOR, PROVISIONAL_VOTES } from "./arena/elo";
import { loadRatings } from "./arena/ratings";
import { BenchBoard, type RunLink } from "./bench/BenchBoard";
import { ProviderMark } from "./bench/ProviderMark";
import {
  ENTRIES,
  INDEX_VERSION,
  METRICS,
  RUN_SCORES,
  getEntry,
  getEntryLabel,
} from "./bench/scores";
import { SubmitDialog, SUBMIT_HASH } from "./gallery/SubmitDialog";
import { GameCover } from "./gallery/RunParts";
import { formatBuildDate, getModelLabel } from "./registry/evidence";
import { loadPublishedRegistry } from "./registry/load";
import { loadSubmitPrompt } from "./registry/load-submit-prompt";
import { getCanonicalPlayPath } from "./registry/urls";
import { SiteFooter, SiteHeader } from "./site/SiteChrome";
import styles from "./bench/Page.module.css";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [registry, submitPrompt, arena] = await Promise.all([
    loadPublishedRegistry(),
    loadSubmitPrompt(),
    loadRatings(),
  ]);

  const runLinks: Record<string, RunLink> = {};
  for (const game of registry.games) {
    runLinks[game.id] = { id: game.id, title: game.title };
  }

  // Every published run is listed; scored runs first by index, then runs
  // still waiting for scores in registry order.
  const runScores = new Map(RUN_SCORES.map((run) => [run.runId, run]));
  const listedRuns = registry.games
    .map((game) => ({ game, score: runScores.get(game.id) ?? null }))
    .sort((a, b) => (b.score?.index ?? -1) - (a.score?.index ?? -1));

  return (
    <div className={styles.page}>
      <SiteHeader onBoard current="leaderboard" submitHref={SUBMIT_HASH} />
      <main className={styles.main}>
        <BenchBoard
          runs={runLinks}
          ratings={arena.ratings}
          totalVotes={arena.totalVotes}
          arenaStatus={arena.status}
        />

        <section
          className={styles.section}
          id="runs"
          aria-labelledby="runs-title"
        >
          <div className={styles.sectionHead}>
            <h2 id="runs-title">Playable runs</h2>
            <p>
              Each published run is a deployed game. Scored runs are rated on
              the same {METRICS.length} evaluations as their model + harness
              pair; new runs appear here as soon as they are accepted. Open a
              run for its breakdown and full record, or play it in the sandboxed
              player.
            </p>
          </div>

          {registry.kind === "ready" ? (
            <ol className={styles.runGrid}>
              {listedRuns.map(({ game, score: run }, i) => {
                const entry = run ? getEntry(run.entryId) : null;
                return (
                  <li key={game.id} className={styles.runCard}>
                    <Link href={`/runs/${game.id}`} className={styles.runCover}>
                      <GameCover game={game} />
                      {run ? (
                        <span className={styles.runRank}>#{i + 1}</span>
                      ) : null}
                    </Link>
                    <div className={styles.runBody}>
                      <div className={styles.runTitleRow}>
                        <div>
                          <h3>
                            <Link href={`/runs/${game.id}`}>{game.title}</Link>
                          </h3>
                          {entry ? (
                            <p className={styles.runPair}>
                              <ProviderMark
                                provider={entry.provider}
                                size={16}
                              />
                              {getEntryLabel(entry)}
                            </p>
                          ) : (
                            <p className={styles.runPair}>
                              {getModelLabel(game)}
                            </p>
                          )}
                        </div>
                        {run ? (
                          <span
                            className={styles.runScore}
                            aria-label={`Index ${run.index}`}
                          >
                            {run.index}
                          </span>
                        ) : null}
                      </div>
                      {run ? (
                        <>
                          <ul className={styles.miniBars}>
                            {METRICS.map((m) => (
                              <li key={m.key}>
                                <span>{m.short}</span>
                                <i style={{ width: `${run.scores[m.key]}%` }} />
                                <b>{run.scores[m.key]}</b>
                              </li>
                            ))}
                          </ul>
                          <p className={styles.runVerdict}>{run.verdict}</p>
                        </>
                      ) : (
                        <p className={styles.runVerdict}>
                          Accepted and playable. Not scored yet.
                        </p>
                      )}
                      <div className={styles.runActions}>
                        <Link
                          href={getCanonicalPlayPath(game)}
                          className={styles.primaryButton}
                        >
                          <Play aria-hidden="true" weight="fill" />
                          Play
                        </Link>
                        <Link
                          href={`/runs/${game.id}`}
                          className={styles.textButton}
                        >
                          Details
                          <ArrowRight aria-hidden="true" />
                        </Link>
                        {game.builtOn ? (
                          <span className={styles.runDate}>
                            {formatBuildDate(game.builtOn)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={styles.notice}>{registry.message}</p>
          )}
        </section>

        <section
          className={styles.section}
          id="methodology"
          aria-labelledby="methodology-title"
        >
          <div className={styles.sectionHead}>
            <h2 id="methodology-title">Methodology</h2>
            <p>
              The leaderboard ranks {ENTRIES.length} model + harness pairs by
              Arena Elo. In the <Link href="/arena">arena</Link>, a visitor
              plays two runs from different pairs and votes for one, or calls a
              tie. Each vote is a standard Elo update with K = {K_FACTOR}: the
              winner takes points from the loser, more for an upset. A pair is
              provisional until it has {PROVISIONAL_VOTES} votes, and the ±
              beside each rating narrows as votes come in.
            </p>
            <p>
              Ratings start from seed scores the maintainers set: MirageML Bench
              Index {INDEX_VERSION}, the equal-weighted mean of {METRICS.length}{" "}
              evaluations scored 0–100. Index 45 seeds at 1500 Elo, and each
              index point is worth 10 Elo. Pairs without a published run cannot
              appear in the arena yet, so they keep their seed.
            </p>
          </div>
          <ol className={styles.evalGrid}>
            {METRICS.map((metric, i) => (
              <li key={metric.key}>
                <span className={styles.evalNumber}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{metric.label}</h3>
                <p>{metric.description}</p>
                <span className={styles.evalWeight}>
                  Weight {Math.round(100 / METRICS.length)}%
                </span>
              </li>
            ))}
          </ol>
          <div className={styles.callout}>
            <div>
              <h3>Why model + harness?</h3>
              <p>
                The same model scores differently in different agents: tools,
                context management, and browser access change what ships. Every
                entry names both, and a model appears once per harness it was
                run in.
              </p>
            </div>
            <a className={styles.primaryButton} href={SUBMIT_HASH}>
              Submit a run
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
      <SubmitDialog prompt={submitPrompt} />
    </div>
  );
}
