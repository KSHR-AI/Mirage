"use client";

import {
  ArrowRight,
  GithubLogo,
  PaperPlaneTilt,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import sfChaseImage from "./mirage-bench-sf-chase.jpg";
import styles from "./RegistryNotice.module.css";

const CONTRIBUTION_URL =
  "https://github.com/KSHR-AI/Mirage/issues/new?template=demo.yml";
const REPOSITORY_URL = "https://github.com/KSHR-AI/Mirage";

export type RegistryNoticeKind = "empty" | "unavailable";

export function RegistryNotice({
  kind,
  message,
}: {
  kind: RegistryNoticeKind;
  message: string;
}) {
  const isEmpty = kind === "empty";

  return (
    <main className={styles.shell} data-registry-state={kind}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.heroImage}
        src={sfChaseImage.src}
        alt=""
        aria-hidden="true"
      />
      <div className={styles.imageVeil} aria-hidden="true" />
      <div className={styles.lowerScrim} aria-hidden="true" />

      <header className={styles.masthead}>
        <span className={styles.mastRule} aria-hidden="true" />
        <Link href="/" className={styles.wordmark}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" />
          <strong>MirageML Bench</strong>
        </Link>
        <span className={styles.collectionWord}>GTA in SF</span>
        <span className={styles.mastRule} aria-hidden="true" />
      </header>

      <section className={styles.message}>
        <span className={styles.eyebrow}>
          {isEmpty ? "MirageML Bench" : "Registry unavailable"}
        </span>
        <h1>{isEmpty ? "GTA in SF" : "Submissions unavailable."}</h1>
        {isEmpty ? null : <p>{message}</p>}
      </section>

      <section
        className={styles.launchDeck}
        aria-label={
          isEmpty ? "Submit the first benchmark run" : "Registry status"
        }
      >
        {isEmpty ? (
          <article className={styles.launchCard}>
            <div className={styles.cardHeading}>
              <span>Starting grid open</span>
              <small>0 submissions</small>
            </div>
            <h2>No submissions yet.</h2>
            <p>Be the first on the board.</p>
            <a className={styles.primary} href={CONTRIBUTION_URL}>
              <PaperPlaneTilt aria-hidden="true" weight="fill" />
              Submit
              <ArrowRight aria-hidden="true" weight="bold" />
            </a>
            <a className={styles.secondary} href={REPOSITORY_URL}>
              <GithubLogo aria-hidden="true" weight="fill" />
              View on GitHub
            </a>
          </article>
        ) : (
          <article className={styles.launchCard}>
            <div className={styles.cardHeading}>
              <span>Verification paused</span>
              <WarningCircle aria-hidden="true" weight="fill" />
            </div>
            <h2>No unverified run will be loaded.</h2>
            <p>{message}</p>
            <Link className={styles.primary} href="/">
              Retry registry
              <ArrowRight aria-hidden="true" weight="bold" />
            </Link>
            <a className={styles.secondary} href={REPOSITORY_URL}>
              <GithubLogo aria-hidden="true" weight="fill" />
              View project
            </a>
          </article>
        )}
      </section>

      <footer className={styles.footer}>
        <a href={REPOSITORY_URL}>GitHub</a>
        <span>MirageML Bench · GTA in SF</span>
        <nav aria-label="Project links">
          <a href={CONTRIBUTION_URL}>
            <PaperPlaneTilt aria-hidden="true" weight="fill" />
            Submit
          </a>
        </nav>
      </footer>
    </main>
  );
}
