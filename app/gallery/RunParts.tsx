"use client";

import { Check, LinkSimple, XLogo } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { EvidenceState } from "../registry/evidence";
import type { PublishedGame } from "../registry/schema";
import { getPostIntentUrl, getShareText, getShareUrl } from "../registry/share";
import { getPresentationCoverUrl } from "../registry/urls";
import { copyText } from "./clipboard";
import styles from "./RunParts.module.css";

export function GameCover({ game }: { game: PublishedGame }) {
  const coverUrl = getPresentationCoverUrl(game);
  if (!coverUrl) {
    return (
      <div
        className={styles.coverFallback}
        role="img"
        aria-label="No cover image was published"
      >
        <span>{game.id}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.cover}
      src={coverUrl}
      alt={game.presentation.coverAlt}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

const STATE_LABEL: Record<EvidenceState, string> = {
  recorded: "Recorded",
  partial: "Partial",
  missing: "Not recorded",
};

export function EvidenceGlyph({ state }: { state: EvidenceState }) {
  return (
    <span
      className={styles.glyph}
      data-state={state}
      role="img"
      aria-label={STATE_LABEL[state]}
    />
  );
}

type ShareGame = Pick<PublishedGame, "id" | "title" | "model">;

/** Shares the stable play route: the native sheet on touch, a copy elsewhere. */
export function ShareLinkButton({
  game,
  className,
  label = "Copy link",
}: {
  game: ShareGame;
  className?: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2200);
    return () => clearTimeout(timer);
  }, [status]);

  const share = async () => {
    const url = getShareUrl(window.location.origin, game);
    if (
      typeof navigator.share === "function" &&
      window.matchMedia("(pointer: coarse)").matches
    ) {
      try {
        await navigator.share({
          title: `${game.title} — MirageML Bench`,
          text: getShareText(game),
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    setStatus((await copyText(url)) ? "copied" : "failed");
  };

  return (
    <button
      className={className}
      type="button"
      data-share-status={status}
      onClick={() => void share()}
    >
      {status === "copied" ? (
        <Check aria-hidden="true" weight="bold" />
      ) : (
        <LinkSimple aria-hidden="true" weight="bold" />
      )}
      <span aria-live="polite">
        {status === "copied"
          ? "Link copied"
          : status === "failed"
            ? "Copy failed"
            : label}
      </span>
    </button>
  );
}

export function PostButton({
  game,
  className,
}: {
  game: ShareGame;
  className?: string;
}) {
  return (
    <button
      className={className}
      type="button"
      onClick={() =>
        window.open(
          getPostIntentUrl(window.location.origin, game),
          "_blank",
          "noopener,noreferrer",
        )
      }
    >
      <XLogo aria-hidden="true" weight="bold" />
      <span>Post</span>
    </button>
  );
}
