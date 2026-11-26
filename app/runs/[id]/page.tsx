import {
  ArrowLeft,
  ArrowSquareOut,
  DownloadSimple,
  GithubLogo,
  Play,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ratingRanks } from "../../arena/elo";
import { loadRatings } from "../../arena/ratings";
import { ProviderMark } from "../../bench/ProviderMark";
import { BENCH_RUNS, getEntryForRun, getEntryLabel } from "../../bench/entries";
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
  const title = `${game.title} — MirageML Bench`;
  const description = `${getModelLabel(game)}. ${game.tagline}`;
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

  const entry = getEntryForRun(game.id);
  const rating = entry ? arena.ratings[game.id] : undefined;
  const rank = ratingRanks(
    BENCH_RUNS.map((run) => run.id),
    arena.ratings,
  ).get(game.id);
  const harness = getRecordedHarness(game);
  const signals = getEvidenceSignals(game);
  const others = registry.games.filter((other) => other.id !== game.id);
  const recordDownload = `data:application/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(game, null, 2),
  )}`;

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

            {entry && rating ? (
              <div className={styles.scoreRow}>
                <div className={styles.bigScore}>
                  <span>{rating.rating}</span>
                  <small>Arena Elo</small>
                </div>
                <dl className={styles.rankList}>
                  <div>
                    <dt>Rank</dt>
                    <dd>
                      #{rank} of {BENCH_RUNS.length} runs
                    </dd>
                  </div>
                  <div>
                    <dt>Votes</dt>
                    <dd>{rating.votes}</dd>
                  </div>
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
            <h3 className={styles.subhead}>Full record</h3>
            <p className={styles.rawIntro}>
              The submitted evidence behind these summaries: prompt, tools,
              lineage, code and asset licenses, and credits.
            </p>
            <div className={styles.rawRecord}>
              <RawBlock title="Provenance" value={game.provenance} />
              <RawBlock title="Licenses and credits" value={game.licenses} />
              <RawBlock title="Lineage" value={game.lineage} />
              <RawBlock
                title="Source and deployment"
                value={{ source: game.source, deployment: game.deployment }}
              />
              <RawBlock title="Presentation" value={game.presentation} />
            </div>
            <a
              className={styles.textButton}
              href={recordDownload}
              download={`${game.id}.json`}
            >
              <DownloadSimple aria-hidden="true" />
              Download record
            </a>
          </section>
        </div>

        {others.length ? (
          <section className={styles.section} aria-labelledby="more-title">
            <div className={styles.sectionHead}>
              <h2 id="more-title">More runs</h2>
            </div>
            <ul className={styles.moreRuns}>
              {others.map((other) => {
                return (
                  <li key={other.id}>
                    <Link href={`/runs/${other.id}`}>
                      <span>{other.title}</span>
                      <small>{getModelLabel(other)}</small>
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

function RawBlock({ title, value }: { title: string; value: object }) {
  return (
    <details>
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
