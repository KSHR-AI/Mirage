"use client";

import { CornersOut, Play, Stop } from "@phosphor-icons/react";
import { useRef, useState, type ReactNode } from "react";
import { GAME_IFRAME_SANDBOX } from "./sandbox";
import styles from "./InlinePlayer.module.css";

export type InlineGame = {
  title: string;
  /** The deployment's entry URL, already marked as a Mirage embed. */
  entryUrl: string;
  coverUrl: string | null;
  protocolVersion: number;
};

/**
 * A run that plays where its cover sits. The frame loads only once the player
 * starts it, under the same sandbox as the full-page player.
 */
export function InlinePlayer({
  game,
  playing,
  onPlay,
  onStop,
  startLabel,
  actions,
}: {
  game: InlineGame;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  startLabel: string;
  /** Extra controls shown beside Stop and Full screen. */
  actions?: ReactNode;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className={styles.player}>
      <div className={styles.stage} data-playing={playing ? "true" : undefined}>
        {game.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.cover}
            src={game.coverUrl}
            alt=""
            referrerPolicy="no-referrer"
          />
        ) : null}
        {playing ? <LiveFrame game={game} frameRef={frameRef} /> : null}
        <button
          type="button"
          className={styles.start}
          onClick={onPlay}
          disabled={playing}
          aria-label={`${startLabel}: ${game.title}`}
        >
          <span>
            <Play aria-hidden="true" weight="fill" />
            {startLabel}
          </span>
        </button>
      </div>
      <div
        className={styles.tools}
        data-open={playing || actions ? "true" : undefined}
      >
        <div>
          <div className={styles.toolRow}>
            {playing ? (
              <>
                <button type="button" onClick={onStop}>
                  <Stop aria-hidden="true" weight="fill" />
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => void frameRef.current?.requestFullscreen?.()}
                >
                  <CornersOut aria-hidden="true" />
                  Full screen
                </button>
              </>
            ) : null}
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mounted only while playing, so each start begins from a fresh load. */
function LiveFrame({
  game,
  frameRef,
}: {
  game: InlineGame;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <iframe
        ref={frameRef}
        className={styles.frame}
        data-loaded={loaded ? "true" : undefined}
        src={game.entryUrl}
        title={`${game.title}, a MirageML Bench GTA-in-San-Francisco attempt`}
        sandbox={GAME_IFRAME_SANDBOX}
        allow="fullscreen; gamepad"
        allowFullScreen
        referrerPolicy="no-referrer"
        data-mirage-protocol-version={game.protocolVersion}
        tabIndex={0}
        onLoad={() => {
          setLoaded(true);
          frameRef.current?.focus();
        }}
      />
      {loaded ? null : (
        <p className={styles.loading} role="status">
          Loading verified deployment…
        </p>
      )}
    </>
  );
}
