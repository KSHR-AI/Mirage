"use client";

import { ArrowUpRight, Check, Copy } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { fillSubmitPrompt } from "../registry/submit-prompt";
import { AGENT_PROMPT_URL, SUBMIT_PROMPT_URL } from "../site/links";
import { copyText } from "./clipboard";
import styles from "./SubmitSection.module.css";

type Feedback = { tone: "ok" | "warn"; text: string } | null;

/** Builds the agent prompt around a contributor's link; nothing is sent. */
export function SubmitSection({ prompt }: { prompt: string | null }) {
  const [link, setLink] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);

  const filled = prompt && link.trim() ? fillSubmitPrompt(prompt, link) : null;
  const invalid = link.trim() !== "" && filled === null;

  const copy = async () => {
    if (!prompt) return;
    if (invalid) {
      setFeedback({
        tone: "warn",
        text: "Use the public HTTPS link that opens the game directly, with no ? or #.",
      });
      return;
    }
    if (!(await copyText(filled ?? prompt))) {
      setFeedback({
        tone: "warn",
        text: "Copy failed. Select the prompt below instead.",
      });
      return;
    }
    setCopied(true);
    setFeedback({
      tone: "ok",
      text: filled
        ? "Copied with your link. Paste it into your coding agent."
        : "Copied. Replace PASTE_YOUR_GAME_LINK with your link.",
    });
  };

  return (
    <section
      className={styles.section}
      id="submit"
      aria-labelledby="submit-title"
    >
      <div className={styles.lead}>
        <p className={styles.eyebrow}>Submit a run</p>
        <h2 id="submit-title">Hand your agent a link</h2>
        <p>
          Paste the link to your hosted game. A coding agent with a browser
          plays it and opens the pull request.
        </p>
        <a href={AGENT_PROMPT_URL} target="_blank" rel="noreferrer">
          No game yet? Get the prompt that builds one
          <ArrowUpRight aria-hidden="true" weight="bold" />
        </a>
      </div>

      <div className={styles.form}>
        {prompt ? (
          <>
            <label htmlFor="play-url">Your game link</label>
            <div className={styles.field}>
              <input
                id="play-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://you.github.io/your-game/"
                value={link}
                aria-invalid={invalid}
                aria-describedby="play-url-feedback"
                onChange={(event) => {
                  setLink(event.target.value);
                  setFeedback(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void copy();
                  }
                }}
              />
              <button
                type="button"
                data-copied={copied ? "true" : undefined}
                onClick={() => void copy()}
              >
                {copied ? (
                  <Check aria-hidden="true" weight="bold" />
                ) : (
                  <Copy aria-hidden="true" weight="bold" />
                )}
                {copied ? "Copied" : "Copy agent prompt"}
              </button>
            </div>
            <p
              id="play-url-feedback"
              className={styles.feedback}
              data-tone={feedback?.tone}
              role="status"
            >
              {feedback?.text}
            </p>
            <pre
              className={styles.prompt}
              tabIndex={0}
              aria-label="Agent prompt"
            >
              {filled ?? prompt}
            </pre>
          </>
        ) : (
          <a
            className={styles.fallback}
            href={SUBMIT_PROMPT_URL}
            target="_blank"
            rel="noreferrer"
          >
            Get the agent prompt on GitHub
            <ArrowUpRight aria-hidden="true" weight="bold" />
          </a>
        )}
      </div>
    </section>
  );
}
