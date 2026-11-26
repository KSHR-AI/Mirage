"use client";

import {
  ArrowRight,
  Check,
  CornersOut,
  Equals,
  Play,
  Trophy,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ProviderMark } from "../bench/ProviderMark";
import type { ProviderKey } from "../bench/entries";
import { ControlList } from "../player/ControlList";
import { GAME_IFRAME_SANDBOX } from "../player/sandbox";
import type { Outcome } from "./elo";
import styles from "./Arena.module.css";

export type ArenaSide = {
  runId: string;
  title: string;
  label: string;
  provider: ProviderKey;
  entryUrl: string;
  coverUrl: string | null;
  controls: readonly string[];
  protocolVersion: number;
};

type Result = { before: number; after: number };

type State =
  | { kind: "idle" }
  | { kind: "sending"; outcome: Outcome }
  | { kind: "done"; outcome: Outcome; a: Result; b: Result }
  | { kind: "error"; message: string; final: boolean };

const ERRORS: Record<string, { message: string; final: boolean }> = {
  "too-soon": {
    message: "Give both games a proper look first, then vote.",
    final: false,
  },
  "already-voted": {
    message: "You have already voted on this pair. Try the next pair.",
    final: true,
  },
  "rate-limited": {
    message: "That is a lot of votes for one hour. Come back a little later.",
    final: true,
  },
  expired: {
    message: "This matchup has expired. Load a fresh one.",
    final: true,
  },
};

const NAMES = ["A", "B"] as const;
const SHORT_CONTROLS = 3;

function formatDelta(result: Result) {
  const delta = Math.round(result.after) - Math.round(result.before);
  return `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}`;
}

/**
 * Both runs of a matchup, played in place one at a time, and the vote, which
 * opens once each has been played. `token` is null while voting is closed.
 */
export function ArenaMatch({
  sides,
  token,
  closedNotice,
  minViewMs,
}: {
  sides: readonly [ArenaSide, ArenaSide];
  token: string | null;
  closedNotice: string;
  minViewMs: number;
}) {
  const router = useRouter();
  const [active, setActive] = useState<0 | 1 | null>(null);
  const [played, setPlayed] = useState<readonly [boolean, boolean]>([
    false,
    false,
  ]);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [ready, setReady] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  // The page keys this component by matchup, so a new pair starts fresh.
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), minViewMs);
    return () => window.clearTimeout(timer);
  }, [minViewMs]);

  function start(index: 0 | 1) {
    setActive(index);
    setPlayed((current) =>
      index === 0 ? [true, current[1]] : [current[0], true],
    );
  }

  async function vote(outcome: Outcome) {
    if (!token) return;
    setActive(null);
    setState({ kind: "sending", outcome });
    try {
      const response = await fetch("/api/arena/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          a: sides[0].runId,
          b: sides[1].runId,
          outcome,
          token,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        a?: Result;
        b?: Result;
      } | null;
      if (response.ok && body?.ok && body.a && body.b) {
        setState({ kind: "done", outcome, a: body.a, b: body.b });
        return;
      }
      const known = body?.error ? ERRORS[body.error] : undefined;
      setState({
        kind: "error",
        message: known?.message ?? "Your vote could not be recorded.",
        final: known?.final ?? false,
      });
    } catch {
      setState({
        kind: "error",
        message: "Your vote could not be sent. Check your connection.",
        final: false,
      });
    }
  }

  function next() {
    // A bare /arena picks a fresh pair and redirects to its URL.
    startRefresh(() => router.replace("/arena"));
  }

  const bothPlayed = played[0] && played[1];
  const locked =
    !token ||
    state.kind === "sending" ||
    state.kind === "done" ||
    (state.kind === "error" && state.final);
  const canVote = !locked && bothPlayed && ready;

  return (
    <>
      <div className={styles.matchup}>
        {sides.map((side, i) => (
          <ArenaCard
            key={side.runId}
            side={side}
            name={NAMES[i]}
            other={NAMES[1 - i]}
            active={active === i}
            otherActive={active === 1 - i}
            played={played[i]}
            onPlay={() => start(i as 0 | 1)}
          />
        ))}
      </div>

      {state.kind === "done" ? (
        <section className={styles.reveal} aria-labelledby="arena-vote-title">
          <div className={styles.revealHead}>
            <div>
              <h2 id="arena-vote-title">
                {state.outcome === "tie"
                  ? "You called it a tie."
                  : `You voted for Run ${state.outcome === "a" ? "A" : "B"}.`}{" "}
                Here is who built each run.
              </h2>
              <p>Both ratings moved with your vote.</p>
            </div>
            <div className={styles.revealActions}>
              <Link href="/#leaderboard" className={styles.secondaryButton}>
                See the leaderboard
              </Link>
              <button
                type="button"
                className={styles.nextButton}
                onClick={next}
                disabled={refreshing}
              >
                {refreshing ? "Loading…" : "Next pair"}
                <ArrowRight aria-hidden="true" weight="bold" />
              </button>
            </div>
          </div>
          <ul className={styles.revealList}>
            {sides.map((side, i) => {
              const result = i === 0 ? state.a : state.b;
              const delta = formatDelta(result);
              const won = state.outcome === (i === 0 ? "a" : "b");
              return (
                <li key={side.runId} data-won={won ? "true" : undefined}>
                  <span className={styles.revealTag}>{NAMES[i]}</span>
                  {side.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={side.coverUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <span className={styles.revealLabel}>
                    <strong>{side.title}</strong>
                    <span>
                      <ProviderMark provider={side.provider} size={16} />
                      {side.label}
                    </span>
                  </span>
                  <span className={styles.revealElo}>
                    {Math.round(result.after)}
                    <span
                      className={
                        delta.startsWith("+")
                          ? styles.deltaUp
                          : styles.deltaDown
                      }
                    >
                      {delta}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className={styles.vote} aria-labelledby="arena-vote-title">
          <div className={styles.voteHead}>
            <h2 id="arena-vote-title">Which run is better?</h2>
            <div className={styles.progress} aria-live="polite">
              {!token ? (
                <span>{closedNotice}</span>
              ) : (
                <>
                  {sides.map((side, i) => (
                    <span
                      key={side.runId}
                      data-done={played[i] ? "true" : undefined}
                    >
                      {played[i] ? (
                        <Check aria-hidden="true" weight="bold" />
                      ) : (
                        <i aria-hidden="true" />
                      )}
                      {played[i] ? `Played ${NAMES[i]}` : `Play ${NAMES[i]}`}
                    </span>
                  ))}
                  <span>
                    {state.kind === "sending"
                      ? "Recording your vote…"
                      : !bothPlayed
                        ? "to unlock voting"
                        : !ready
                          ? "Voting opens in a moment"
                          : "Voting is open"}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className={styles.voteButtons} role="group" aria-label="Vote">
            <button
              type="button"
              className={styles.voteButton}
              onClick={() => void vote("a")}
              disabled={!canVote}
            >
              <Trophy aria-hidden="true" weight="bold" />A is better
            </button>
            <button
              type="button"
              className={styles.voteButton}
              onClick={() => void vote("tie")}
              disabled={!canVote}
            >
              <Equals aria-hidden="true" weight="bold" />
              Tie
            </button>
            <button
              type="button"
              className={styles.voteButton}
              onClick={() => void vote("b")}
              disabled={!canVote}
            >
              <Trophy aria-hidden="true" weight="bold" />B is better
            </button>
          </div>
          {state.kind === "error" ? (
            <p className={styles.voteError} role="alert">
              {state.message}
              {state.final ? (
                <button type="button" onClick={next} disabled={refreshing}>
                  Next pair
                  <ArrowRight aria-hidden="true" weight="bold" />
                </button>
              ) : null}
            </p>
          ) : null}
        </section>
      )}
    </>
  );
}

function ArenaCard({
  side,
  name,
  other,
  active,
  otherActive,
  played,
  onPlay,
}: {
  side: ArenaSide;
  name: string;
  other: string;
  active: boolean;
  otherActive: boolean;
  played: boolean;
  onPlay: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [allControls, setAllControls] = useState(false);
  const extra = side.controls.length - SHORT_CONTROLS;

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => frameRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <section className={styles.side} aria-label={`Run ${name}`}>
      <div className={styles.sideHead}>
        <h2>
          Run {name}
          <span>{side.title}</span>
        </h2>
        <span
          className={styles.sideStatus}
          data-state={active ? "playing" : played ? "played" : undefined}
        >
          {active ? (
            <>
              <i aria-hidden="true" />
              Playing
            </>
          ) : played ? (
            <>
              <Check aria-hidden="true" weight="bold" />
              Played
            </>
          ) : (
            "Not played yet"
          )}
        </span>
      </div>

      <div className={styles.screen} data-active={active ? "true" : undefined}>
        {active ? (
          <>
            <iframe
              ref={frameRef}
              className={styles.frame}
              src={side.entryUrl}
              title={`Run ${name}, a MirageML Bench GTA attempt`}
              sandbox={GAME_IFRAME_SANDBOX}
              allow="fullscreen; gamepad"
              allowFullScreen
              referrerPolicy="no-referrer"
              data-mirage-protocol-version={side.protocolVersion}
              tabIndex={0}
            />
            <button
              type="button"
              className={styles.fullscreen}
              aria-label={`Play Run ${name} full screen`}
              onClick={() => void frameRef.current?.requestFullscreen?.()}
            >
              <CornersOut aria-hidden="true" weight="bold" />
            </button>
          </>
        ) : (
          <button type="button" className={styles.start} onClick={onPlay}>
            {side.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={side.coverUrl} alt="" referrerPolicy="no-referrer" />
            ) : null}
            <span className={styles.startLabel}>
              <span className={styles.startIcon}>
                <Play aria-hidden="true" weight="fill" />
              </span>
              <strong>
                {played ? `Play Run ${name} again` : `Play Run ${name}`}
              </strong>
              {otherActive ? (
                <span>
                  Run {other} closes while you play {name}
                </span>
              ) : null}
            </span>
          </button>
        )}
      </div>

      <div className={styles.sideControls}>
        <ControlList
          compact
          controls={
            allControls ? side.controls : side.controls.slice(0, SHORT_CONTROLS)
          }
        />
        {extra > 0 ? (
          <button
            type="button"
            className={styles.moreControls}
            onClick={() => setAllControls((value) => !value)}
            aria-expanded={allControls}
          >
            {allControls ? "Fewer controls" : `All controls (+${extra})`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
