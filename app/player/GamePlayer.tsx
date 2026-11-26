"use client";

import {
  ArrowLeft,
  ArrowRight,
  CornersOut,
  Keyboard,
  Play,
  Scales,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProviderMark } from "../bench/ProviderMark";
import type { ProviderKey } from "../bench/entries";
import { ShareLinkButton } from "../gallery/RunParts";
import type { PublishedGame } from "../registry/schema";
import {
  getDeploymentEntryUrl,
  getPresentationCoverUrl,
} from "../registry/urls";
import { ControlList } from "./ControlList";
import { GAME_IFRAME_SANDBOX } from "./sandbox";
import styles from "./GamePlayer.module.css";

type GamePlayerProps = {
  game: PublishedGame;
  /** The model + harness that built the run, when it is on the leaderboard. */
  builtBy: { label: string; provider: ProviderKey | null };
  /** Where "Back" goes; the leaderboard by default. */
  back?: { href: string; label: string };
};

const LEADERBOARD = { href: "/", label: "Leaderboard" };

export function GamePlayer({
  game,
  builtBy,
  back = LEADERBOARD,
}: GamePlayerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  // The controls card shows before the first frame and on request.
  const [briefing, setBriefing] = useState(true);
  const cover = getPresentationCoverUrl(game);

  function play() {
    setBriefing(false);
    requestAnimationFrame(() => frameRef.current?.focus());
  }

  // "?" reaches this page only while the game does not have focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "?") setBriefing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className={styles.shell} data-fullscreen-game>
      <header className={styles.bar}>
        <div className={styles.identity}>
          <Link href={back.href} className={styles.back}>
            <ArrowLeft aria-hidden="true" weight="bold" />
            {back.label}
          </Link>
          <i aria-hidden="true" />
          <strong>{game.title}</strong>
          <span className={styles.builtBy}>
            {builtBy.provider ? (
              <ProviderMark provider={builtBy.provider} size={16} />
            ) : null}
            {builtBy.label}
          </span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => setBriefing(true)}
            aria-pressed={briefing}
          >
            <Keyboard aria-hidden="true" />
            <span>Controls</span>
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => void frameRef.current?.requestFullscreen?.()}
          >
            <CornersOut aria-hidden="true" />
            <span>Full screen</span>
          </button>
          <ShareLinkButton
            game={game}
            label="Share"
            className={styles.button}
          />
          <Link href={`/runs/${game.id}`} className={styles.button}>
            <span>Details</span>
          </Link>
          <Link href="/arena" className={styles.primary}>
            <Scales aria-hidden="true" weight="bold" />
            <span>Vote in the Arena</span>
          </Link>
        </div>
      </header>

      <div className={styles.stage}>
        <iframe
          ref={frameRef}
          key={game.id}
          className={styles.frame}
          src={getDeploymentEntryUrl(game)}
          title={`${game.title}, a MirageML Bench GTA-in-San-Francisco attempt`}
          sandbox={GAME_IFRAME_SANDBOX}
          allow="fullscreen; gamepad"
          allowFullScreen
          referrerPolicy="no-referrer"
          data-mirage-protocol-version={game.presentation.protocolVersion}
          tabIndex={0}
          onLoad={() => setLoaded(true)}
        />
        <p
          className={styles.loading}
          data-loaded={loaded ? "true" : "false"}
          role="status"
        >
          Loading verified deployment…
        </p>

        {briefing ? (
          <div className={styles.briefing}>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.briefingCover}
                src={cover}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : null}
            <section
              className={styles.card}
              role="dialog"
              aria-modal="true"
              aria-labelledby="briefing-title"
            >
              <p className={styles.kicker}>Before you start</p>
              <h1 id="briefing-title">{game.tagline}</h1>
              <ControlList controls={game.presentation.controls} />
              <button
                type="button"
                className={styles.playButton}
                onClick={play}
                autoFocus
              >
                <Play aria-hidden="true" weight="fill" />
                Click to play
              </button>
              <p className={styles.hint}>
                Open <b>Controls</b> in the top bar to see this again.{" "}
                <Link href={`/runs/${game.id}`}>
                  Run record
                  <ArrowRight aria-hidden="true" />
                </Link>
              </p>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
