import {
  ArrowRight,
  ArrowUpRight,
  PaperPlaneTilt,
  WarningCircle,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { AGENT_PROMPT_URL } from "../site/links";
import { SiteFooter, SiteHeader } from "../site/SiteChrome";
import { SUBMIT_HASH, SubmitDialog } from "./SubmitDialog";
import styles from "./RegistryNotice.module.css";

export type RegistryNoticeKind = "empty" | "unavailable";

export function RegistryNotice({
  kind,
  message,
  submitPrompt = null,
}: {
  kind: RegistryNoticeKind;
  message: string;
  submitPrompt?: string | null;
}) {
  const isEmpty = kind === "empty";

  return (
    <div className={styles.page} data-registry-state={kind}>
      <SiteHeader submitHref={isEmpty ? SUBMIT_HASH : undefined} />
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
                <a className={styles.primary} href={SUBMIT_HASH}>
                  Submit the first run
                  <ArrowRight aria-hidden="true" weight="bold" />
                </a>
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
      {isEmpty ? <SubmitDialog prompt={submitPrompt} /> : null}
    </div>
  );
}
