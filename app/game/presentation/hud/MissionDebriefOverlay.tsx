"use client";

import { Check, ChevronRight, Clock3, RotateCcw, Trophy } from "lucide-react";
import { formatCash, formatElapsedTicks } from "./format";
import styles from "./Hud.module.css";
import type { MissionDebriefOverlayProps } from "./types";

export function MissionDebriefOverlay({
  visible,
  rank,
  elapsedTicks,
  earnedCash,
  optionalCompleted,
  optionalTotal,
  completionHeading = "Afterlight delivered.",
  completionSubhead = "Marin safehouse / Signal clear",
  stats = [],
  masteryLabel,
  unlockLabel,
  isPersonalBest = false,
  onReplay,
  onContinue,
}: MissionDebriefOverlayProps) {
  if (!visible) return null;

  return (
    <section
      aria-labelledby="afterlight-debrief-title"
      aria-modal="true"
      className={styles.debriefOverlay}
      role="dialog"
    >
      <header className={styles.debriefHeader}>
        <p>MIRAGE / JOB COMPLETE</p>
        <h2 id="afterlight-debrief-title">{completionHeading}</h2>
        <span>{completionSubhead}</span>
      </header>

      <div
        aria-label={`Mission rank ${rank}`}
        className={styles.rank}
        data-rank={rank}
      >
        <span>RANK</span>
        <strong>{rank}</strong>
        {isPersonalBest ? <small>PERSONAL BEST</small> : null}
      </div>

      <div className={styles.debriefResults}>
        <div>
          <Clock3 aria-hidden="true" size={16} />
          <span>TIME</span>
          <strong>{formatElapsedTicks(elapsedTicks)}</strong>
        </div>
        <div>
          <Trophy aria-hidden="true" size={16} />
          <span>TAKE</span>
          <strong>{formatCash(earnedCash)}</strong>
        </div>
        <div>
          <Check aria-hidden="true" size={16} />
          <span>OPTIONAL</span>
          <strong>
            {optionalCompleted}/{optionalTotal}
          </strong>
        </div>
      </div>

      {stats.length > 0 ? (
        <dl className={styles.debriefStats}>
          {stats.map((stat) => (
            <div data-emphasis={Boolean(stat.emphasis)} key={stat.id}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {unlockLabel ? (
        <p className={styles.unlockNotice}>
          <span>UNLOCKED</span>
          <strong>{unlockLabel}</strong>
        </p>
      ) : null}

      {masteryLabel ? (
        <p className={styles.masteryNotice}>
          <span>ROUTE MASTERED</span>
          <strong>{masteryLabel}</strong>
        </p>
      ) : null}

      <div className={styles.debriefActions}>
        <button
          className={styles.secondaryAction}
          onClick={onReplay}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={17} />
          Replay job
        </button>
        <button
          className={styles.primaryAction}
          onClick={onContinue}
          type="button"
        >
          Continue in Bay City
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>
    </section>
  );
}
