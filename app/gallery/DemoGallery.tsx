"use client";

import {
  ArrowRight,
  ArrowSquareOut,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Copy,
  DownloadSimple,
  GithubLogo,
  PaperPlaneTilt,
  Play,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { GamePlayer } from "../player/GamePlayer";
import type { PublishedGame } from "../registry/schema";
import {
  getPresentationCoverUrl,
  getSourceRevisionUrl,
} from "../registry/urls";
import { RegistryNotice, type RegistryNoticeKind } from "./RegistryNotice";
import styles from "./DemoGallery.module.css";

const REPOSITORY_URL = "https://github.com/KSHR-AI/Mirage";
const CONTRIBUTION_URL = `${REPOSITORY_URL}/issues/new?template=demo.yml`;
const DRAWER_FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DemoGalleryProps = {
  games: readonly PublishedGame[];
  registryState: {
    kind: "ready" | RegistryNoticeKind;
    message: string | null;
  };
};

export function DemoGallery({ games, registryState }: DemoGalleryProps) {
  if (games.length === 0 || registryState.kind !== "ready") {
    return (
      <RegistryNotice
        kind={registryState.kind === "ready" ? "empty" : registryState.kind}
        message={
          registryState.message ??
          "No accepted GTA-in-San-Francisco benchmark runs have been published yet."
        }
      />
    );
  }

  return <PopulatedGallery games={games} />;
}

function PopulatedGallery({ games }: { games: readonly PublishedGame[] }) {
  const [selectedGameId, setSelectedGameId] = useState(games[0].id);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [feedback, setFeedback] = useState("");
  const deckRef = useRef<HTMLElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? games[0],
    [games, selectedGameId],
  );
  const selectedIndex = games.findIndex((game) => game.id === selectedGame.id);
  const neighboringGames = getNeighboringGames(games, selectedIndex);
  const coverUrl = getPresentationCoverUrl(selectedGame);
  const updatedOn = games.reduce(
    (latest, game) => (game.builtOn > latest ? game.builtOn : latest),
    games[0].builtOn,
  );
  const recordDownload = useMemo(
    () =>
      `data:application/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(selectedGame, null, 2),
      )}`,
    [selectedGame],
  );

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setFeedback("");
    requestAnimationFrame(() => detailTriggerRef.current?.focus());
  }, []);

  const openDetail = useCallback(() => {
    setIsPlaying(false);
    setDetailOpen(true);
    setFeedback("");
  }, []);

  const moveSelection = useCallback(
    (direction: -1 | 1) => {
      if (games.length < 2) return;
      const nextIndex =
        (selectedIndex + direction + games.length) % games.length;
      setSelectedGameId(games[nextIndex].id);
      setFeedback("");
    },
    [games, selectedIndex],
  );

  useEffect(() => {
    if (!detailOpen) return;
    requestAnimationFrame(() => closeRef.current?.focus());
  }, [detailOpen, selectedGame.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (detailOpen && event.key === "Escape") {
        event.preventDefault();
        closeDetail();
        return;
      }
      if (
        detailOpen ||
        isPlaying ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isFormControl(event.target)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelection(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDetail, detailOpen, isPlaying, moveSelection]);

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
    } catch {
      setFeedback(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  if (isPlaying) {
    return (
      <GamePlayer game={selectedGame} onExit={() => setIsPlaying(false)} />
    );
  }

  return (
    <main
      className={styles.shell}
      data-detail-open={detailOpen ? "true" : "false"}
    >
      <section
        className={styles.stage}
        data-has-cover={coverUrl ? "true" : "false"}
        aria-label="MirageML Bench GTA-in-San-Francisco submissions"
        inert={detailOpen ? true : undefined}
      >
        {coverUrl ? (
          // Covers resolve relative to the contributor-operated deployment.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.heroImage}
            src={coverUrl}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className={styles.imageVeil} aria-hidden="true" />
        <div className={styles.lowerScrim} aria-hidden="true" />

        <header className={styles.masthead}>
          <span className={styles.mastRule} aria-hidden="true" />
          <Link
            href="/"
            className={styles.wordmark}
            aria-label="MirageML Bench home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.brandMark} src="/icon.png" alt="" />
            <span>MirageML Bench</span>
          </Link>
          <span className={styles.collectionWord}>GTA in SF</span>
          <span className={styles.mastRule} aria-hidden="true" />
        </header>

        <div className={styles.heroCopy}>
          <span>MirageML Bench</span>
          <h1>GTA in SF</h1>
        </div>

        <section
          ref={deckRef}
          id="game-deck"
          className={styles.runDeck}
          aria-label="Accepted submissions"
          tabIndex={-1}
        >
          <div className={styles.deckRow}>
            <button
              className={styles.deckArrow}
              type="button"
              aria-label="Previous submission"
              disabled={games.length < 2}
              onClick={() => moveSelection(-1)}
            >
              <CaretLeft aria-hidden="true" weight="bold" />
            </button>

            <div className={styles.cards}>
              {neighboringGames.previous ? (
                <SideGameCard
                  game={neighboringGames.previous}
                  onSelect={setSelectedGameId}
                />
              ) : (
                <OpenGameSlot position="previous" />
              )}

              <article
                className={styles.selectedCard}
                aria-current="true"
                data-game-id={selectedGame.id}
              >
                <div className={styles.cardHeading}>
                  <strong>{selectedGame.model}</strong>
                  <span>{selectedGame.title}</span>
                  <time dateTime={selectedGame.builtOn}>
                    Built {formatDate(selectedGame.builtOn)}
                  </time>
                </div>
                <GameCover game={selectedGame} selected />
                <p>{selectedGame.tagline}</p>
                <button
                  className={styles.playButton}
                  type="button"
                  onClick={() => setIsPlaying(true)}
                >
                  <Play aria-hidden="true" weight="fill" />
                  Play
                  <ArrowRight aria-hidden="true" weight="bold" />
                </button>
                <button
                  ref={detailTriggerRef}
                  className={styles.detailButton}
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={detailOpen}
                  onClick={openDetail}
                >
                  Submission details
                  <ArrowRight aria-hidden="true" weight="bold" />
                </button>
              </article>

              {neighboringGames.next ? (
                <SideGameCard
                  game={neighboringGames.next}
                  onSelect={setSelectedGameId}
                />
              ) : (
                <OpenGameSlot position="next" />
              )}
            </div>

            <button
              className={styles.deckArrow}
              type="button"
              aria-label="Next submission"
              disabled={games.length < 2}
              onClick={() => moveSelection(1)}
            >
              <CaretRight aria-hidden="true" weight="bold" />
            </button>
          </div>
        </section>

        <footer className={styles.stageFooter}>
          <button type="button" onClick={() => deckRef.current?.focus()}>
            Browse submissions
          </button>
          <time dateTime={updatedOn}>Updated {formatDate(updatedOn)}</time>
          <nav aria-label="Project links">
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              <GithubLogo aria-hidden="true" weight="fill" />
              GitHub
            </a>
            <a href={CONTRIBUTION_URL}>
              <PaperPlaneTilt aria-hidden="true" weight="bold" />
              Submit
            </a>
          </nav>
        </footer>
      </section>

      {detailOpen ? (
        <GameDetailDrawer
          ref={drawerRef}
          closeRef={closeRef}
          game={selectedGame}
          feedback={feedback}
          recordDownload={recordDownload}
          onClose={closeDetail}
          onCopy={copyText}
        />
      ) : null}
    </main>
  );
}

function GameCover({
  game,
  selected = false,
}: {
  game: PublishedGame;
  selected?: boolean;
}) {
  const coverUrl = getPresentationCoverUrl(game);
  if (!coverUrl) {
    return (
      <div
        className={selected ? styles.cardFallback : styles.sideFallback}
        aria-label="No cover image was published"
      >
        <span>{game.id}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverUrl}
      alt={game.presentation.coverAlt}
      referrerPolicy="no-referrer"
    />
  );
}

type GameDetailDrawerProps = {
  ref: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  game: PublishedGame;
  feedback: string;
  recordDownload: string;
  onClose: () => void;
  onCopy: (label: string, value: string) => Promise<void>;
};

function GameDetailDrawer({
  ref,
  closeRef,
  game,
  feedback,
  recordDownload,
  onClose,
  onCopy,
}: GameDetailDrawerProps) {
  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <aside
      ref={ref}
      className={styles.drawer}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-detail-title"
      onKeyDown={trapFocus}
    >
      <header className={styles.drawerHeader}>
        <h2 id="game-detail-title">Submission details</h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close submission details"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className={styles.drawerStatus}>
        <EvidenceStatus published label="Source pinned" />
        <EvidenceStatus published label="Deployment verified" />
        <EvidenceStatus
          published={game.lineage.kind !== "unverified"}
          label={formatLineage(game)}
        />
      </div>

      <div className={styles.drawerScroll}>
        <DetailSection title="About">
          <p>{game.description}</p>
          {game.features.length ? (
            <ul className={styles.featureList}>
              {game.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          ) : null}
        </DetailSection>

        <DetailSection title="Accepted record">
          <DetailList
            rows={[
              ["Model", game.model],
              ["Built", formatDate(game.builtOn)],
              ["Source commit", game.source.commit],
              ["Deployment provider", game.deployment.provider],
              ["Deployment URL", game.deployment.url],
              ["Lineage", formatLineage(game)],
            ]}
          />
        </DetailSection>

        <DetailSection title="Provenance">
          <JsonBlock value={game.provenance} />
        </DetailSection>

        <DetailSection title="Licenses">
          <JsonBlock value={game.licenses} />
        </DetailSection>

        <DetailSection title="Presentation">
          <JsonBlock value={game.presentation} />
        </DetailSection>
      </div>

      <div className={styles.drawerActions}>
        <button
          type="button"
          onClick={() => void onCopy("Source commit", game.source.commit)}
        >
          <Copy aria-hidden="true" />
          Copy commit
        </button>
        <a href={recordDownload} download={`${game.id}.json`}>
          <DownloadSimple aria-hidden="true" />
          Download record
        </a>
        <a
          className={styles.primaryDrawerAction}
          href={getSourceRevisionUrl(game.source)}
          target="_blank"
          rel="noreferrer"
        >
          View source
          <ArrowSquareOut aria-hidden="true" />
        </a>
        <p className={styles.copyFeedback} role="status" aria-live="polite">
          {feedback}
        </p>
      </div>
    </aside>
  );
}

function JsonBlock({ value }: { value: object }) {
  return (
    <pre className={styles.jsonBlock}>{JSON.stringify(value, null, 2)}</pre>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.detailSection}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DetailList({ rows }: { rows: Array<[string, string | number]> }) {
  return (
    <dl className={styles.detailList}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceStatus({
  published,
  label,
}: {
  published: boolean;
  label: string;
}) {
  return (
    <span data-published={published ? "true" : "false"}>
      {published ? (
        <CheckCircle aria-hidden="true" weight="fill" />
      ) : (
        <WarningCircle aria-hidden="true" weight="fill" />
      )}
      {label}
    </span>
  );
}

function SideGameCard({
  game,
  onSelect,
}: {
  game: PublishedGame;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className={styles.sideCard}
      type="button"
      onClick={() => onSelect(game.id)}
      aria-label={`Select ${game.title}`}
    >
      <span className={styles.cardHeading}>
        <strong>{game.model}</strong>
        <span>{game.title}</span>
        <time dateTime={game.builtOn}>Built {formatDate(game.builtOn)}</time>
      </span>
      <GameCover game={game} />
      <small>{game.tagline}</small>
    </button>
  );
}

function OpenGameSlot({ position }: { position: "previous" | "next" }) {
  return (
    <a
      className={styles.openSlot}
      href={CONTRIBUTION_URL}
      aria-label={`${position === "previous" ? "Previous" : "Next"} submission slot is open`}
    >
      <PaperPlaneTilt aria-hidden="true" weight="bold" />
      <span>Open slot</span>
      <strong>Submit your GTA-in-SF build</strong>
      <small>GitHub source + live URL</small>
    </a>
  );
}

function getNeighboringGames(
  games: readonly PublishedGame[],
  selectedIndex: number,
) {
  if (games.length === 1) return { previous: null, next: null };
  if (games.length === 2) {
    return {
      previous: games[(selectedIndex + 1) % games.length],
      next: null,
    };
  }
  return {
    previous: games[(selectedIndex - 1 + games.length) % games.length],
    next: games[(selectedIndex + 1) % games.length],
  };
}

function formatLineage(game: PublishedGame) {
  if (game.lineage.kind === "independent") return "Independent";
  if (game.lineage.kind === "derived") {
    return `Derived from ${game.lineage.parentId}`;
  }
  return "Unverified lineage";
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function isFormControl(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement
  );
}
