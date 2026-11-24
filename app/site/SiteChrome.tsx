import { GithubLogo, PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { CONTRIBUTION_URL, REPOSITORY_URL } from "./links";
import styles from "./SiteChrome.module.css";

/** Section links appear only on the board, where their targets exist. */
export function SiteHeader({ onBoard = false }: { onBoard?: boolean }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link
          href="/"
          className={styles.wordmark}
          aria-label="MirageML Bench home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" />
          <span>MirageML Bench</span>
        </Link>
        <span className={styles.task}>GTA in SF</span>
        <nav className={styles.nav} aria-label="Site">
          {onBoard ? (
            <>
              <a href="#runs">Runs</a>
              <a href="#method">Method</a>
            </>
          ) : null}
          <a
            className={styles.iconLink}
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
          >
            <GithubLogo aria-hidden="true" weight="fill" />
            <span>GitHub</span>
          </a>
          <a className={styles.submit} href={CONTRIBUTION_URL}>
            <PaperPlaneTilt aria-hidden="true" weight="bold" />
            Submit a run
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p>
          “GTA in SF” names a genre-level challenge. MirageML Bench is not
          affiliated with Rockstar Games or Take-Two Interactive.
        </p>
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
      </div>
    </footer>
  );
}
