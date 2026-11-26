import { Play } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getEntryLabel } from "../bench/entries";
import { GameCover } from "../gallery/RunParts";
import { RegistryNotice } from "../gallery/RegistryNotice";
import { loadPublishedRegistry } from "../registry/load";
import { SiteFooter, SiteHeader } from "../site/SiteChrome";
import { ArenaVote } from "./ArenaVote";
import { INITIAL_RATING, K_FACTOR } from "./elo";
import {
  arenaPlayPath,
  findMatch,
  getContenders,
  matchPath,
  offerMatch,
  pickMatch,
} from "./match";
import { loadRatings } from "./ratings";
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
          <h1 id="arena-title">Arena</h1>
          <p>
            Two runs, one vote. Play both games, then pick the one that does the
            job better: the GTA you would keep playing. Each vote moves both
            runs&rsquo; Elo ratings by up to {K_FACTOR} points, and the{" "}
            <Link href="/#leaderboard">leaderboard</Link> ranks runs by that
            rating.
          </p>
          <p className={styles.meta}>
            {snapshot.totalVotes.toLocaleString("en-US")} vote
            {snapshot.totalVotes === 1 ? "" : "s"} so far · Every run starts at{" "}
            {INITIAL_RATING}
          </p>
        </section>

        {!match ? (
          <p className={styles.notice}>The arena needs at least two runs.</p>
        ) : (
          <>
            <div className={styles.matchup}>
              {match.map((side, i) => (
                <article key={side.game.id} className={styles.side}>
                  <div className={styles.cover}>
                    <GameCover game={side.game} />
                    <span className={styles.sideTag}>
                      Run {i === 0 ? "A" : "B"}
                    </span>
                  </div>
                  <div className={styles.sideBody}>
                    <h2>{side.game.title}</h2>
                    <p>{side.game.tagline}</p>
                    <div className={styles.sideActions}>
                      <Link
                        className={pageStyles.primaryButton}
                        href={arenaPlayPath(side.game, match)}
                      >
                        <Play aria-hidden="true" weight="fill" />
                        Play run {i === 0 ? "A" : "B"}
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {token ? (
              <ArenaVote
                key={token}
                token={token}
                minViewMs={MIN_VIEW_MS}
                sides={[
                  {
                    runId: match[0].game.id,
                    title: match[0].game.title,
                    label: getEntryLabel(match[0].entry),
                    provider: match[0].entry.provider,
                  },
                  {
                    runId: match[1].game.id,
                    title: match[1].game.title,
                    label: getEntryLabel(match[1].entry),
                    provider: match[1].entry.provider,
                  },
                ]}
              />
            ) : (
              <p className={styles.notice}>
                {snapshot.status === "error"
                  ? "The vote store is not responding, so voting is paused."
                  : "Voting opens once the vote store is connected."}
              </p>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
