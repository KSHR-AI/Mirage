"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Copy,
  DownloadSimple,
  GithubLogo,
  LinkSimple,
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
import {
  DEMO_COLLECTION,
  DEMOS,
  hasPublishedPrompt,
  hasPublishedSetup,
  type DemoRecord,
} from "./catalog";
import styles from "./DemoGallery.module.css";

const REPOSITORY_URL = DEMO_COLLECTION.repositoryUrl;
const CONTRIBUTION_URL = `${REPOSITORY_URL.replace(/\/$/, "")}/blob/main/${DEMO_COLLECTION.contribution.guidePath.replace(/^\//, "")}`;
const DRAWER_FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DemoGalleryProps = {
  demos?: readonly DemoRecord[];
};

export function DemoGallery({ demos = DEMOS }: DemoGalleryProps) {
  const [selectedDemoId, setSelectedDemoId] = useState(demos[0].id);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [feedback, setFeedback] = useState("");
  const deckRef = useRef<HTMLElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const gameFrameRef = useRef<HTMLIFrameElement>(null);

  const selectedDemo = useMemo(
    () => demos.find((demo) => demo.id === selectedDemoId) ?? demos[0],
    [demos, selectedDemoId],
  );
  const selectedIndex = demos.findIndex((demo) => demo.id === selectedDemo.id);
  const neighboringDemos = getNeighboringDemos(demos, selectedIndex);
  const recordDownload = useMemo(
    () =>
      `data:application/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(selectedDemo, null, 2),
      )}`,
    [selectedDemo],
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
      if (demos.length < 2) return;
      const nextIndex =
        (selectedIndex + direction + demos.length) % demos.length;
      setSelectedDemoId(demos[nextIndex].id);
      setFeedback("");
    },
    [demos, selectedIndex],
  );

  const beginPlay = useCallback(() => {
    setDetailOpen(false);
    setIsPlaying(true);
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    requestAnimationFrame(() => closeRef.current?.focus());
  }, [detailOpen, selectedDemo.id]);

  useEffect(() => {
    if (!isPlaying) return;
    const frame = requestAnimationFrame(() => gameFrameRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, selectedDemo.id]);

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

  const copyText = async (label: string, value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
    } catch {
      setFeedback(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  if (isPlaying) {
    return (
      <main className={styles.playingShell} data-fullscreen-game>
        <iframe
          ref={gameFrameRef}
          key={selectedDemo.id}
          className={styles.liveGame}
          src={withEmbedMode(selectedDemo.playUrl)}
          title={`${selectedDemo.title}, a playable model-built demo`}
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen"
          allow="fullscreen; gamepad"
          allowFullScreen
          referrerPolicy="no-referrer"
          tabIndex={0}
        />
        <div className={styles.playBar}>
          <button type="button" onClick={() => setIsPlaying(false)}>
            <ArrowLeft aria-hidden="true" weight="bold" />
            Back to demos
          </button>
          <span>
            <strong>{selectedDemo.title}</strong>
            <i aria-hidden="true" />
            {selectedDemo.model}
          </span>
          <a href={selectedDemo.playUrl} target="_blank" rel="noreferrer">
            Open full screen
            <ArrowSquareOut aria-hidden="true" />
          </a>
        </div>
      </main>
    );
  }

  return (
    <main
      className={styles.shell}
      data-detail-open={detailOpen ? "true" : "false"}
    >
      <section
        className={styles.stage}
        aria-label={`${DEMO_COLLECTION.brandName} playable model demo gallery`}
        inert={detailOpen ? true : undefined}
      >
        {/* Demo records own these static or public paths. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.heroImage}
          src={selectedDemo.previewImage}
          alt=""
          aria-hidden="true"
        />
        <div className={styles.imageVeil} aria-hidden="true" />
        <div className={styles.lowerScrim} aria-hidden="true" />

        <header className={styles.masthead}>
          <span className={styles.mastRule} aria-hidden="true" />
          <Link
            href="/"
            className={styles.wordmark}
            aria-label={`${DEMO_COLLECTION.brandName} home`}
          >
            {/* This is also the file-based browser icon; one asset keeps the brand consistent. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.brandMark} src="/icon.png" alt="" />
            <span>{DEMO_COLLECTION.brandName}</span>
          </Link>
          <span className={styles.collectionWord}>
            {DEMO_COLLECTION.surfaceLabel}
          </span>
          <span className={styles.mastRule} aria-hidden="true" />
        </header>

        <div className={styles.heroCopy}>
          <span>Playable model-built game</span>
          <h1>{selectedDemo.title}</h1>
          <p>{selectedDemo.description}</p>
        </div>

        <section
          ref={deckRef}
          id="demo-deck"
          className={styles.runDeck}
          aria-label="Playable model demos"
          tabIndex={-1}
        >
          <div className={styles.deckRow}>
            <button
              className={styles.deckArrow}
              type="button"
              aria-label="Previous demo"
              disabled={demos.length < 2}
              onClick={() => moveSelection(-1)}
            >
              <CaretLeft aria-hidden="true" weight="bold" />
            </button>

            <div className={styles.cards}>
              {neighboringDemos.previous ? (
                <SideDemoCard
                  demo={neighboringDemos.previous}
                  onSelect={setSelectedDemoId}
                />
              ) : (
                <OpenDemoSlot position="previous" />
              )}

              <article
                className={styles.selectedCard}
                aria-current="true"
                data-demo-id={selectedDemo.id}
              >
                <div className={styles.cardHeading}>
                  <strong>{selectedDemo.model}</strong>
                  <span>{selectedDemo.title}</span>
                  <time dateTime={selectedDemo.builtOn}>
                    Built {formatDate(selectedDemo.builtOn)}
                  </time>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedDemo.previewImage}
                  alt={`${selectedDemo.title} preview`}
                />
                <p>{selectedDemo.tagline}</p>
                <button
                  className={styles.playButton}
                  type="button"
                  onClick={beginPlay}
                >
                  <Play aria-hidden="true" weight="fill" />
                  Play demo
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
                  How it was made
                  <ArrowRight aria-hidden="true" weight="bold" />
                </button>
              </article>

              {neighboringDemos.next ? (
                <SideDemoCard
                  demo={neighboringDemos.next}
                  onSelect={setSelectedDemoId}
                />
              ) : (
                <OpenDemoSlot position="next" />
              )}
            </div>

            <button
              className={styles.deckArrow}
              type="button"
              aria-label="Next demo"
              disabled={demos.length < 2}
              onClick={() => moveSelection(1)}
            >
              <CaretRight aria-hidden="true" weight="bold" />
            </button>
          </div>
        </section>

        <footer className={styles.stageFooter}>
          <button type="button" onClick={() => deckRef.current?.focus()}>
            <LinkSimple aria-hidden="true" weight="bold" />
            Browse demos
          </button>
          <time dateTime={DEMO_COLLECTION.updatedOn}>
            Updated {formatDate(DEMO_COLLECTION.updatedOn)}
          </time>
          <nav aria-label="Project links">
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              <GithubLogo aria-hidden="true" weight="fill" />
              View on GitHub
            </a>
            <a href={CONTRIBUTION_URL} target="_blank" rel="noreferrer">
              <PaperPlaneTilt aria-hidden="true" weight="bold" />
              {DEMO_COLLECTION.contribution.navAction}
            </a>
          </nav>
        </footer>
      </section>

      {detailOpen ? (
        <DemoDetailDrawer
          ref={drawerRef}
          closeRef={closeRef}
          demo={selectedDemo}
          feedback={feedback}
          recordDownload={recordDownload}
          onClose={closeDetail}
          onCopy={copyText}
        />
      ) : null}
    </main>
  );
}

type DemoDetailDrawerProps = {
  ref: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  demo: DemoRecord;
  feedback: string;
  recordDownload: string;
  onClose: () => void;
  onCopy: (label: string, value: string | null) => Promise<void>;
};

function DemoDetailDrawer({
  ref,
  closeRef,
  demo,
  feedback,
  recordDownload,
  onClose,
  onCopy,
}: DemoDetailDrawerProps) {
  const promptPublished = hasPublishedPrompt(demo);
  const setupPublished = hasPublishedSetup(demo);
  const sourcePinned = /^[0-9a-f]{40}$/.test(demo.commit);
  const setupText = formatSetupForCopy(demo);

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
      aria-labelledby="demo-detail-title"
      onKeyDown={trapFocus}
    >
      <header className={styles.drawerHeader}>
        <h2 id="demo-detail-title">How this demo was made</h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close demo details"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className={styles.drawerStatus}>
        <EvidenceStatus
          published={promptPublished}
          label={promptPublished ? "Brief available" : "Brief not recorded"}
        />
        <EvidenceStatus
          published={setupPublished}
          label={setupPublished ? "Setup available" : "Setup partial"}
        />
        <EvidenceStatus published={sourcePinned} label="Source linked" />
      </div>

      <div className={styles.drawerScroll}>
        <DetailSection title="About">
          <p>{demo.description}</p>
          <ul className={styles.featureList}>
            {demo.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </DetailSection>

        <DetailSection title="Build brief">
          {demo.provenance.prompt.text ? (
            <>
              <blockquote>{demo.provenance.prompt.text}</blockquote>
              <button
                className={styles.textLink}
                type="button"
                onClick={() =>
                  void onCopy("Build brief", demo.provenance.prompt.text)
                }
              >
                Copy build brief
                <Copy aria-hidden="true" />
              </button>
            </>
          ) : (
            <div className={styles.missingEvidence}>
              <WarningCircle aria-hidden="true" weight="fill" />
              <p>{demo.provenance.prompt.note}</p>
            </div>
          )}
        </DetailSection>

        <DetailSection title="Build setup">
          <DetailList
            rows={[
              ["Model", demo.model],
              ["Model snapshot", demo.provenance.setup.modelSnapshot],
              ["Reasoning", demo.provenance.setup.reasoning],
              ["Agent", demo.provenance.setup.harness],
              [
                "Tools",
                demo.provenance.setup.tools.length
                  ? demo.provenance.setup.tools.join(", ")
                  : null,
              ],
              ["Agent count", demo.provenance.setup.agentCount],
              ["Subagent count", demo.provenance.setup.subagentCount],
              [
                "Starting commit",
                shortCommit(demo.provenance.setup.baseCommit),
              ],
              ["Demo commit", shortCommit(demo.provenance.setup.resultCommit)],
            ]}
          />
        </DetailSection>

        <DetailSection title="Build record">
          <DetailList
            rows={[
              [
                "Build time",
                formatDuration(demo.provenance.execution.wallTimeSeconds),
              ],
              ["Tokens", formatNumber(demo.provenance.execution.totalTokens)],
              ["Cost (USD)", formatCost(demo.provenance.execution.costUsd)],
              ["Retries", demo.provenance.execution.retries],
              [
                "Human interventions",
                demo.provenance.execution.humanInterventions,
              ],
            ]}
          />
        </DetailSection>

        <DetailSection title="Source & assets">
          <DetailList
            rows={[
              ["Package lock", demo.provenance.dependencies.packageLock],
              [
                "Third-party assets",
                demo.provenance.dependencies.thirdPartyAssets,
              ],
              [
                "License status",
                demo.provenance.dependencies.licenseStatus === "verified"
                  ? "Verified"
                  : "Review required",
              ],
            ]}
          />
          <a
            className={styles.textLink}
            href={demo.playUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open playable demo
            <ArrowSquareOut aria-hidden="true" />
          </a>
        </DetailSection>
      </div>

      <div className={styles.drawerActions}>
        <button
          type="button"
          disabled={!demo.provenance.prompt.text}
          onClick={() =>
            void onCopy("Build brief", demo.provenance.prompt.text)
          }
        >
          <Copy aria-hidden="true" />
          Copy brief
        </button>
        <button
          type="button"
          onClick={() => void onCopy("Available setup", setupText)}
        >
          <Copy aria-hidden="true" />
          Copy setup
        </button>
        <a href={recordDownload} download={`${demo.id}.json`}>
          <DownloadSimple aria-hidden="true" />
          Download record
        </a>
        <a
          className={styles.primaryDrawerAction}
          href={demo.sourceUrl}
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

function DetailList({
  rows,
}: {
  rows: Array<[string, string | number | null]>;
}) {
  return (
    <dl className={styles.detailList}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd data-missing={value === null ? "true" : undefined}>
            {value ?? "Not recorded"}
          </dd>
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

function SideDemoCard({
  demo,
  onSelect,
}: {
  demo: DemoRecord;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className={styles.sideCard}
      type="button"
      onClick={() => onSelect(demo.id)}
      aria-label={`Select ${demo.title}`}
    >
      <span className={styles.cardHeading}>
        <strong>{demo.model}</strong>
        <span>{demo.title}</span>
        <time dateTime={demo.builtOn}>Built {formatDate(demo.builtOn)}</time>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={demo.previewImage} alt="" />
      <small>{demo.tagline}</small>
    </button>
  );
}

function OpenDemoSlot({ position }: { position: "previous" | "next" }) {
  const contribution = DEMO_COLLECTION.contribution;

  return (
    <a
      className={styles.openSlot}
      href={CONTRIBUTION_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={`${position === "previous" ? "Previous" : "Next"} demo slot is open; ${contribution.slotAction}`}
    >
      <PaperPlaneTilt aria-hidden="true" weight="bold" />
      <span>{contribution.slotLabel}</span>
      <strong>{contribution.slotDescription}</strong>
      <small>{contribution.slotAction}</small>
    </a>
  );
}

function getNeighboringDemos(
  demos: readonly DemoRecord[],
  selectedIndex: number,
) {
  if (demos.length === 1) return { previous: null, next: null };
  if (demos.length === 2) {
    return {
      previous: demos[(selectedIndex + 1) % demos.length],
      next: null,
    };
  }
  return {
    previous: demos[(selectedIndex - 1 + demos.length) % demos.length],
    next: demos[(selectedIndex + 1) % demos.length],
  };
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function shortCommit(value: string | null) {
  return value ? value.slice(0, 7) : null;
}

function formatNumber(value: number | null) {
  return value === null ? null : new Intl.NumberFormat("en-US").format(value);
}

function formatCost(value: number | null) {
  return value === null ? null : `$${value.toFixed(2)}`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours}h ${minutes}m ${remainder}s`;
}

function formatSetupForCopy(demo: DemoRecord) {
  const setup = demo.provenance.setup;
  return [
    `Demo: ${demo.title}`,
    `Model: ${demo.model}`,
    `Model snapshot: ${setup.modelSnapshot ?? "Not recorded"}`,
    `Reasoning: ${setup.reasoning ?? "Not recorded"}`,
    `Agent: ${setup.harness ?? "Not recorded"}`,
    `Tools: ${setup.tools.length ? setup.tools.join(", ") : "Not recorded"}`,
    `Agent count: ${setup.agentCount ?? "Not recorded"}`,
    `Subagent count: ${setup.subagentCount ?? "Not recorded"}`,
    `Starting commit: ${setup.baseCommit ?? "Not recorded"}`,
    `Demo commit: ${setup.resultCommit}`,
  ].join("\n");
}

function withEmbedMode(playUrl: string) {
  return `${playUrl}${playUrl.includes("?") ? "&" : "?"}embed=gallery`;
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
