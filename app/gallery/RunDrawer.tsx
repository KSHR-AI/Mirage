"use client";

import {
  ArrowSquareOut,
  Check,
  Copy,
  DownloadSimple,
  Play,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  formatBuildDate,
  getEvidenceSignals,
  getModelLabel,
  getRecordedHarness,
} from "../registry/evidence";
import type { JsonValue, PublishedGame } from "../registry/schema";
import { getCanonicalPlayPath, getSourceRevisionUrl } from "../registry/urls";
import { copyText } from "./clipboard";
import {
  EvidenceGlyph,
  GameCover,
  PostButton,
  ShareLinkButton,
  TrackPill,
} from "./RunParts";
import styles from "./RunDrawer.module.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function RunDrawer({
  game,
  onClose,
}: {
  game: PublishedGame;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [commitCopied, setCommitCopied] = useState(false);
  const recordDownload = useMemo(
    () =>
      `data:application/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(game, null, 2),
      )}`,
    [game],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [game.id]);

  useEffect(() => {
    if (!commitCopied) return;
    const timer = setTimeout(() => setCommitCopied(false), 2200);
    return () => clearTimeout(timer);
  }, [commitCopied]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
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

  const harness = getRecordedHarness(game);
  const tools = stringList(game.provenance.tools);

  return (
    <>
      <div className={styles.scrim} aria-hidden="true" onClick={onClose} />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-record-title"
        data-game-id={game.id}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.head}>
          <p>
            Run record <span>{game.id}</span>
          </p>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close run record"
            onClick={onClose}
          >
            <X aria-hidden="true" weight="bold" />
          </button>
        </header>

        <div className={styles.scroll}>
          <div className={styles.cover}>
            <GameCover game={game} />
            <span className={styles.coverTrack}>
              <TrackPill track={game.track} />
            </span>
          </div>

          <div className={styles.identity}>
            <p className={styles.model}>{getModelLabel(game)}</p>
            <h2 id="run-record-title">{game.title}</h2>
            <p className={styles.tagline}>{game.tagline}</p>
            <div className={styles.actions}>
              <Link className={styles.play} href={getCanonicalPlayPath(game)}>
                <Play aria-hidden="true" weight="fill" />
                Play
              </Link>
              <ShareLinkButton className={styles.secondary} game={game} />
              <PostButton className={styles.secondary} game={game} />
            </div>
          </div>

          <Section title="Evidence">
            {game.track === "showcase" ? (
              <p className={styles.trackNote}>
                Showcase: a playable deployment with stated unknowns. It is not
                benchmark proof.
              </p>
            ) : null}
            <ul className={styles.evidence}>
              {getEvidenceSignals(game).map((signal) => (
                <li key={signal.key} data-state={signal.state}>
                  <EvidenceGlyph state={signal.state} />
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                  {signal.note ? <p>{signal.note}</p> : null}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="About">
            <p>{game.description}</p>
            <BulletList items={game.features} />
          </Section>

          <Section title="Controls">
            <BulletList items={game.presentation.controls} />
          </Section>

          <Section title="Known limits">
            <BulletList items={game.presentation.limitations} />
          </Section>

          <Section title="Build record">
            <dl className={styles.facts}>
              <Fact label="Track">
                {game.track === "benchmark" ? "Benchmark" : "Showcase"}
              </Fact>
              <Fact label="Built">
                {game.builtOn ? formatBuildDate(game.builtOn) : "Not recorded"}
              </Fact>
              <Fact label="Harness">{harness ?? "Not recorded"}</Fact>
              <Fact label="Reasoning">{scalar(game.provenance.reasoning)}</Fact>
              <Fact label="Agents">{scalar(game.provenance.agentCount)}</Fact>
              <Fact label="Subagents">
                {scalar(game.provenance.subagentCount)}
              </Fact>
              <Fact label="Tools">
                {tools.length ? tools.join(", ") : "Not recorded"}
              </Fact>
              <Fact label="Source commit" mono>
                {game.source?.commit ?? "Not published"}
              </Fact>
              <Fact label="Hosted by">
                {game.deployment.provider} (external, contributor-operated)
              </Fact>
              <Fact label="Deployment" mono>
                {game.deployment.url}
              </Fact>
            </dl>
          </Section>

          <Section title="Raw record">
            <RawBlock title="Provenance" value={game.provenance} />
            <RawBlock title="Licenses" value={game.licenses} />
            <RawBlock title="Presentation" value={game.presentation} />
          </Section>
        </div>

        <footer className={styles.foot}>
          {game.source ? (
            <button
              type="button"
              onClick={async () =>
                setCommitCopied(await copyText(game.source!.commit))
              }
            >
              {commitCopied ? (
                <Check aria-hidden="true" weight="bold" />
              ) : (
                <Copy aria-hidden="true" />
              )}
              <span aria-live="polite">
                {commitCopied ? "Commit copied" : "Copy commit"}
              </span>
            </button>
          ) : null}
          <a href={recordDownload} download={`${game.id}.json`}>
            <DownloadSimple aria-hidden="true" />
            Download record
          </a>
          {game.source ? (
            <a
              className={styles.footPrimary}
              href={getSourceRevisionUrl(game.source)}
              target="_blank"
              rel="noreferrer"
            >
              View source
              <ArrowSquareOut aria-hidden="true" />
            </a>
          ) : (
            <a
              className={styles.footPrimary}
              href={game.deployment.url}
              target="_blank"
              rel="noreferrer"
            >
              Open deployment
              <ArrowSquareOut aria-hidden="true" />
            </a>
          )}
        </footer>
      </aside>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return <p>None recorded.</p>;
  return (
    <ul className={styles.bullets}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Fact({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-mono={mono}>{children}</dd>
    </div>
  );
}

function RawBlock({ title, value }: { title: string; value: object }) {
  return (
    <details className={styles.raw}>
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function scalar(value: JsonValue | undefined) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "Not recorded";
}

function stringList(value: JsonValue | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
