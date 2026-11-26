import { GithubLogo, PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { REPOSITORY_URL, SUBMIT_PROMPT_URL } from "./links";
import styles from "./SiteChrome.module.css";

/**
 * `onBoard` links to sections of the board. Elsewhere, Submit opens the agent
 * prompt on GitHub because the page has no submit section.
 */
export type SiteSection = "leaderboard" | "arena";

export function SiteHeader({
  onBoard = false,
  submitHref = SUBMIT_PROMPT_URL,
  current,
}: {
  onBoard?: boolean;
  submitHref?: string;
  current?: SiteSection;
}) {
  const sections: { key: SiteSection; label: string; href: string }[] = [
    {
      key: "leaderboard",
      label: "Leaderboard",
      href: onBoard ? "#leaderboard" : "/",
    },
    { key: "arena", label: "Arena", href: "/arena" },
  ];

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
          {sections.map((section) => (
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
          <a
            className={styles.submit}
            href={submitHref}
            aria-label="Submit a run"
          >
            <PaperPlaneTilt aria-hidden="true" weight="bold" />
            <span>
              Submit<span className={styles.submitLong}>&nbsp;a run</span>
            </span>
          </a>
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
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            <GithubLogo aria-hidden="true" weight="fill" />
            GitHub
          </a>
          <a href={SUBMIT_PROMPT_URL} target="_blank" rel="noreferrer">
            <PaperPlaneTilt aria-hidden="true" weight="bold" />
            Submit
          </a>
        </nav>
      </div>
    </footer>
  );
}
