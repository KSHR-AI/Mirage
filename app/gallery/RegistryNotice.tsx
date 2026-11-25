import {
  ArrowRight,
  ArrowUpRight,
  PaperPlaneTilt,
  WarningCircle,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { AGENT_PROMPT_URL } from "../site/links";
import { SiteFooter, SiteHeader } from "../site/SiteChrome";
import sfChaseImage from "./mirage-bench-sf-chase.jpg";
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
      <main className={styles.hero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.heroImage}
          src={sfChaseImage.src}
          alt=""
          aria-hidden="true"
        />
        <div className={styles.heroVeil} aria-hidden="true" />

        <div className={styles.inner}>
          <section className={styles.message}>
            <p className={styles.eyebrow}>
              {isEmpty
                ? "The vibe benchmark for coding models"
                : "Registry unavailable"}
            </p>
            <h1>
              {isEmpty ? (
                <>
                  Can coding models build <em>GTA in SF?</em>
                </>
              ) : (
                "Runs unavailable."
              )}
            </h1>
          </section>

          <article
            className={styles.card}
            aria-label={
              isEmpty ? "Submit the first benchmark run" : "Registry status"
            }
          >
            <header>
              <span>
                {isEmpty ? "Starting grid open" : "Verification paused"}
              </span>
              {isEmpty ? (
                <span>0 runs</span>
              ) : (
                <WarningCircle aria-hidden="true" weight="fill" />
              )}
            </header>
            <h2>
              {isEmpty
                ? "No runs on the board yet."
                : "No unverified run will be loaded."}
            </h2>
            <p>{message}</p>
            <div className={styles.actions}>
              {isEmpty ? (
                <>
                  <a className={styles.primary} href={SUBMIT_HASH}>
                    <PaperPlaneTilt aria-hidden="true" weight="fill" />
                    Submit the first run
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
                  Retry registry
                  <ArrowRight aria-hidden="true" weight="bold" />
                </Link>
              )}
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
      {isEmpty ? <SubmitDialog prompt={submitPrompt} /> : null}
    </div>
  );
}
