"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CaretUp,
  Play,
  Scales,
  Shuffle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { INITIAL_RATING, ratingSpread } from "../arena/elo";
import { EvidenceGlyph, ShareLinkButton } from "../gallery/RunParts";
import { ControlList } from "../player/ControlList";
import { InlinePlayer } from "../player/InlinePlayer";
import type { EvidenceSignal } from "../registry/evidence";
import { ProviderMark } from "./ProviderMark";
import { PROVIDERS, type ProviderKey } from "./entries";
import type { Highlight } from "./highlights";
import styles from "./BenchBoard.module.css";

export type ArenaStatus = "open" | "off" | "error";

/** One leaderboard row: a run on the board and its Arena standing. */
export type BoardRow = {
  id: string;
  title: string;
  provider: ProviderKey;
  models: string;
  harness: string;
  rating: number;
  votes: number;
  rank: number;
  /** The record's build date, formatted, or null when it gives none. */
  built: string | null;
  /** False when the run has no published record to open. */
  published: boolean;
};

/** One published run: what its card, player and record need. */
export type BoardRun = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  /** The model as the record states it; share text names it. */
  model: string;
  /** The model + harness pair, when the run is on the leaderboard. */
  pair: { label: string; provider: ProviderKey } | null;
  modelLabel: string;
  built: string | null;
  coverUrl: string | null;
  coverAlt: string;
  entryUrl: string;
  protocolVersion: number;
  recordPath: string;
  deployment: { provider: string; url: string };
  source: { url: string; commit: string } | null;
  harness: string | null;
  signals: readonly EvidenceSignal[];
  controls: readonly string[];
};

type Props = {
  /** Leaderboard runs, highest Elo first. */
  rows: readonly BoardRow[];
  /** Published runs, in registry order. */
  runs: readonly BoardRun[];
  highlights: readonly Highlight[];
  totalVotes: number;
  arenaStatus: ArenaStatus;
  /** Why no runs are listed, when the registry could not supply them. */
  notice: string | null;
};

const RUN_HASH = "#run-";

export function BenchBoard({
  rows,
  runs,
  highlights,
  totalVotes,
  arenaStatus,
  notice,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // The panel keeps its last run while it closes, so it never empties mid-way.
  const [shownId, setShownId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const run =
    runs.find((candidate) => candidate.id === (openId ?? shownId)) ?? null;
  const open = openId !== null && run !== null;
  const row = run ? rows.find((candidate) => candidate.id === run.id) : null;

  function show(id: string, play: boolean) {
    if (!runs.some((candidate) => candidate.id === id)) return;
    setOpenId(id);
    setShownId(id);
    setPlaying(play);
    window.history.replaceState(null, "", `${RUN_HASH}${id}`);
    requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({ block: "start" }),
    );
  }

  function close() {
    setOpenId(null);
    setPlaying(false);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }

  // A link to #run-ID opens that run's panel, on load or from another page.
  useEffect(() => {
    const reveal = () => {
      const { hash } = window.location;
      if (!hash.startsWith(RUN_HASH)) return;
      const id = decodeURIComponent(hash.slice(RUN_HASH.length));
      if (!runs.some((candidate) => candidate.id === id)) return;
      setOpenId(id);
      setShownId(id);
      requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView({ block: "start" }),
      );
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [runs]);

  return (
    <>
      <section className={styles.board} aria-labelledby="board-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>MirageML Bench Leaderboard</p>
          <h1 id="board-title">Can an LLM solve GTA?</h1>
          <p className={styles.lede}>
            Each run is a model working inside a coding harness on one task:
            build GTA as a browser game, from an empty repository to a deployed
            build. Runs are ranked by Arena Elo, set only by people{" "}
            <Link href="/arena">playing two runs and voting</Link> for the
            better one.
          </p>
          <p className={styles.seedNote}>
            Every run starts at {INITIAL_RATING}.{" "}
            {arenaStatus === "open"
              ? `${totalVotes.toLocaleString("en-US")} vote${totalVotes === 1 ? "" : "s"} so far.`
              : arenaStatus === "error"
                ? "The vote store is not responding right now."
                : "Voting is not open yet."}
          </p>
          <div className={styles.cta}>
            <Link href="/arena" className={styles.primaryButton}>
              <Scales aria-hidden="true" weight="bold" />
              Vote in the Arena
              <ArrowRight aria-hidden="true" weight="bold" />
            </Link>
            {runs.length > 0 ? (
              <button
                type="button"
                className={styles.button}
                onClick={() =>
                  show(runs[Math.floor(Math.random() * runs.length)].id, true)
                }
              >
                <Shuffle aria-hidden="true" weight="bold" />
                Play a random run
              </button>
            ) : null}
            <span>Play two anonymous runs, pick the better one.</span>
          </div>
        </div>

        <div className={styles.sheet}>
          <div className={styles.cardHead}>
            <h2>Leaderboard</h2>
            <span>Arena Elo</span>
          </div>
          {highlights.length > 0 ? (
            <dl className={styles.highlights}>
              {highlights.map((highlight) => (
                <div key={highlight.label}>
                  <dt>{highlight.label}</dt>
                  <dd className={styles.highlightTitle}>
                    {highlight.provider ? (
                      <ProviderMark provider={highlight.provider} size={22} />
                    ) : null}
                    {highlight.title}
                  </dd>
                  <dd className={styles.highlightNote}>{highlight.note}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <BarChart
            rows={rows}
            openId={openId}
            onOpen={(id) => show(id, false)}
          />
          <RankingTable
            rows={rows}
            openId={openId}
            onOpen={(id) => show(id, false)}
          />
          <div className={styles.foot}>
            <span>
              Arena Elo from head-to-head votes. The spread narrows as votes
              arrive; it is a display aid, not a statistical interval.
            </span>
            <span>
              Higher is better · {rows.length} run{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </section>

      <section className={styles.runs} id="runs" aria-labelledby="runs-title">
        <div className={styles.runsHead}>
          <h2 id="runs-title">Playable runs</h2>
          <p>
            Each published run is a deployed game, listed as soon as it is
            accepted. Play it right here in the sandboxed player, or open its
            record.
          </p>
          <p className={styles.phoneNote}>
            Most runs expect a keyboard and mouse. Browse here, then copy the
            link to play on a computer.
          </p>
        </div>

        <div
          ref={panelRef}
          className={styles.panelSlot}
          data-open={open ? "true" : undefined}
        >
          <div>
            {run ? (
              <RunPanel
                key={run.id}
                run={run}
                row={row ?? null}
                total={rows.length}
                playing={open && playing}
                onPlay={() => setPlaying(true)}
                onStop={() => setPlaying(false)}
                onClose={close}
              />
            ) : null}
          </div>
        </div>

        {notice ? <p className={styles.notice}>{notice}</p> : null}
        <ol className={styles.grid}>
          {runs.map((game) => (
            <li
              key={game.id}
              className={styles.card}
              data-open={open && openId === game.id ? "true" : undefined}
            >
              <button
                type="button"
                className={styles.cardCover}
                onClick={() => show(game.id, false)}
                aria-label={`Open the record for ${game.title}`}
              >
                {game.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.coverUrl}
                    alt={game.coverAlt}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span>{game.id}</span>
                )}
              </button>
              <div className={styles.cardBody}>
                <h3>{game.title}</h3>
                <p className={styles.pair}>
                  {game.pair ? (
                    <ProviderMark provider={game.pair.provider} size={16} />
                  ) : null}
                  {game.pair?.label ?? game.modelLabel}
                </p>
                <p className={styles.tagline}>{game.tagline}</p>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => show(game.id, true)}
                    aria-label={`Play ${game.title}`}
                  >
                    <Play aria-hidden="true" weight="fill" />
                    Play
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => show(game.id, false)}
                    aria-label={`Details for ${game.title}`}
                  >
                    Details
                    <ArrowRight aria-hidden="true" weight="bold" />
                  </button>
                  {game.built ? <span>{game.built}</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function BarChart({
  rows,
  openId,
  onOpen,
}: {
  rows: readonly BoardRow[];
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  const values = rows.map((row) => row.rating);
  // Elo has no natural zero, so bars start from a floor below the lowest.
  const floor = Math.floor((Math.min(...values) - 100) / 100) * 100;
  const ceiling = Math.ceil((Math.max(...values) + 50) / 100) * 100;
  const span = ceiling - floor;
  const ticks = Array.from(
    { length: span / 100 + 1 },
    (_, index) => floor + index * 100,
  );

  return (
    <div className={styles.chartScroll}>
      <div className={styles.chart}>
        <div className={styles.plot}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className={styles.tick}
              data-base={tick === floor ? "true" : undefined}
              style={{ bottom: `${((tick - floor) / span) * 100}%` }}
              aria-hidden="true"
            >
              <i>{tick.toLocaleString("en-US")}</i>
            </span>
          ))}
          <ol className={styles.columns} aria-label="Arena Elo by run">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={styles.barSlot}
                  onClick={() => onOpen(row.id)}
                  disabled={!row.published}
                  data-open={openId === row.id ? "true" : undefined}
                  aria-label={`${row.title}: ${row.rating} Elo, ${row.votes} vote${row.votes === 1 ? "" : "s"}. Open it below.`}
                >
                  <span className={styles.barValue}>
                    {row.rating.toLocaleString("en-US")}
                  </span>
                  <span
                    className={styles.bar}
                    style={{
                      height: `${((row.rating - floor) / span) * 100}%`,
                      background: PROVIDERS[row.provider].color,
                    }}
                  />
                </button>
              </li>
            ))}
          </ol>
        </div>
        <ol className={styles.labels} aria-hidden="true">
          {rows.map((row) => (
            <li key={row.id}>
              <ProviderMark provider={row.provider} size={18} />
              <span>{row.models}</span>
              <small>{row.harness}</small>
              <b>{row.title}</b>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function RankingTable({
  rows,
  openId,
  onOpen,
}: {
  rows: readonly BoardRow[];
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  const spreads = rows.map((row) => ratingSpread(row.votes));
  const low = Math.min(...rows.map((row, i) => row.rating - spreads[i]));
  const high = Math.max(...rows.map((row, i) => row.rating + spreads[i]));
  const at = (value: number) => `${((value - low) / (high - low)) * 100}%`;
  // Runs with the same rating share a rank; no one of them is marked first.
  const shared = (rank: number) =>
    rows.filter((row) => row.rank === rank).length > 1;

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.rankCell}>
              <span className={styles.srOnly}>Rank</span>
            </th>
            <th scope="col">Run ranking</th>
            <th scope="col">Elo</th>
            <th scope="col" className={styles.wide}>
              Spread
            </th>
            <th scope="col" className={styles.wide}>
              Votes
            </th>
            <th scope="col" className={styles.wide}>
              Built
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} data-open={openId === row.id ? "true" : undefined}>
              <td className={styles.rankCell}>
                {shared(row.rank) ? (
                  <span aria-label={`Tied for rank ${row.rank}`}>
                    ={row.rank}
                  </span>
                ) : (
                  <span data-rank={Math.min(row.rank, 4)}>{row.rank}</span>
                )}
              </td>
              <th scope="row">
                <span className={styles.name}>
                  <ProviderMark provider={row.provider} size={18} />
                  <span>
                    {row.published ? (
                      <button type="button" onClick={() => onOpen(row.id)}>
                        {row.title}
                      </button>
                    ) : (
                      <b>{row.title}</b>
                    )}
                    <small>
                      {row.models} · {row.harness}
                    </small>
                  </span>
                </span>
              </th>
              <td className={styles.num}>
                {row.rating.toLocaleString("en-US")}
              </td>
              <td className={styles.wide}>
                <span className={styles.spread}>
                  <span
                    className={styles.track}
                    role="img"
                    aria-label={`${row.rating} plus or minus ${spreads[i]}`}
                  >
                    <i
                      style={{
                        width: at(row.rating),
                        background: PROVIDERS[row.provider].color,
                      }}
                    />
                    <u
                      style={{
                        left: at(row.rating - spreads[i]),
                        right: `calc(100% - ${at(row.rating + spreads[i])})`,
                      }}
                    />
                  </span>
                  <small>± {spreads[i]}</small>
                </span>
              </td>
              <td className={`${styles.num} ${styles.wide}`}>{row.votes}</td>
              <td className={`${styles.num} ${styles.wide}`}>
                {row.built ?? "Not recorded"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunPanel({
  run,
  row,
  total,
  playing,
  onPlay,
  onStop,
  onClose,
}: {
  run: BoardRun;
  row: BoardRow | null;
  total: number;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  return (
    <article className={styles.panel} aria-labelledby="panel-title">
      <header className={styles.panelHead}>
        <div>
          <p className={styles.runId}>Run · {run.id}</p>
          <h3 id="panel-title">{run.title}</h3>
          <p className={styles.pair}>
            {run.pair ? (
              <ProviderMark provider={run.pair.provider} size={16} />
            ) : null}
            {run.pair?.label ?? run.modelLabel}
          </p>
        </div>
        <div className={styles.panelMeta}>
          {row ? (
            <p>
              <b>{row.rating.toLocaleString("en-US")}</b> ±{" "}
              {ratingSpread(row.votes)} · rank {row.rank} of {total} ·{" "}
              {row.votes} vote{row.votes === 1 ? "" : "s"}
            </p>
          ) : null}
          <button type="button" className={styles.button} onClick={onClose}>
            Close
            <CaretUp aria-hidden="true" weight="bold" />
          </button>
        </div>
      </header>

      <div className={styles.panelBody}>
        <div className={styles.panelPlay}>
          <InlinePlayer
            game={run}
            playing={playing}
            onPlay={onPlay}
            onStop={onStop}
            startLabel="Click to play"
            actions={
              <>
                <a href={run.deployment.url} target="_blank" rel="noreferrer">
                  Deployment
                  <ArrowUpRight aria-hidden="true" />
                </a>
                {run.source ? (
                  <a href={run.source.url} target="_blank" rel="noreferrer">
                    Source
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                ) : null}
                <ShareLinkButton game={run} />
                <Link href={run.recordPath}>
                  Full record
                  <ArrowRight aria-hidden="true" />
                </Link>
              </>
            }
          />
          <p className={styles.sandboxNote}>
            Sandboxed frame · scripts and pointer lock only
          </p>
          {run.controls.length > 0 ? (
            <div>
              <h4>Controls</h4>
              <ControlList controls={run.controls} />
            </div>
          ) : null}
        </div>

        <div className={styles.panelRecord}>
          <p className={styles.panelTagline}>{run.tagline}</p>
          <p className={styles.prose}>{run.description}</p>
          <dl className={styles.facts}>
            <div>
              <dt>Model</dt>
              <dd>{run.modelLabel}</dd>
            </div>
            <div>
              <dt>Harness</dt>
              <dd>{run.harness ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Built</dt>
              <dd>{run.built ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Deployment</dt>
              <dd>{run.deployment.provider}</dd>
            </div>
          </dl>
          <div>
            <h4>Evidence</h4>
            <ul className={styles.signals}>
              {run.signals.map((signal) => (
                <li key={signal.key}>
                  <EvidenceGlyph state={signal.state} />
                  <span>{signal.label}</span>
                  <b>{signal.value}</b>
                  {signal.note ? <small>{signal.note}</small> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </article>
  );
}
