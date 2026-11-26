import {
  ArrowLeft,
  ArrowSquareOut,
  GithubLogo,
  Play,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isProvisional, rankByRating } from "../../arena/elo";
import { loadRatings } from "../../arena/ratings";
import { ProviderMark } from "../../bench/ProviderMark";
import {
  ENTRIES,
  METRICS,
  PROVIDERS,
  RUN_SCORES,
  getEntry,
  getEntryLabel,
  getRunScore,
  rankEntries,
} from "../../bench/scores";
import { RegistryNotice } from "../../gallery/RegistryNotice";
import {
  EvidenceGlyph,
  GameCover,
  ShareLinkButton,
} from "../../gallery/RunParts";
import {
  formatBuildDate,
  getEvidenceSignals,
  getModelLabel,
  getRecordedHarness,
} from "../../registry/evidence";
import { loadPublishedRegistry } from "../../registry/load";
import {
  getCanonicalPlayPath,
  getSourceRevisionUrl,
} from "../../registry/urls";
import { SiteFooter, SiteHeader } from "../../site/SiteChrome";
import styles from "../../bench/Page.module.css";

type RunPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: RunPageProps): Promise<Metadata> {
  const { id } = await params;
  const registry = await loadPublishedRegistry();
  const game = registry.games.find((candidate) => candidate.id === id);
  if (!game) return {};
  const score = getRunScore(id);
  const title = `${game.title} — MirageML Bench`;
  const description = score
    ? `${getModelLabel(game)} · Index ${score.index}. ${game.tagline}`
    : game.tagline;
  return {
    title,
    description,
    alternates: { canonical: `/runs/${game.id}` },
    openGraph: { title, description, type: "website", url: `/runs/${game.id}` },
  };
}

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params;
  const [registry, arena] = await Promise.all([
    loadPublishedRegistry(),
    loadRatings(),
  ]);
  if (registry.kind === "unavailable") {
    return <RegistryNotice kind="unavailable" message={registry.message} />;
  }
  const game = registry.games.find((candidate) => candidate.id === id);
  if (!game) notFound();

  const score = getRunScore(game.id);
  const entry = score ? getEntry(score.entryId) : null;
  const runRank = score
    ? [...RUN_SCORES].sort((a, b) => b.index - a.index).indexOf(score) + 1
    : null;
  const entryRank = entry ? rankEntries(ENTRIES).indexOf(entry) + 1 : null;
  const harness = getRecordedHarness(game);
  const signals = getEvidenceSignals(game);
  const others = registry.games.filter((other) => other.id !== game.id);

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.main}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/#runs">
            <ArrowLeft aria-hidden="true" weight="bold" />
            All runs
          </Link>
        </nav>

        <section className={styles.runHero} aria-labelledby="run-title">
          <div className={styles.runHeroCover}>
            <GameCover game={game} />
          </div>
          <div className={styles.runHeroBody}>
            <p className={styles.eyebrow}>Run · {game.id}</p>
            <h1 id="run-title">{game.title}</h1>
            <p className={styles.tagline}>{game.tagline}</p>
            {entry ? (
              <p className={styles.runPair}>
                <ProviderMark provider={entry.provider} size={20} />
                {getEntryLabel(entry)}
              </p>
            ) : null}

            {score ? (
              <div className={styles.scoreRow}>
                <div className={styles.bigScore}>
                  <span>{score.index}</span>
                  <small>MirageML Bench Index</small>
                </div>
                <dl className={styles.rankList}>
                  <div>
                    <dt>Run rank</dt>
                    <dd>
                      #{runRank} of {RUN_SCORES.length}
                    </dd>
                  </div>
                  {entry && arena.ratings[entry.id] ? (
                    <div>
                      <dt>Pair Arena Elo</dt>
                      <dd>
                        {arena.ratings[entry.id].rating} · #
                        {rankByRating(
                          ENTRIES.map((e) => e.id),
                          arena.ratings,
                        ).indexOf(entry.id) + 1}{" "}
                        of {ENTRIES.length}
                        {isProvisional(arena.ratings[entry.id])
                          ? " · provisional"
                          : ""}
                      </dd>
                    </div>
                  ) : null}
                  {entry ? (
                    <div>
                      <dt>Pair seed index</dt>
                      <dd>
                        {entry.index} · #{entryRank} of {ENTRIES.length}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}

            <div className={styles.runActions}>
              <Link
                href={getCanonicalPlayPath(game)}
                className={styles.primaryButton}
              >
                <Play aria-hidden="true" weight="fill" />
                Play in browser
              </Link>
              <a
                className={styles.textButton}
                href={game.deployment.url}
                target="_blank"
                rel="noreferrer"
              >
                Deployment
                <ArrowSquareOut aria-hidden="true" />
              </a>
              {game.source ? (
                <a
                  className={styles.textButton}
                  href={getSourceRevisionUrl(game.source)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GithubLogo aria-hidden="true" weight="fill" />
                  Source
                </a>
              ) : null}
              <ShareLinkButton game={game} className={styles.textButton} />
            </div>
          </div>
        </section>

        {score ? (
          <section className={styles.section} aria-labelledby="breakdown-title">
            <div className={styles.sectionHead}>
              <h2 id="breakdown-title">Score breakdown</h2>
              <p>{score.verdict}</p>
            </div>
            <ul className={styles.breakdown}>
              {METRICS.map((metric) => {
                const value = score.scores[metric.key];
                const pair = entry?.scores[metric.key];
                return (
                  <li key={metric.key}>
                    <div className={styles.breakdownLabel}>
                      <strong>{metric.label}</strong>
                      <span>{metric.description}</span>
                    </div>
                    <div className={styles.breakdownTrack}>
                      <i
                        style={{
                          width: `${value}%`,
                          background: entry
                            ? PROVIDERS[entry.provider].color
                            : "var(--muted)",
                        }}
                        className={styles.breakdownFill}
                      />
                      {pair !== undefined ? (
                        <span
                          className={styles.breakdownMarker}
                          style={{ left: `${pair}%` }}
                          title={`Pair average ${pair}`}
                        />
                      ) : null}
                    </div>
                    <b className={styles.breakdownValue}>{value}</b>
                  </li>
                );
              })}
            </ul>
            {entry ? (
              <p className={styles.legendNote}>
                <span className={styles.markerKey} aria-hidden="true" /> Average
                across {entry.trials} trial{entry.trials === 1 ? "" : "s"} of{" "}
                {getEntryLabel(entry)}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className={styles.twoCol}>
          <section className={styles.section} aria-labelledby="about-title">
            <div className={styles.sectionHead}>
              <h2 id="about-title">About this run</h2>
            </div>
            <p className={styles.prose}>{game.description}</p>
            {game.features.length ? (
              <>
                <h3 className={styles.subhead}>Features</h3>
                <ul className={styles.list}>
                  {game.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {game.presentation.controls.length ? (
              <>
                <h3 className={styles.subhead}>Controls</h3>
                <ul className={styles.list}>
                  {game.presentation.controls.map((control) => (
                    <li key={control}>{control}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {game.presentation.limitations.length ? (
              <>
                <h3 className={styles.subhead}>Known limitations</h3>
                <ul className={styles.list}>
                  {game.presentation.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className={styles.section} aria-labelledby="record-title">
            <div className={styles.sectionHead}>
              <h2 id="record-title">Record</h2>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>Model</dt>
                <dd>{getModelLabel(game)}</dd>
              </div>
              <div>
                <dt>Harness</dt>
                <dd>{harness ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt>Built</dt>
                <dd>
                  {game.builtOn
                    ? formatBuildDate(game.builtOn)
                    : "Not recorded"}
                </dd>
              </div>
              <div>
                <dt>Deployment</dt>
                <dd>{game.deployment.provider}</dd>
              </div>
            </dl>
            <h3 className={styles.subhead}>Evidence</h3>
            <ul className={styles.signals}>
              {signals.map((signal) => (
                <li key={signal.key}>
                  <EvidenceGlyph state={signal.state} />
                  <span>{signal.label}</span>
                  <b>{signal.value}</b>
                  {signal.note ? <small>{signal.note}</small> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {others.length ? (
          <section className={styles.section} aria-labelledby="more-title">
            <div className={styles.sectionHead}>
              <h2 id="more-title">More runs</h2>
            </div>
            <ul className={styles.moreRuns}>
              {others.map((other) => {
                const otherScore = getRunScore(other.id);
                return (
                  <li key={other.id}>
                    <Link href={`/runs/${other.id}`}>
                      <span>{other.title}</span>
                      <small>{getModelLabel(other)}</small>
                      {otherScore ? <b>{otherScore.index}</b> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
