"use client";

import {
  CarFront,
  Check,
  Crosshair,
  HeartPulse,
  MapPin,
  Navigation,
  Pause,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  calculateMapRoadLayout,
  clampPercent,
  formatCash,
  formatObjectiveProgress,
  formatSpeed,
  mapPointToPercent,
  summarizeObjectives,
} from "./format";
import styles from "./Hud.module.css";
import type { AfterlightHudProps, HudMinimap, HudNotification } from "./types";

type HudStyle = CSSProperties & Record<`--${string}`, string | number>;

function Meter({
  icon,
  label,
  value,
  maximum,
  tone,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: number;
  readonly maximum: number;
  readonly tone: "health" | "vehicle" | "reload";
}) {
  const percentage = clampPercent(value, maximum);

  return (
    <div className={styles.meterGroup} data-tone={tone}>
      <div className={styles.meterLabel}>
        <span>
          {icon}
          {label}
        </span>
        <strong>{Math.round(Math.max(0, value))}</strong>
      </div>
      <div
        aria-label={`${label}: ${Math.round(percentage)} percent`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(percentage)}
        className={styles.meterTrack}
        role="progressbar"
      >
        <span style={{ "--meter-value": `${percentage}%` } as HudStyle} />
      </div>
    </div>
  );
}

function WantedIndicator({ level }: { readonly level: 0 | 1 | 2 | 3 }) {
  return (
    <div
      aria-label={
        level === 0
          ? "No active police response"
          : `Police response level ${level}`
      }
      className={styles.wanted}
      data-active={level > 0}
    >
      <ShieldAlert aria-hidden="true" size={16} strokeWidth={2.25} />
      <span className={styles.wantedLabel}>
        {level > 0 ? "RESPONSE" : "CLEAR"}
      </span>
      <span aria-hidden="true" className={styles.wantedBars}>
        {[1, 2, 3].map((step) => (
          <i data-lit={step <= level} key={step} />
        ))}
      </span>
    </div>
  );
}

function MiniMap({
  map,
  location,
}: {
  readonly map: HudMinimap;
  readonly location: string;
}) {
  const player = mapPointToPercent(map.player);
  const target = map.target ? mapPointToPercent(map.target) : undefined;
  const police = map.police ?? [];
  const targetLabel = map.target?.label ?? "mission target";

  return (
    <section
      aria-label={`Route map for ${map.district ?? location}. ${map.target ? `Target: ${targetLabel}.` : "No active target."}`}
      className={styles.minimap}
    >
      <div aria-hidden="true" className={styles.mapGrid} />
      <div aria-hidden="true" className={styles.mapCoast} />
      {(map.roads ?? []).map((road) => {
        const layout = calculateMapRoadLayout(road.from, road.to);
        const roadStyle = {
          "--road-left": `${layout.left}%`,
          "--road-top": `${layout.top}%`,
          "--road-width": `${layout.width}%`,
          "--road-angle": `${layout.rotationDegrees}deg`,
        } as HudStyle;

        return (
          <span
            aria-hidden="true"
            className={styles.mapRoad}
            data-kind={road.kind ?? "street"}
            key={road.id}
            style={roadStyle}
          />
        );
      })}
      {target ? (
        <span
          aria-hidden="true"
          className={styles.mapTarget}
          style={{ left: `${target.x}%`, top: `${target.y}%` }}
        >
          <MapPin size={14} strokeWidth={2.5} />
        </span>
      ) : null}
      {police.map((blip) => {
        const point = mapPointToPercent(blip);
        return (
          <span
            aria-hidden="true"
            className={styles.mapPolice}
            key={blip.id}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          />
        );
      })}
      <span
        aria-hidden="true"
        className={styles.mapPlayer}
        style={
          {
            left: `${player.x}%`,
            top: `${player.y}%`,
            "--player-heading": `${map.headingDegrees}deg`,
          } as HudStyle
        }
      >
        <Navigation fill="currentColor" size={14} strokeWidth={2.5} />
      </span>
      <span aria-hidden="true" className={styles.mapNorth}>
        N
      </span>
      <span className={styles.mapDistrict}>{map.district ?? location}</span>
    </section>
  );
}

function NotificationStack({
  notifications,
}: {
  readonly notifications: readonly HudNotification[];
}) {
  return (
    <div
      aria-atomic="false"
      aria-live="polite"
      className={styles.notifications}
    >
      {notifications.slice(-3).map((notification) => (
        <div
          className={styles.notification}
          data-tone={notification.tone ?? "neutral"}
          key={notification.id}
        >
          <strong>{notification.title}</strong>
          {notification.detail ? <span>{notification.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function AfterlightHud({
  mission,
  cash,
  health,
  maxHealth = 100,
  vehicle,
  weapon,
  wantedLevel,
  speedKph,
  location,
  minimap,
  notifications = [],
  muted = false,
  touchControlsVisible = false,
  onPause,
  onToggleMute,
  className,
}: AfterlightHudProps) {
  const objectiveSummary = summarizeObjectives(mission.objectives);
  const chapterProgress = clampPercent(
    mission.chapterIndex + 1,
    mission.chapterCount,
  );
  const reloadProgress = clampPercent(weapon.reloadProgress ?? 0, 1);
  const rootClassName = [
    styles.hudRoot,
    touchControlsVisible ? styles.hudWithTouch : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div aria-label="Afterlight mission HUD" className={rootClassName}>
      <header className={styles.topRail}>
        <div className={styles.brandLockup}>
          <strong>MIRAGE</strong>
          <span>Afterlight / Live</span>
        </div>

        <WantedIndicator level={wantedLevel} />

        <div className={styles.topStatus}>
          <div className={styles.cash}>
            <span>TAKE</span>
            <strong>{formatCash(cash)}</strong>
          </div>
          {onToggleMute ? (
            <button
              aria-label={muted ? "Unmute game audio" : "Mute game audio"}
              className={styles.iconButton}
              onClick={onToggleMute}
              title={muted ? "Unmute" : "Mute"}
              type="button"
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
          ) : null}
          {onPause ? (
            <button
              aria-label="Pause game"
              className={styles.iconButton}
              onClick={onPause}
              title="Pause"
              type="button"
            >
              <Pause size={17} />
            </button>
          ) : null}
        </div>
      </header>

      <section aria-live="polite" className={styles.missionPanel}>
        <div className={styles.missionEyebrow}>
          <span>
            CH{" "}
            {Math.min(mission.chapterCount, mission.chapterIndex + 1)
              .toString()
              .padStart(2, "0")}
            /{mission.chapterCount.toString().padStart(2, "0")}
          </span>
          <span>{mission.location}</span>
        </div>
        <p className={styles.missionTitle}>{mission.title}</p>
        <h2>{mission.chapter}</h2>
        <div
          aria-label={`Chapter progress: ${Math.round(chapterProgress)} percent`}
          className={styles.chapterTrack}
          role="progressbar"
        >
          <span
            style={{ "--chapter-value": `${chapterProgress}%` } as HudStyle}
          />
        </div>
        <ol className={styles.objectiveList}>
          {mission.objectives.map((objective) => {
            const progress = objective.progress;
            return (
              <li
                data-active={Boolean(objective.active)}
                data-complete={objective.completed}
                key={objective.id}
              >
                <span className={styles.objectiveMark}>
                  {objective.completed ? (
                    <Check size={12} strokeWidth={3} />
                  ) : null}
                </span>
                <span className={styles.objectiveCopy}>
                  <span>{objective.label}</span>
                  {objective.optional ? <small>OPTIONAL</small> : null}
                </span>
                {progress ? (
                  <strong>{formatObjectiveProgress(progress)}</strong>
                ) : null}
              </li>
            );
          })}
        </ol>
        <div className={styles.objectiveSummary}>
          <span>
            {objectiveSummary.requiredCompleted}/
            {objectiveSummary.requiredTotal} required
          </span>
          {objectiveSummary.optionalTotal > 0 ? (
            <span>
              {objectiveSummary.optionalCompleted}/
              {objectiveSummary.optionalTotal} optional
            </span>
          ) : null}
        </div>
      </section>

      <NotificationStack notifications={notifications} />

      <footer className={styles.lowerHud}>
        <MiniMap location={location} map={minimap} />

        <div className={styles.vitals}>
          <Meter
            icon={<HeartPulse aria-hidden="true" size={13} />}
            label="Health"
            maximum={maxHealth}
            tone="health"
            value={health}
          />
          {vehicle ? (
            <Meter
              icon={<CarFront aria-hidden="true" size={13} />}
              label={vehicle.name ?? "Vehicle"}
              maximum={vehicle.maxIntegrity ?? 100}
              tone="vehicle"
              value={vehicle.integrity}
            />
          ) : null}
        </div>

        <div className={styles.driveReadout}>
          <div className={styles.locationReadout}>
            <MapPin aria-hidden="true" size={13} />
            <span>{location}</span>
          </div>
          <div className={styles.speedReadout}>
            <strong>{formatSpeed(speedKph)}</strong>
            <span>KM/H</span>
          </div>
        </div>

        <section
          aria-label={`${weapon.name ?? "Signal-9"} ammunition`}
          className={styles.weapon}
        >
          <div className={styles.weaponName}>
            <Crosshair aria-hidden="true" size={14} />
            <span>{weapon.name ?? "SIGNAL-9"}</span>
          </div>
          <div className={styles.ammoCount}>
            <strong>
              {Math.max(0, weapon.magazine).toString().padStart(2, "0")}
            </strong>
            <span>
              / {Math.max(0, weapon.reserve).toString().padStart(3, "0")}
            </span>
          </div>
          <div
            aria-label={
              weapon.reloading
                ? `Reloading: ${Math.round(reloadProgress)} percent`
                : "Weapon ready"
            }
            className={styles.ammoTrack}
            data-reloading={Boolean(weapon.reloading)}
          >
            <span
              style={
                {
                  "--ammo-value": `${
                    weapon.reloading
                      ? reloadProgress
                      : clampPercent(weapon.magazine, weapon.magazineSize)
                  }%`,
                } as HudStyle
              }
            />
          </div>
          {weapon.reloading ? <small>RELOADING</small> : null}
        </section>
      </footer>
    </div>
  );
}
