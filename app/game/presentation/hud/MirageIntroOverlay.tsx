"use client";

import { Play } from "lucide-react";
import styles from "./Hud.module.css";
import type { MirageIntroOverlayProps } from "./types";

export function MirageIntroOverlay({
  visible = true,
  canContinue = false,
  onStart,
  onContinue,
}: MirageIntroOverlayProps) {
  if (!visible) return null;

  return (
    <section
      aria-labelledby="mirage-intro-title"
      aria-modal="true"
      className={styles.introOverlay}
      role="dialog"
    >
      <header className={styles.introHeader}>
        <span>WORLD 01</span>
        <span>SAN FRANCISCO / AFTERLIGHT</span>
      </header>

      <div className={styles.introContent}>
        <p className={styles.introKicker}>A playable city heist</p>
        <h1 id="mirage-intro-title">MIRAGE</h1>
        <h2>THE AFTERLIGHT JOB</h2>
        <p className={styles.introBrief}>
          Steal the core. Kill the grid. Break the response across the bridge.
        </p>

        <div className={styles.introActions}>
          <button
            className={styles.primaryAction}
            onClick={onStart}
            type="button"
          >
            <Play aria-hidden="true" fill="currentColor" size={18} />
            Start the job
          </button>
          {canContinue && onContinue ? (
            <button
              className={styles.secondaryAction}
              onClick={onContinue}
              type="button"
            >
              Continue checkpoint
            </button>
          ) : null}
        </div>
      </div>

      <footer className={styles.introFooter}>
        <span>LIVE SIMULATION</span>
        <span>M / 001</span>
      </footer>
    </section>
  );
}
