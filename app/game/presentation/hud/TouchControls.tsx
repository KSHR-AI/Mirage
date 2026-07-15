"use client";

import {
  CarFront,
  CircleStop,
  Crosshair,
  Footprints,
  Gauge,
  Hand,
  LogOut,
  Move,
  MoveUp,
  Target,
} from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import styles from "./Hud.module.css";
import type { TouchControlsProps, TouchVector } from "./types";

const ZERO_VECTOR: TouchVector = [0, 0];

function ControlStick({
  label,
  disabled,
  icon,
  className,
  onChange,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly icon: ReactNode;
  readonly className: string;
  readonly onChange: (vector: TouchVector) => void;
}) {
  const activePointer = useRef<number | null>(null);
  const [position, setPosition] = useState<TouchVector>(ZERO_VECTOR);

  const update = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.38);
      const rawX = event.clientX - (rect.left + rect.width / 2);
      const rawY = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(rawX, rawY);
      const scale = distance > radius ? radius / distance : 1;
      const vector = [
        (rawX * scale) / radius,
        -(rawY * scale) / radius,
      ] as const;
      setPosition(vector);
      onChange(vector);
    },
    [onChange],
  );

  const release = useCallback(
    (event?: PointerEvent<HTMLButtonElement>) => {
      if (event && activePointer.current !== event.pointerId) return;
      activePointer.current = null;
      setPosition(ZERO_VECTOR);
      onChange(ZERO_VECTOR);
    },
    [onChange],
  );

  return (
    <button
      aria-label={label}
      className={`${styles.controlStick} ${className}`}
      disabled={disabled}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={release}
      onPointerDown={(event) => {
        event.preventDefault();
        activePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => {
        if (activePointer.current === event.pointerId) update(event);
      }}
      onPointerUp={release}
      style={
        {
          "--stick-x": `${position[0] * 24}px`,
          "--stick-y": `${-position[1] * 24}px`,
        } as React.CSSProperties
      }
      title={label}
      type="button"
    >
      <span className={styles.stickGuide}>{icon}</span>
      <span className={styles.stickKnob} />
    </button>
  );
}

function HoldButton({
  label,
  disabled,
  icon,
  action,
  onPressedChange,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly icon: ReactNode;
  readonly action: string;
  readonly onPressedChange: (pressed: boolean) => void;
}) {
  const [pressed, setPressed] = useState(false);

  const updatePressed = useCallback(
    (nextPressed: boolean) => {
      setPressed(nextPressed);
      onPressedChange(nextPressed);
    },
    [onPressedChange],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      updatePressed(true);
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      updatePressed(false);
    }
  };

  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={styles.touchAction}
      data-action={action}
      disabled={disabled}
      onBlur={() => {
        if (pressed) updatePressed(false);
      }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onPointerCancel={() => updatePressed(false)}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        updatePressed(true);
      }}
      onPointerUp={() => updatePressed(false)}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}

export function TouchControls({
  mode,
  drivingOnly = false,
  disabled = false,
  interactionAvailable = true,
  onMove,
  onLook,
  onInteract,
  onEnterExit,
  onFireChange,
  onAimChange,
  onSprintBoostChange,
  onBrakeJumpChange,
  className,
}: TouchControlsProps) {
  return (
    <div
      aria-label="Touch game controls"
      className={[styles.touchControls, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      data-mode={mode}
    >
      <ControlStick
        className={styles.moveStick}
        disabled={disabled}
        icon={<Move aria-hidden="true" size={17} />}
        label="Move"
        onChange={onMove}
      />
      {!drivingOnly ? (
        <ControlStick
          className={styles.lookStick}
          disabled={disabled}
          icon={<Crosshair aria-hidden="true" size={17} />}
          label="Look"
          onChange={onLook}
        />
      ) : null}

      <div className={styles.touchActionGrid} data-driving-only={drivingOnly}>
        {!drivingOnly ? (
          <>
            <button
              aria-label="Interact"
              className={styles.touchAction}
              data-action="interact"
              disabled={disabled || !interactionAvailable}
              onClick={onInteract}
              title="Interact"
              type="button"
            >
              <Hand aria-hidden="true" size={21} />
            </button>
            <button
              aria-label={mode === "vehicle" ? "Exit vehicle" : "Enter vehicle"}
              className={styles.touchAction}
              data-action="vehicle"
              disabled={disabled}
              onClick={onEnterExit}
              title={mode === "vehicle" ? "Exit vehicle" : "Enter vehicle"}
              type="button"
            >
              {mode === "vehicle" ? (
                <LogOut aria-hidden="true" size={21} />
              ) : (
                <CarFront aria-hidden="true" size={21} />
              )}
            </button>
            <HoldButton
              action="fire"
              disabled={disabled}
              icon={<Crosshair aria-hidden="true" size={22} />}
              label="Fire"
              onPressedChange={onFireChange}
            />
            <HoldButton
              action="aim"
              disabled={disabled}
              icon={<Target aria-hidden="true" size={21} />}
              label="Aim"
              onPressedChange={onAimChange}
            />
          </>
        ) : null}
        <HoldButton
          action="sprint"
          disabled={disabled}
          icon={
            mode === "vehicle" ? (
              <Gauge aria-hidden="true" size={21} />
            ) : (
              <Footprints aria-hidden="true" size={21} />
            )
          }
          label={mode === "vehicle" ? "Boost" : "Sprint"}
          onPressedChange={onSprintBoostChange}
        />
        <HoldButton
          action="brake"
          disabled={disabled}
          icon={
            mode === "vehicle" ? (
              <CircleStop aria-hidden="true" size={21} />
            ) : (
              <MoveUp aria-hidden="true" size={21} />
            )
          }
          label={mode === "vehicle" ? "Brake" : "Jump"}
          onPressedChange={onBrakeJumpChange}
        />
      </div>
    </div>
  );
}
