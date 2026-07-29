"use client";

import { ArrowRight, GithubLogo, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
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
  return (
    <main className={styles.shell} data-registry-state={kind}>
      <div className={styles.glow} aria-hidden="true" />
      <header className={styles.masthead}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="" />
        <span>Mirage</span>
        <i aria-hidden="true" />
        <small>Model-built games</small>
      </header>

      <section className={styles.message}>
        <span className={styles.eyebrow}>
          {kind === "empty" ? "Registry online" : "Registry unavailable"}
        </span>
        <h1>
          {kind === "empty"
            ? "The next game starts from zero."
            : "Published games cannot be verified."}
        </h1>
        <p>{message}</p>
        {kind === "unavailable" ? (
          <div className={styles.integrity}>
            <WarningCircle aria-hidden="true" weight="fill" />
            <span>
              Mirage will not fall back to bundled, stale, or unverified game
              code.
            </span>
          </div>
        ) : null}
        <div className={styles.actions}>
          <a className={styles.primary} href={CONTRIBUTION_URL}>
            Submit a game
            <ArrowRight aria-hidden="true" weight="bold" />
          </a>
          {kind === "unavailable" ? (
            <Link href="/">Retry registry</Link>
          ) : (
            <a href={REPOSITORY_URL}>
              <GithubLogo aria-hidden="true" weight="fill" />
              View project
            </a>
          )}
        </div>
      </section>

      <footer>
        <span>Runtime registry · immutable artifacts</span>
        <span>{kind === "empty" ? "0 published games" : "No game loaded"}</span>
      </footer>
    </main>
  );
}
