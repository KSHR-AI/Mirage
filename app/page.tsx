import { ArrowRight, Play } from "@phosphor-icons/react/ssr";
import Link from "next/link";
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
import { formatBuildDate } from "./registry/evidence";
import { loadPublishedRegistry } from "./registry/load";
import { loadSubmitPrompt } from "./registry/load-submit-prompt";
import { getCanonicalPlayPath } from "./registry/urls";
import { SiteFooter, SiteHeader } from "./site/SiteChrome";
import styles from "./bench/Page.module.css";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [registry, submitPrompt] = await Promise.all([
    loadPublishedRegistry(),
    loadSubmitPrompt(),
  ]);

  const gamesById = new Map(registry.games.map((game) => [game.id, game]));
  const runLinks: Record<string, RunLink> = {};
  for (const game of registry.games) {
    runLinks[game.id] = { id: game.id, title: game.title };
  }

  const scoredRuns = [...RUN_SCORES]
    .filter((run) => gamesById.has(run.runId))
    .sort((a, b) => b.index - a.index);

  return (
    <div className={styles.page}>
      <SiteHeader onBoard submitHref={SUBMIT_HASH} />
      <main className={styles.main}>
        <BenchBoard runs={runLinks} />

        <section
          className={styles.section}
          id="runs"
          aria-labelledby="runs-title"
        >
          <div className={styles.sectionHead}>
            <h2 id="runs-title">Playable runs</h2>
            <p>
              Each published run is a deployed game, scored on the same{" "}
              {METRICS.length} evaluations as its model + harness pair. Open a
              run for its full breakdown and evidence, or play it in the
              sandboxed player.
            </p>
          </div>

          {registry.kind === "ready" ? (
            <ol className={styles.runGrid}>
              {scoredRuns.map((run, i) => {
                const game = gamesById.get(run.runId)!;
                const entry = getEntry(run.entryId);
                return (
                  <li key={run.runId} className={styles.runCard}>
                    <Link href={`/runs/${game.id}`} className={styles.runCover}>
                      <GameCover game={game} />
                      <span className={styles.runRank}>#{i + 1}</span>
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
                          ) : null}
                        </div>
                        <span
                          className={styles.runScore}
                          aria-label={`Index ${run.index}`}
                        >
                          {run.index}
                        </span>
                      </div>
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
              MirageML Bench Index {INDEX_VERSION} is the equal-weighted mean of{" "}
              {METRICS.length} evaluations, each scored 0–100 by judges who play
              the deployed game in the sandboxed player. A pair&rsquo;s score
              averages its trials; {ENTRIES.length} model + harness pairs are
              ranked.
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
