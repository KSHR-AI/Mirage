import { GithubLogo, PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { REPOSITORY_URL, SUBMIT_PATH } from "./links";
import styles from "./SiteChrome.module.css";

export type SiteSection = "leaderboard" | "arena";

const SECTIONS: { key: SiteSection; label: string; href: string }[] = [
  { key: "leaderboard", label: "Leaderboard", href: "/" },
  { key: "arena", label: "Arena", href: "/arena" },
];

/** Submit is a section of the leaderboard page, so the link works anywhere. */
export function SiteHeader({ current }: { current?: SiteSection }) {
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
        <nav className={styles.sections} aria-label="Site">
          {SECTIONS.map((section) => (
            <Link
              key={section.key}
              href={section.href}
              aria-current={current === section.key ? "page" : undefined}
            >
              {section.label}
              {section.key === "arena" ? (
                <span className={styles.voteBadge}>Vote</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className={styles.actions}>
          <a
            className={styles.iconLink}
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
          >
            <GithubLogo aria-hidden="true" weight="fill" />
            <span>GitHub</span>
          </a>
          <Link
            className={styles.submit}
            href={SUBMIT_PATH}
            aria-label="Submit a run"
          >
            <PaperPlaneTilt aria-hidden="true" weight="bold" />
            <span>
              Submit<span className={styles.submitLong}>&nbsp;a run</span>
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p>
          “GTA” names a genre-level challenge. MirageML Bench is not affiliated
          with Rockstar Games or Take-Two Interactive.
        </p>
        <nav aria-label="Project links">
          <Link href="/#methodology">Methodology</Link>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            <GithubLogo aria-hidden="true" weight="fill" />
            GitHub
          </a>
          <Link href={SUBMIT_PATH}>
            <PaperPlaneTilt aria-hidden="true" weight="bold" />
            Submit
          </Link>
        </nav>
      </div>
    </footer>
  );
}
