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
  Gauge,
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
  BENCHMARK_RUNS,
  BENCHMARK_TASK,
  hasPublishedPrompt,
  hasPublishedSetup,
  type BenchmarkRun,
} from "./catalog";
import styles from "./BenchmarkHub.module.css";

const REPOSITORY_URL = BENCHMARK_TASK.repositoryUrl;
const CONTRIBUTION_URL = `${REPOSITORY_URL.replace(/\/$/, "")}/blob/main/${BENCHMARK_TASK.contribution.guidePath.replace(/^\//, "")}`;
const DRAWER_FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type BenchmarkHubProps = {
  runs?: readonly BenchmarkRun[];
};

export function BenchmarkHub({ runs = BENCHMARK_RUNS }: BenchmarkHubProps) {
  const [selectedRunId, setSelectedRunId] = useState(runs[0].id);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [feedback, setFeedback] = useState("");
  const deckRef = useRef<HTMLElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const gameFrameRef = useRef<HTMLIFrameElement>(null);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0],
    [runs, selectedRunId],
  );
  const selectedIndex = runs.findIndex((run) => run.id === selectedRun.id);
  const neighboringRuns = getNeighboringRuns(runs, selectedIndex);
  const manifestDownload = useMemo(
    () =>
      `data:application/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(selectedRun, null, 2),
      )}`,
    [selectedRun],
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
      if (runs.length < 2) return;
      const nextIndex = (selectedIndex + direction + runs.length) % runs.length;
      setSelectedRunId(runs[nextIndex].id);
      setFeedback("");
    },
    [runs, selectedIndex],
  );

  const beginPlay = useCallback(() => {
    setDetailOpen(false);
    setIsPlaying(true);
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    requestAnimationFrame(() => closeRef.current?.focus());
  }, [detailOpen, selectedRun.id]);

  useEffect(() => {
    if (!isPlaying) return;
    const focusFrame = () => gameFrameRef.current?.focus();
    const frame = requestAnimationFrame(focusFrame);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, selectedRun.id]);

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
          key={selectedRun.id}
          className={styles.liveGame}
          src={withEmbedMode(selectedRun.playUrl)}
          title={`${selectedRun.model} playable benchmark artifact`}
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen"
          allow="fullscreen; gamepad"
          allowFullScreen
          referrerPolicy="no-referrer"
          tabIndex={0}
        />
        <div className={styles.playBar}>
          <button type="button" onClick={() => setIsPlaying(false)}>
            <ArrowLeft aria-hidden="true" weight="bold" />
            Back to builds
          </button>
          <span>
            <strong>{selectedRun.model}</strong>
          </span>
          <a href={selectedRun.playUrl} target="_blank" rel="noreferrer">
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
        aria-label={`${BENCHMARK_TASK.brandName} ${BENCHMARK_TASK.surfaceLabel} build lobby`}
        inert={detailOpen ? true : undefined}
      >
        {/* The benchmark manifest owns these static/public paths; Vinext's
            image optimizer is not available in the local Worker runtime. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.heroImage}
          src={selectedRun.previewImage}
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
            aria-label={`${BENCHMARK_TASK.brandName} home`}
          >
            {BENCHMARK_TASK.brandName}
          </Link>
          <span className={styles.benchmarkWord}>
            {BENCHMARK_TASK.surfaceLabel}
          </span>
          <span className={styles.mastRule} aria-hidden="true" />
        </header>

        <section
          ref={deckRef}
          id="run-deck"
          className={styles.runDeck}
          aria-label="Playable benchmark builds"
          tabIndex={-1}
        >
          <output className={styles.runStatus} aria-live="polite">
            <Gauge aria-hidden="true" weight="fill" />
            <span>{selectedRun.progress.percent}% submitter estimate</span>
            <i aria-hidden="true" />
            <span>{capitalize(selectedRun.status)}</span>
            <i aria-hidden="true" />
            <span>
              {selectedRun.comparisonEligible ? "Ranked" : "Unranked"}
            </span>
          </output>

          <div className={styles.deckRow}>
            <button
              className={styles.deckArrow}
              type="button"
              aria-label="Previous build"
              disabled={runs.length < 2}
              onClick={() => moveSelection(-1)}
            >
              <CaretLeft aria-hidden="true" weight="bold" />
            </button>

            <div className={styles.cards}>
              {neighboringRuns.previous ? (
                <SideRunCard
                  run={neighboringRuns.previous}
                  onSelect={setSelectedRunId}
                />
              ) : (
                <OpenRunSlot position="previous" />
              )}

              <article
                className={styles.selectedCard}
                aria-current="true"
                data-run-id={selectedRun.id}
              >
                <div className={styles.cardHeading}>
                  <strong>{selectedRun.model}</strong>
                  <time dateTime={selectedRun.builtOn}>
                    Built {formatDate(selectedRun.builtOn)}
                  </time>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedRun.previewImage}
                  alt={`${selectedRun.model} preview`}
                />
                <p>Independently built · Playable game</p>
                <button
                  className={styles.playButton}
                  type="button"
                  onClick={beginPlay}
                >
                  <Play aria-hidden="true" weight="fill" />
                  Play selected build
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
                  Prompt &amp; setup
                  <ArrowRight aria-hidden="true" weight="bold" />
                </button>
              </article>

              {neighboringRuns.next ? (
                <SideRunCard
                  run={neighboringRuns.next}
                  onSelect={setSelectedRunId}
                />
              ) : (
                <OpenRunSlot position="next" />
              )}
            </div>

            <button
              className={styles.deckArrow}
              type="button"
              aria-label="Next build"
              disabled={runs.length < 2}
              onClick={() => moveSelection(1)}
            >
              <CaretRight aria-hidden="true" weight="bold" />
            </button>
          </div>
        </section>

        <footer className={styles.stageFooter}>
          <button type="button" onClick={() => deckRef.current?.focus()}>
            <LinkSimple aria-hidden="true" weight="bold" />
            Compare models
          </button>
          <time dateTime={BENCHMARK_TASK.updatedOn}>
            {formatDate(BENCHMARK_TASK.updatedOn)}
          </time>
          <nav aria-label="Project links">
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              <GithubLogo aria-hidden="true" weight="fill" />
              View on GitHub
            </a>
            <a href={CONTRIBUTION_URL} target="_blank" rel="noreferrer">
              <PaperPlaneTilt aria-hidden="true" weight="bold" />
              {BENCHMARK_TASK.contribution.navAction}
            </a>
          </nav>
        </footer>
      </section>

      {detailOpen ? (
        <RunDetailDrawer
          ref={drawerRef}
          closeRef={closeRef}
          run={selectedRun}
          feedback={feedback}
          manifestDownload={manifestDownload}
          onClose={closeDetail}
          onCopy={copyText}
        />
      ) : null}
    </main>
  );
}

type RunDetailDrawerProps = {
  ref: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  run: BenchmarkRun;
  feedback: string;
  manifestDownload: string;
  onClose: () => void;
  onCopy: (label: string, value: string | null) => Promise<void>;
};

function RunDetailDrawer({
  ref,
  closeRef,
  run,
  feedback,
  manifestDownload,
  onClose,
  onCopy,
}: RunDetailDrawerProps) {
  const promptPublished = hasPublishedPrompt(run);
  const setupPublished = hasPublishedSetup(run);
  const sourcePinned = /^[0-9a-f]{40}$/.test(run.commit);
  const setupText = formatSetupForCopy(run);

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
      aria-labelledby="run-detail-title"
      onKeyDown={trapFocus}
    >
      <header className={styles.drawerHeader}>
        <h2 id="run-detail-title">Reproduce this run</h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close run details"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className={styles.drawerStatus}>
        <EvidenceStatus
          published={promptPublished}
          label={promptPublished ? "Prompt published" : "Prompt missing"}
        />
        <EvidenceStatus
          published={setupPublished}
          label={setupPublished ? "Setup published" : "Setup partial"}
        />
        <EvidenceStatus published={sourcePinned} label="Source pinned" />
      </div>

      <div className={styles.drawerScroll}>
        <DetailSection title="Prompt">
          {run.provenance.prompt.text ? (
            <>
              <blockquote>{run.provenance.prompt.text}</blockquote>
              <button
                className={styles.textLink}
                type="button"
                onClick={() =>
                  void onCopy("Prompt", run.provenance.prompt.text)
                }
              >
                Copy full prompt
                <Copy aria-hidden="true" />
              </button>
            </>
          ) : (
            <div className={styles.missingEvidence}>
              <WarningCircle aria-hidden="true" weight="fill" />
              <p>{run.provenance.prompt.note}</p>
            </div>
          )}
        </DetailSection>

        <DetailSection title="Setup">
          <DetailList
            rows={[
              ["Model", run.model],
              ["Model snapshot", run.provenance.setup.modelSnapshot],
              ["Reasoning", run.provenance.setup.reasoning],
              ["Harness", run.provenance.setup.harness],
              [
                "Tools",
                run.provenance.setup.tools.length
                  ? run.provenance.setup.tools.join(", ")
                  : null,
              ],
              ["Agent count", run.provenance.setup.agentCount],
              ["Subagent count", run.provenance.setup.subagentCount],
              ["Base commit", shortCommit(run.provenance.setup.baseCommit)],
              ["Result commit", shortCommit(run.provenance.setup.resultCommit)],
            ]}
          />
        </DetailSection>

        <DetailSection title="Run">
          <DetailList
            rows={[
              [
                "Wall time",
                formatDuration(run.provenance.execution.wallTimeSeconds),
              ],
              [
                "Tokens (total)",
                formatNumber(run.provenance.execution.totalTokens),
              ],
              ["Cost (USD)", formatCost(run.provenance.execution.costUsd)],
              ["Retries", run.provenance.execution.retries],
              [
                "Human interventions",
                run.provenance.execution.humanInterventions,
              ],
            ]}
          />
        </DetailSection>

        <DetailSection title="Dependencies & assets">
          <DetailList
            rows={[
              ["Package lock", run.provenance.dependencies.packageLock],
              [
                "Third-party assets",
                run.provenance.dependencies.thirdPartyAssets,
              ],
              [
                "License status",
                run.provenance.dependencies.licenseStatus === "verified"
                  ? "Verified"
                  : "Review required",
              ],
            ]}
          />
        </DetailSection>

        <DetailSection title="Verification">
          <DetailList
            rows={[
              [
                "Progress estimate",
                `${run.progress.percent}% · Submitter reported`,
              ],
              ["Estimate basis", run.progress.note],
              [
                "Ranking",
                run.comparisonEligible ? "Comparable" : "Not yet comparable",
              ],
            ]}
          />
          <a
            className={styles.textLink}
            href={run.playUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open playable artifact
            <ArrowSquareOut aria-hidden="true" />
          </a>
        </DetailSection>
      </div>

      <div className={styles.drawerActions}>
        <button
          type="button"
          disabled={!run.provenance.prompt.text}
          onClick={() => void onCopy("Prompt", run.provenance.prompt.text)}
        >
          <Copy aria-hidden="true" />
          Copy prompt
        </button>
        <button
          type="button"
          onClick={() => void onCopy("Available setup", setupText)}
        >
          <Copy aria-hidden="true" />
          Copy available setup
        </button>
        <a href={manifestDownload} download={`${run.id}.json`}>
          <DownloadSimple aria-hidden="true" />
          Download manifest
        </a>
        <a
          className={styles.primaryDrawerAction}
          href={run.provenance.submissionPrUrl ?? run.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {run.provenance.submissionPrUrl
            ? "View submission PR"
            : "View source history"}
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

function SideRunCard({
  run,
  onSelect,
}: {
  run: BenchmarkRun;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className={styles.sideCard}
      type="button"
      onClick={() => onSelect(run.id)}
      aria-label={`Select ${run.model}`}
    >
      <span className={styles.cardHeading}>
        <strong>{run.model}</strong>
        <time dateTime={run.builtOn}>Built {formatDate(run.builtOn)}</time>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={run.previewImage} alt="" />
      <small>Independently built · {capitalize(run.status)} game</small>
    </button>
  );
}

function OpenRunSlot({ position }: { position: "previous" | "next" }) {
  const contribution = BENCHMARK_TASK.contribution;

  return (
    <a
      className={styles.openSlot}
      href={CONTRIBUTION_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={`${position === "previous" ? "Previous" : "Next"} benchmark run slot is open; ${contribution.slotAction}`}
    >
      <PaperPlaneTilt aria-hidden="true" weight="bold" />
      <span>{contribution.slotLabel}</span>
      <strong>{contribution.slotDescription}</strong>
      <small>{contribution.slotAction}</small>
    </a>
  );
}

function getNeighboringRuns(
  runs: readonly BenchmarkRun[],
  selectedIndex: number,
) {
  if (runs.length === 1) return { previous: null, next: null };
  if (runs.length === 2) {
    return {
      previous: runs[(selectedIndex + 1) % runs.length],
      next: null,
    };
  }
  return {
    previous: runs[(selectedIndex - 1 + runs.length) % runs.length],
    next: runs[(selectedIndex + 1) % runs.length],
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

function formatSetupForCopy(run: BenchmarkRun) {
  const setup = run.provenance.setup;
  return [
    `Model: ${run.model}`,
    `Model snapshot: ${setup.modelSnapshot ?? "Not recorded"}`,
    `Reasoning: ${setup.reasoning ?? "Not recorded"}`,
    `Harness: ${setup.harness ?? "Not recorded"}`,
    `Tools: ${setup.tools.length ? setup.tools.join(", ") : "Not recorded"}`,
    `Agent count: ${setup.agentCount ?? "Not recorded"}`,
    `Subagent count: ${setup.subagentCount ?? "Not recorded"}`,
    `Base commit: ${setup.baseCommit ?? "Not recorded"}`,
    `Result commit: ${setup.resultCommit}`,
  ].join("\n");
}

function withEmbedMode(playUrl: string) {
  return `${playUrl}${playUrl.includes("?") ? "&" : "?"}embed=benchmark`;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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
