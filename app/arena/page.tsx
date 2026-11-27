import { SkipForward } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getEntryLabel } from "../bench/entries";
import { RegistryNotice } from "../gallery/RegistryNotice";
import { loadPublishedRegistry } from "../registry/load";
import { SiteFooter, SiteHeader } from "../site/SiteChrome";
import { ArenaMatch, type ArenaSide } from "./ArenaMatch";
import { INITIAL_RATING, K_FACTOR } from "./elo";
import {
  findMatch,
  getContenders,
  matchPath,
  offerMatch,
  pickMatch,
} from "./match";
import { loadRatings } from "./ratings";
import type { Contender } from "./match";
import {
  getDeploymentEntryUrl,
  getPresentationCoverUrl,
} from "../registry/urls";
import { getVoteSecret, MIN_VIEW_MS } from "./security";
import pageStyles from "../bench/Page.module.css";
import styles from "./Arena.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arena — MirageML Bench",
  description:
    "Play two AI-built GTA games side by side and vote for the better one. Votes set each run's Elo rating.",
  alternates: { canonical: "/arena" },
};

type ArenaPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ArenaPage({ searchParams }: ArenaPageProps) {
  const [registry, snapshot, query] = await Promise.all([
    loadPublishedRegistry(),
    loadRatings(),
    searchParams,
  ]);
  if (registry.kind === "unavailable") {
    return <RegistryNotice kind="unavailable" message={registry.message} />;
  }

  // The pair lives in the URL, so leaving to play a run and coming back
  // shows the same comparison instead of a new random one.
  const contenders = getContenders(registry.games);
  const chosen = findMatch(contenders, query.a, query.b);
  if (!chosen) {
    const fresh = pickMatch(contenders, snapshot.ratings);
    if (fresh) redirect(matchPath(fresh));
  }

  const secret = getVoteSecret();
  const open = snapshot.status === "open" && secret !== null;
  const { match, token } = offerMatch(
    contenders,
    snapshot.ratings,
    open ? secret : null,
    chosen,
  );

  return (
    <div className={pageStyles.page}>
      <SiteHeader current="arena" />
      <main className={pageStyles.main}>
        <section className={styles.intro} aria-labelledby="arena-title">
          <div>
            <p className={styles.eyebrow}>MirageML Bench Arena</p>
            <h1 id="arena-title">Which GTA would you keep playing?</h1>
            <p>
              Play both runs, then vote for the better one. Who built each run
              is shown after you vote. Each vote moves both runs&rsquo; Elo by
              up to {K_FACTOR} points on the <Link href="/">leaderboard</Link>.
            </p>
          </div>
          <div className={styles.introSide}>
            <p className={styles.meta}>
              {snapshot.totalVotes.toLocaleString("en-US")} vote
              {snapshot.totalVotes === 1 ? "" : "s"} so far. Every run starts at{" "}
              {INITIAL_RATING}.
            </p>
            {match ? (
              <Link href="/arena" className={styles.skipButton}>
                Skip this pair
                <SkipForward aria-hidden="true" weight="bold" />
              </Link>
            ) : null}
          </div>
        </section>

        {!match ? (
          <p className={styles.notice}>The arena needs at least two runs.</p>
        ) : (
          <ArenaMatch
            key={`${match[0].game.id}|${match[1].game.id}|${token ?? ""}`}
            sides={[toSide(match[0]), toSide(match[1])]}
            token={token}
            minViewMs={MIN_VIEW_MS}
            closedNotice={
              snapshot.status === "error"
                ? "The vote store is not responding, so voting is paused."
                : "Voting opens once the vote store is connected."
            }
          />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

/** What the client needs to show one side; who built it shows after a vote. */
function toSide({ game, entry }: Contender): ArenaSide {
  return {
    runId: game.id,
    title: game.title,
    label: getEntryLabel(entry),
    provider: entry.provider,
    entryUrl: getDeploymentEntryUrl(game),
    protocolVersion: game.presentation.protocolVersion,
    coverUrl: getPresentationCoverUrl(game),
    controls: game.presentation.controls,
  };
}
