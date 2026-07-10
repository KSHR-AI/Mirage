"use client";

import {
  Activity,
  Flag,
  Gauge,
  LogOut,
  Play,
  RotateCcw,
  Volume2,
} from "lucide-react";
import styles from "./Hud.module.css";
import type {
  AfterlightSettingsProps,
  HudQuality,
  PauseMenuProps,
} from "./types";

const QUALITY_OPTIONS: readonly HudQuality[] = ["low", "medium", "high"];

function ToggleRow({
  checked,
  icon,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <div className={styles.settingRow}>
      <span className={styles.settingIcon}>{icon}</span>
      <span className={styles.settingCopy}>
        <strong>{label}</strong>
      </span>
      <button
        aria-checked={checked}
        aria-label={`${label}: ${checked ? "on" : "off"}`}
        className={styles.switch}
        data-on={checked}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span />
      </button>
    </div>
  );
}

export function AfterlightSettings({
  value,
  onMutedChange,
  onReducedMotionChange,
  onQualityChange,
}: AfterlightSettingsProps) {
  return (
    <section
      aria-labelledby="afterlight-settings-title"
      className={styles.settings}
    >
      <div className={styles.sectionHeading}>
        <span>02</span>
        <h3 id="afterlight-settings-title">Settings</h3>
      </div>
      <ToggleRow
        checked={value.muted}
        icon={<Volume2 aria-hidden="true" size={17} />}
        label="Mute audio"
        onChange={onMutedChange}
      />
      <ToggleRow
        checked={value.reducedMotion}
        icon={<Activity aria-hidden="true" size={17} />}
        label="Reduced motion"
        onChange={onReducedMotionChange}
      />
      <div className={styles.settingRow}>
        <span className={styles.settingIcon}>
          <Gauge aria-hidden="true" size={17} />
        </span>
        <span className={styles.settingCopy}>
          <strong>Graphics quality</strong>
        </span>
        <div
          aria-label="Graphics quality"
          className={styles.segmented}
          role="group"
        >
          {QUALITY_OPTIONS.map((quality) => (
            <button
              aria-pressed={value.quality === quality}
              data-active={value.quality === quality}
              key={quality}
              onClick={() => onQualityChange(quality)}
              type="button"
            >
              {quality}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PauseMenu({
  open,
  checkpointLabel = "Last checkpoint",
  value,
  onResume,
  onRestartCheckpoint,
  onRestartMission,
  onQuit,
  onMutedChange,
  onReducedMotionChange,
  onQualityChange,
}: PauseMenuProps) {
  if (!open) return null;

  return (
    <section
      aria-labelledby="afterlight-pause-title"
      aria-modal="true"
      className={styles.pauseOverlay}
      role="dialog"
    >
      <div className={styles.pausePanel}>
        <header className={styles.pauseHeader}>
          <p>MIRAGE / AFTERLIGHT</p>
          <h2 id="afterlight-pause-title">Paused</h2>
          <span>{checkpointLabel}</span>
        </header>

        <nav aria-label="Pause menu" className={styles.pauseActions}>
          <button
            className={styles.pausePrimary}
            onClick={onResume}
            type="button"
          >
            <Play aria-hidden="true" fill="currentColor" size={17} />
            Resume
          </button>
          <button onClick={onRestartCheckpoint} type="button">
            <RotateCcw aria-hidden="true" size={17} />
            Restart checkpoint
          </button>
          <button onClick={onRestartMission} type="button">
            <Flag aria-hidden="true" size={17} />
            Restart job
          </button>
          {onQuit ? (
            <button onClick={onQuit} type="button">
              <LogOut aria-hidden="true" size={17} />
              Exit to title
            </button>
          ) : null}
        </nav>

        <AfterlightSettings
          onMutedChange={onMutedChange}
          onQualityChange={onQualityChange}
          onReducedMotionChange={onReducedMotionChange}
          value={value}
        />
      </div>

      <span aria-hidden="true" className={styles.pauseIndex}>
        01 / SYSTEM
      </span>
    </section>
  );
}
