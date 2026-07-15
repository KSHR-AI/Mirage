"use client";

import { Play } from "lucide-react";
import styles from "./Hud.module.css";
import type { MirageIntroOverlayProps } from "./types";

export function MirageIntroOverlay({
  visible = true,
  ready = true,
  contractBrief = "Take the coupe down the SoMa arterial and make the garage drop.",
  contractTitle = "Hot Ride",
  onStart,
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
        <span>SAN FRANCISCO / BAY CITY</span>
      </header>

      <div className={styles.introContent}>
        <p className={styles.introKicker}>One car. One clean drop.</p>
        <h1 id="mirage-intro-title">MIRAGE</h1>
        <h2>{contractTitle}</h2>
        <p className={styles.introBrief}>{contractBrief}</p>

        <div className={styles.introActions}>
          <button
            className={styles.primaryAction}
            disabled={!ready}
            onClick={onStart}
            type="button"
          >
            <Play aria-hidden="true" fill="currentColor" size={18} />
            {ready ? "Play" : "Preparing city"}
          </button>
        </div>
      </div>

      <footer className={styles.introFooter}>
        <span>BAY CITY</span>
        <span>DAY SHIFT</span>
      </footer>
    </section>
  );
}
