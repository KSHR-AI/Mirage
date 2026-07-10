"use client";

import { Check, Play, RotateCcw, Skull } from "lucide-react";
import styles from "./Hud.module.css";
import type { DeathCheckpointOverlayProps } from "./types";

export function DeathCheckpointOverlay({
  visible,
  mode,
  checkpointLabel,
  countdownSeconds,
  onRetry,
  onContinue,
}: DeathCheckpointOverlayProps) {
  if (!visible) return null;

  if (mode === "checkpoint") {
    return (
      <section aria-live="polite" className={styles.checkpointBanner}>
        <span className={styles.checkpointIcon}>
          <Check aria-hidden="true" size={18} strokeWidth={3} />
        </span>
        <span>
          <small>CHECKPOINT SECURED</small>
          <strong>{checkpointLabel}</strong>
        </span>
        {onContinue ? (
          <button
            aria-label="Continue"
            onClick={onContinue}
            title="Continue"
            type="button"
          >
            <Play aria-hidden="true" fill="currentColor" size={16} />
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="signal-lost-title"
      aria-modal="true"
      className={styles.deathOverlay}
      role="dialog"
    >
      <Skull
        aria-hidden="true"
        className={styles.deathIcon}
        size={30}
        strokeWidth={1.5}
      />
      <p>MIRAGE / SIGNAL LOST</p>
      <h2 id="signal-lost-title">Runner down.</h2>
      <span className={styles.deathCheckpoint}>
        Resume from <strong>{checkpointLabel}</strong>
      </span>
      {countdownSeconds !== undefined ? (
        <span aria-live="polite" className={styles.deathCountdown}>
          Link recovery in {Math.max(0, Math.ceil(countdownSeconds))}
        </span>
      ) : null}
      {onRetry ? (
        <button
          className={styles.primaryAction}
          onClick={onRetry}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={17} />
          Retry checkpoint
        </button>
      ) : null}
    </section>
  );
}
