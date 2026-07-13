"use client";

import { Play } from "lucide-react";
import { formatCash } from "./format";
import styles from "./Hud.module.css";
import type { MirageIntroOverlayProps } from "./types";

export function MirageIntroOverlay({
  visible = true,
  canContinue = false,
  ready = true,
  bankedCash = 0,
  bestRank,
  contractBrief = "Steal the core. Kill the grid. Break the response across the bridge.",
  contractTitle = "The Afterlight Job",
  activeContractId,
  activeOperationId,
  activeLoadoutId = "standard",
  contractOptions = [],
  operationOptions = [],
  loadoutOptions = [],
  onStart,
  onContinue,
  onContractChange,
  onOperationChange,
  onLoadoutChange,
  onLoadoutPurchase,
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
        <h2>{contractTitle}</h2>
        <p className={styles.introBrief}>{contractBrief}</p>

        {contractOptions.length > 1 && onContractChange ? (
          <div className={styles.introContract}>
            <div className={styles.introLoadoutHeader}>
              <span>CONTRACT / JOB</span>
              <span>
                {contractOptions.filter((option) => option.completed).length}/
                {contractOptions.length} CLEARED
              </span>
            </div>
            <div
              aria-label="Contract job"
              className={styles.contractSegments}
              role="radiogroup"
            >
              {contractOptions.map((option) => (
                <button
                  aria-checked={activeContractId === option.id}
                  data-active={activeContractId === option.id}
                  data-completed={option.completed}
                  key={option.id}
                  onClick={() => onContractChange(option.id)}
                  role="radio"
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {operationOptions.length > 1 && onOperationChange ? (
          <div className={styles.introOperation}>
            <div className={styles.introLoadoutHeader}>
              <span>OPERATION / ROUTE</span>
              <span>
                {operationOptions.filter((option) => option.mastered).length}/
                {operationOptions.length} MASTERED
              </span>
            </div>
            <div
              aria-label="Operation route"
              className={styles.operationSegments}
              role="radiogroup"
            >
              {operationOptions.map((option) => (
                <button
                  aria-checked={activeOperationId === option.id}
                  data-active={activeOperationId === option.id}
                  data-mastered={option.mastered}
                  key={option.id}
                  onClick={() => onOperationChange(option.id)}
                  role="radio"
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {loadoutOptions.length > 1 && onLoadoutChange ? (
          <div className={styles.introLoadout}>
            <div className={styles.introLoadoutHeader}>
              <span>GARAGE / LOADOUT</span>
              <span>
                {formatCash(bankedCash)} BANKED
                {bestRank ? ` / BEST ${bestRank}` : ""}
              </span>
            </div>
            <div
              aria-label="Run loadout"
              className={styles.loadoutSegments}
              role="radiogroup"
            >
              {loadoutOptions.map((option) => (
                <button
                  aria-checked={activeLoadoutId === option.id}
                  data-active={activeLoadoutId === option.id}
                  data-status={option.status ?? "owned"}
                  disabled={
                    option.status === "locked" ||
                    option.status === "unaffordable" ||
                    (option.status === "available" && !onLoadoutPurchase)
                  }
                  key={option.id}
                  onClick={() => {
                    if (option.status === "available") {
                      onLoadoutPurchase?.(option.id);
                    } else {
                      onLoadoutChange(option.id);
                    }
                  }}
                  role="radio"
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>
                    {option.status === "available"
                      ? `BUY ${formatCash(option.price ?? 0)} / ${option.description}`
                      : option.status === "locked" ||
                          option.status === "unaffordable"
                        ? `${option.reason ?? "LOCKED"} / ${option.description}`
                        : option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.introActions}>
          <button
            className={styles.primaryAction}
            disabled={!ready}
            onClick={onStart}
            type="button"
          >
            <Play aria-hidden="true" fill="currentColor" size={18} />
            {ready ? "Start contract" : "Preparing city"}
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
