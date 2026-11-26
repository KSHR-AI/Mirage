"use client";

import {
  ArrowDown,
  ArrowRight,
  CaretLeft,
  CaretRight,
  Play,
  Plus,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatBuildDate,
  getModelLabel,
  getRecordedHarness,
  getRegistryStats,
} from "../registry/evidence";
import type { PublishedGame } from "../registry/schema";
import { getRecordPath } from "../registry/share";
import { getCanonicalPlayPath } from "../registry/urls";
import { SiteFooter, SiteHeader } from "../site/SiteChrome";
import benchmarkCover from "./mirage-bench-sf-chase.jpg";
import { RegistryNotice, type RegistryNoticeKind } from "./RegistryNotice";
import { RunDrawer } from "./RunDrawer";
import { GameCover, ShareLinkButton } from "./RunParts";
import { SUBMIT_HASH, SubmitDialog } from "./SubmitDialog";
import styles from "./DemoGallery.module.css";

type DemoGalleryProps = {
  games: readonly PublishedGame[];
  registryState: {
    kind: "ready" | RegistryNoticeKind;
    message: string | null;
  };
  initialRunId?: string | null;
  /** The copyable agent prompt, or null when it could not be read. */
  submitPrompt?: string | null;
};

export function DemoGallery({
  games,
  registryState,
  initialRunId = null,
  submitPrompt = null,
}: DemoGalleryProps) {
  if (games.length === 0 || registryState.kind !== "ready") {
    return (
      <RegistryNotice
        kind={registryState.kind === "ready" ? "empty" : registryState.kind}
        message={
          registryState.message ??
          "No accepted GTA-in-San-Francisco benchmark runs have been published yet."
        }
        submitPrompt={submitPrompt}
      />
    );
  }

  return (
    <Board
      games={games}
      initialRunId={initialRunId}
      submitPrompt={submitPrompt}
    />
  );
}

function Board({
  games,
  initialRunId,
  submitPrompt,
}: {
  games: readonly PublishedGame[];
  initialRunId: string | null;
  submitPrompt: string | null;
}) {
  const stats = useMemo(() => getRegistryStats(games), [games]);

  const [featuredId, setFeaturedId] = useState(games[0].id);
  const [detailId, setDetailId] = useState(() =>
    games.some((game) => game.id === initialRunId) ? initialRunId : null,
  );
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const featuredIndex = Math.max(
    0,
    games.findIndex((game) => game.id === featuredId),
  );
  const featured = games[featuredIndex];
  const detailGame = detailId
    ? (games.find((game) => game.id === detailId) ?? null)
    : null;
  const detailOpen = detailGame !== null;

  const openDetail = useCallback((game: PublishedGame) => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDetailId(game.id);
    window.history.replaceState(null, "", getRecordPath(game));
  }, []);

  const closeDetail = useCallback(() => {
    setDetailId(null);
    window.history.replaceState(null, "", window.location.pathname);
    const target = returnFocusRef.current;
    requestAnimationFrame(() => target?.focus());
  }, []);

  const moveFeatured = useCallback(
    (direction: -1 | 1) => {
      if (games.length < 2) return;
      const next = (featuredIndex + direction + games.length) % games.length;
      setFeaturedId(games[next].id);
    },
    [featuredIndex, games],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        detailOpen ||
        document.querySelector("dialog[open]") ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isInteractive(event.target)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveFeatured(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveFeatured(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailOpen, moveFeatured]);

  return (
    <div className={styles.page} data-detail-open={detailOpen}>
      <div className={styles.content} inert={detailOpen ? true : undefined}>
        <SiteHeader onBoard submitHref={SUBMIT_HASH} />
        <main>
          <section className={styles.hero} aria-labelledby="hero-title">
            {/* The benchmark keeps one cinematic identity; run-specific
                evidence stays with each run. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.heroImage}
              src={benchmarkCover.src}
              alt=""
              aria-hidden="true"
            />
            <div className={styles.heroVeil} aria-hidden="true" />

            <div className={styles.heroInner}>
              <div className={styles.heroCopy}>
                <h1 id="hero-title">
                  GTA in <em>SF</em>
                </h1>
                <p className={styles.lede}>
                  The original mission of MirageML was to make building GTA in
                  any city a reality. Coding models have come a long way since
                  2022 and turns out that&apos;s all you need to create a AAA
                  game. We&apos;re getting close so we&apos;re tracking it here!
                </p>
                <div className={styles.heroActions}>
                  <a className={styles.ghostAction} href="#runs">
                    Browse {stats.runs} {stats.runs === 1 ? "run" : "runs"}
                    <ArrowDown aria-hidden="true" weight="bold" />
                  </a>
                  <a className={styles.textAction} href={SUBMIT_HASH}>
                    Submit yours
                    <ArrowRight aria-hidden="true" weight="bold" />
                  </a>
                </div>
              </div>

              <FeaturedRun
                game={featured}
                position={featuredIndex + 1}
                total={games.length}
                onMove={moveFeatured}
                onOpenDetail={openDetail}
              />
            </div>

            <dl className={styles.stats}>
              <Stat label="Playable runs" value={stats.runs} />
              <Stat label="Models" value={stats.models} />
              <Stat
                label="Latest build"
                value={
                  stats.latestBuild ? formatBuildDate(stats.latestBuild) : "—"
                }
                dateTime={stats.latestBuild}
              />
            </dl>
          </section>

          <section
            id="runs"
            className={styles.board}
            aria-labelledby="runs-title"
          >
            <header className={styles.sectionHead}>
              <p className={styles.eyebrow}>The runs</p>
              <h2 id="runs-title">Play every run</h2>
              <p>No scores. Play each one and decide how far the model got.</p>
            </header>

            <div className={styles.table}>
              <div className={styles.tableHead} aria-hidden="true">
                <span>Run</span>
                <span>Model</span>
                <span>Built</span>
                <span />
              </div>
              <ul className={styles.rows}>
                {games.map((game) => (
                  <RunRow key={game.id} game={game} onOpenDetail={openDetail} />
                ))}
              </ul>
              <a className={styles.openSlot} href={SUBMIT_HASH}>
                <Plus aria-hidden="true" weight="bold" />
                <strong>Your run here</strong>
                <span>Submit a hosted game</span>
                <ArrowRight aria-hidden="true" weight="bold" />
              </a>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>

      {detailGame ? (
        <RunDrawer game={detailGame} onClose={closeDetail} />
      ) : null}
      <SubmitDialog prompt={submitPrompt} />
    </div>
  );
}

function FeaturedRun({
  game,
  position,
  total,
  onMove,
  onOpenDetail,
}: {
  game: PublishedGame;
  position: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onOpenDetail: (game: PublishedGame) => void;
}) {
  const playPath = getCanonicalPlayPath(game);

  return (
    <article
      className={styles.featured}
      aria-label="Featured run"
      data-game-id={game.id}
    >
      <header className={styles.featuredHead}>
        <span>Featured run</span>
        <span className={styles.featuredCount} aria-live="polite">
          {String(position).padStart(2, "0")}
          <i aria-hidden="true">/</i>
          <span className={styles.srOnly}>of</span>
          {String(total).padStart(2, "0")}
        </span>
        <button
          type="button"
          aria-label="Previous run"
          disabled={total < 2}
          onClick={() => onMove(-1)}
        >
          <CaretLeft aria-hidden="true" weight="bold" />
        </button>
        <button
          type="button"
          aria-label="Next run"
          disabled={total < 2}
          onClick={() => onMove(1)}
        >
          <CaretRight aria-hidden="true" weight="bold" />
        </button>
      </header>

      <Link
        className={styles.featuredCover}
        href={playPath}
        aria-label={`Play ${game.title}`}
      >
        <GameCover key={game.id} game={game} />
        <span className={styles.playBadge} aria-hidden="true">
          <Play weight="fill" />
        </span>
      </Link>

      <div className={styles.featuredBody}>
        <p className={styles.featuredModel}>{getModelLabel(game)}</p>
        <h2>{game.title}</h2>
        <p className={styles.featuredTagline}>{game.tagline}</p>
        <div className={styles.featuredActions}>
          <Link className={styles.playAction} href={playPath}>
            <Play aria-hidden="true" weight="fill" />
            Play now
          </Link>
          <button
            className={styles.ghostAction}
            type="button"
            aria-haspopup="dialog"
            onClick={() => onOpenDetail(game)}
          >
            Record
          </button>
          <ShareLinkButton
            className={styles.ghostAction}
            game={game}
            label="Share"
          />
        </div>
      </div>
    </article>
  );
}

function RunRow({
  game,
  onOpenDetail,
}: {
  game: PublishedGame;
  onOpenDetail: (game: PublishedGame) => void;
}) {
  const harness = getRecordedHarness(game);

  return (
    <li className={styles.row} data-game-id={game.id}>
      <div className={styles.cellRun}>
        <span className={styles.thumb}>
          <GameCover game={game} />
        </span>
        <div>
          <button
            className={styles.rowTitle}
            type="button"
            aria-haspopup="dialog"
            aria-label={`${game.title}: open run record`}
            onClick={() => onOpenDetail(game)}
          >
            {game.title}
          </button>
          <p>{game.tagline}</p>
        </div>
      </div>

      <div className={styles.cellModel}>
        <span className={styles.cellLabel}>Model</span>
        <strong>{getModelLabel(game)}</strong>
        <small title={harness ?? undefined}>
          {harness ?? "Harness not recorded"}
        </small>
      </div>

      <div className={styles.cellBuilt}>
        <span className={styles.cellLabel}>Built</span>
        {game.builtOn ? (
          <time dateTime={game.builtOn}>{formatBuildDate(game.builtOn)}</time>
        ) : (
          <span className={styles.unknown}>Not recorded</span>
        )}
      </div>

      <div className={styles.cellActions}>
        <Link
          className={styles.rowPlay}
          href={getCanonicalPlayPath(game)}
          aria-label={`Play ${game.title}`}
        >
          <Play aria-hidden="true" weight="fill" />
          Play
        </Link>
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  dateTime,
}: {
  label: string;
  value: string | number;
  dateTime?: string | null;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{dateTime ? <time dateTime={dateTime}>{value}</time> : value}</dd>
    </div>
  );
}

function isInteractive(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLPreElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement
  );
}
