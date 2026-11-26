"use client";

import { ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ShareLinkButton } from "../gallery/RunParts";
import { getModelLabel } from "../registry/evidence";
import type { PublishedGame } from "../registry/schema";
import { getCanonicalPlayPath, getDeploymentEntryUrl } from "../registry/urls";
import { GAME_IFRAME_SANDBOX } from "./sandbox";
import styles from "./GamePlayer.module.css";

type GamePlayerProps = {
  game: PublishedGame;
  onExit?: () => void;
  /** Where "Back" goes when there is no onExit; the benchmark by default. */
  back?: { href: string; label: string };
};

const BENCHMARK = { href: "/", label: "Back to benchmark" };

export function GamePlayer({
  game,
  onExit,
  back = BENCHMARK,
}: GamePlayerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const canonicalPath = getCanonicalPlayPath(game);

  useEffect(() => {
    const frame = requestAnimationFrame(() => frameRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [game.id]);

  return (
    <main className={styles.shell} data-fullscreen-game>
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
      <div className={styles.bar}>
        {onExit ? (
          <button type="button" onClick={onExit}>
            <ArrowLeft aria-hidden="true" weight="bold" />
            Back to benchmark
          </button>
        ) : (
          <Link href={back.href}>
            <ArrowLeft aria-hidden="true" weight="bold" />
            {back.label}
          </Link>
        )}
        <span>
          <strong>{game.title}</strong>
          <i aria-hidden="true" />
          {getModelLabel(game)}
        </span>
        <div className={styles.actions}>
          <ShareLinkButton game={game} label="Share" />
          <Link href={canonicalPath} target="_blank" rel="noreferrer">
            Open full screen
            <ArrowSquareOut aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}
