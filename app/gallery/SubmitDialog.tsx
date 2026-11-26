"use client";

import { ArrowUpRight, Check, Copy, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { fillSubmitPrompt } from "../registry/submit-prompt";
import { AGENT_PROMPT_URL, SUBMIT_PROMPT_URL } from "../site/links";
import { copyText } from "./clipboard";
import styles from "./SubmitDialog.module.css";

/** Any link to this fragment opens the dialog, on this page or from another. */
export const SUBMIT_HASH = "#submit";

type Feedback = { tone: "ok" | "warn"; text: string } | null;

/** Builds the agent prompt around a contributor's link; nothing is sent. */
export function SubmitDialog({ prompt }: { prompt: string | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const openForHash = () => {
      const dialog = dialogRef.current;
      if (dialog && !dialog.open && window.location.hash === SUBMIT_HASH) {
        dialog.showModal();
        dialog.querySelector("input")?.focus();
      }
    };
    openForHash();
    window.addEventListener("hashchange", openForHash);
    return () => window.removeEventListener("hashchange", openForHash);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);

  // Clearing the fragment lets the same link open the dialog again.
  const handleClose = () => {
    if (window.location.hash === SUBMIT_HASH) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  };

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
    <dialog
      data-theme="dark"
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="submit-title"
      onClose={handleClose}
      onClick={(event) => {
        // The dialog's own box is all padding-free content, so a click that
        // lands on the element itself landed on the backdrop.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className={styles.body}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Submit a run</p>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" weight="bold" />
          </button>
        </header>

        <h2 id="submit-title">Hand your agent a link</h2>
        <p className={styles.lede}>
          Paste the link to your hosted game. A coding agent with a browser
          plays it and opens the pull request.
        </p>

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
              <button type="button" onClick={() => void copy()}>
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

        <a
          className={styles.aside}
          href={AGENT_PROMPT_URL}
          target="_blank"
          rel="noreferrer"
        >
          No game yet? Get the prompt that builds one
          <ArrowUpRight aria-hidden="true" weight="bold" />
        </a>
      </div>
    </dialog>
  );
}
