import {
  ArrowRight,
  ArrowUpRight,
  PaperPlaneTilt,
  WarningCircle,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { AGENT_PROMPT_URL, SUBMIT_PATH } from "../site/links";
import { SiteFooter, SiteHeader } from "../site/SiteChrome";
import styles from "./RegistryNotice.module.css";

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
    <div className={styles.page} data-registry-state={kind}>
      <SiteHeader />
      <main className={styles.main}>
        <article
          className={styles.card}
          aria-label={
            isEmpty ? "Submit the first benchmark run" : "Registry status"
          }
        >
          <span className={styles.icon} aria-hidden="true">
            {isEmpty ? (
              <PaperPlaneTilt weight="fill" />
            ) : (
              <WarningCircle weight="fill" />
            )}
          </span>
          <p className={styles.eyebrow}>
            {isEmpty ? "0 runs on the board" : "Registry unavailable"}
          </p>
          <h1>
            {isEmpty
              ? "No runs on the board yet."
              : "No unverified run will be loaded."}
          </h1>
          <p className={styles.message}>{message}</p>
          <div className={styles.actions}>
            {isEmpty ? (
              <>
                <Link className={styles.primary} href={SUBMIT_PATH}>
                  Submit the first run
                  <ArrowRight aria-hidden="true" weight="bold" />
                </Link>
                <a
                  className={styles.secondary}
                  href={AGENT_PROMPT_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Build one from scratch
                  <ArrowUpRight aria-hidden="true" weight="bold" />
                </a>
              </>
            ) : (
              <Link className={styles.primary} href="/">
                Retry
                <ArrowRight aria-hidden="true" weight="bold" />
              </Link>
            )}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
