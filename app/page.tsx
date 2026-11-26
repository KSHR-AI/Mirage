import { ArrowRight, Play } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { INITIAL_RATING, K_FACTOR } from "./arena/elo";
import { loadRatings } from "./arena/ratings";
import { BenchBoard, type RunLink } from "./bench/BenchBoard";
import { ProviderMark } from "./bench/ProviderMark";
import { getEntryForRun, getEntryLabel } from "./bench/entries";
import { GameCover } from "./gallery/RunParts";
import { SUBMIT_HASH } from "./gallery/SubmitDialog";
import { formatBuildDate, getModelLabel } from "./registry/evidence";
import { loadPublishedRegistry } from "./registry/load";
import { getCanonicalPlayPath } from "./registry/urls";
import { SiteFooter, SiteHeader } from "./site/SiteChrome";
import styles from "./bench/Page.module.css";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [registry, arena] = await Promise.all([
    loadPublishedRegistry(),
    loadRatings(),
  ]);

  const runLinks: Record<string, RunLink> = {};
  for (const game of registry.games) {
    runLinks[game.id] = { id: game.id, title: game.title };
  }

  // Every published run is listed, in registry order.
  const listedRuns = registry.games.map((game) => ({
    game,
    entry: getEntryForRun(game.id),
  }));

  return (
    <div className={styles.page}>
      <SiteHeader onBoard current="leaderboard" />
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
              Each published run is a deployed game, listed as soon as it is
              accepted. Play it in the sandboxed player, or open its record.
            </p>
            <p className={styles.phoneNote}>
              Most runs expect a keyboard and mouse. Browse here, then copy the
              link to play on a computer.
            </p>
          </div>

          {registry.kind === "ready" ? (
            <ol className={styles.runGrid}>
              {listedRuns.map(({ game, entry }) => {
                return (
                  <li key={game.id} className={styles.runCard}>
                    <Link href={`/runs/${game.id}`} className={styles.runCover}>
                      <GameCover game={game} />
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
                      </div>
                      {game.tagline ? (
                        <p className={styles.runVerdict}>{game.tagline}</p>
                      ) : null}
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
              The leaderboard ranks every published run by Arena Elo, each
              labelled with the model and harness that built it. In the{" "}
              <Link href="/arena">arena</Link>, a visitor plays two runs and
              votes for one, or calls a tie. Each vote is a standard Elo update
              with K = {K_FACTOR}: the winner takes points from the loser, more
              for an upset.
            </p>
            <p>
              Every run starts at {INITIAL_RATING}. There are no maintainer
              scores: a rating moves only with votes, and the record for each
              run shows only what its submission states.
            </p>
          </div>
          <div className={styles.callout}>
            <div>
              <h3>Why model + harness?</h3>
              <p>
                The same model scores differently in different agents: tools,
                context management, and browser access change what ships. Every
                run names both, so one model can appear several times: once per
                run, in each harness it was tried in.
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
    </div>
  );
}
