"use client";

import { ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { ProviderMark } from "../bench/ProviderMark";
import type { ProviderKey } from "../bench/entries";
import { ControlList } from "../player/ControlList";
import { InlinePlayer } from "../player/InlinePlayer";
import type { Outcome } from "./elo";
import styles from "./Arena.module.css";

export type ArenaSide = {
  runId: string;
  title: string;
  label: string;
  provider: ProviderKey;
  /** The deployment's entry URL; the run plays in its card. */
  entryUrl: string;
  protocolVersion: number;
  coverUrl: string | null;
  controls: readonly string[];
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
type Name = (typeof NAMES)[number];
const SHORT_CONTROLS = 3;

// Which runs of a pair were started, kept for the tab's session so that a
// reload of the same matchup still counts them as played.
const PLAYED_EVENT = "mirage:arena-played";

function playedKey(a: string, b: string) {
  return `mirage:arena-played:${a}|${b}`;
}

function readPlayed(key: string) {
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function markPlayed(key: string, name: string) {
  try {
    const current = readPlayed(key);
    if (!current.includes(name)) {
      window.sessionStorage.setItem(key, current + name);
    }
  } catch {
    // Without storage the run still plays; it just will not count as played.
  }
  window.dispatchEvent(new Event(PLAYED_EVENT));
}

function subscribePlayed(onChange: () => void) {
  window.addEventListener(PLAYED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener("pageshow", onChange);
  return () => {
    window.removeEventListener(PLAYED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener("pageshow", onChange);
  };
}

function formatDelta(result: Result) {
  const delta = Math.round(result.after) - Math.round(result.before);
  return `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}`;
}

/**
 * Both runs of a matchup, each playing in its own card, and the vote, which
 * opens once each has been played. After a vote the same cards show who built
 * each run. `token` is null while voting is closed.
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
  const key = playedKey(sides[0].runId, sides[1].runId);
  const getPlayed = useCallback(() => readPlayed(key), [key]);
  const stored = useSyncExternalStore(subscribePlayed, getPlayed, () => "");
  const played = [stored.includes("A"), stored.includes("B")] as const;
  const [playing, setPlaying] = useState<Name | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [ready, setReady] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  // The page keys this component by matchup, so a new pair starts fresh.
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), minViewMs);
    return () => window.clearTimeout(timer);
  }, [minViewMs]);

  async function vote(outcome: Outcome) {
    if (!token) return;
    setPlaying(null);
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

  const done = state.kind === "done" ? state : null;
  const bothPlayed = played[0] && played[1];
  const locked =
    !token ||
    state.kind === "sending" ||
    state.kind === "done" ||
    (state.kind === "error" && state.final);
  const canVote = !locked && bothPlayed && ready;
  const moved = done
    ? Math.round(done.a.after) !== Math.round(done.a.before)
    : false;

  const status = !token
    ? closedNotice
    : state.kind === "sending"
      ? "Recording your vote…"
      : !played[0] && !played[1]
        ? "Play both runs to unlock voting."
        : !played[0]
          ? "Play Run A to unlock voting."
          : !played[1]
            ? "Play Run B to unlock voting."
            : !ready
              ? "Voting opens in a moment."
              : "Voting is open.";

  return (
    <>
      <div className={styles.matchup}>
        {sides.map((side, i) => {
          const name = NAMES[i];
          return (
            <ArenaCard
              key={side.runId}
              side={side}
              name={name}
              played={played[i]}
              playing={playing === name}
              onPlay={() => {
                markPlayed(key, name);
                setPlaying(name);
              }}
              onStop={() => setPlaying(null)}
              result={done ? (i === 0 ? done.a : done.b) : null}
              picked={done?.outcome === (i === 0 ? "a" : "b")}
            />
          );
        })}
      </div>

      <section
        className={styles.vote}
        data-done={done ? "true" : undefined}
        aria-labelledby="arena-vote-title"
      >
        <div className={styles.ask} aria-hidden={done ? true : undefined}>
          <div>
            <h2 id={done ? undefined : "arena-vote-title"}>
              Which run is better?
            </h2>
            <p aria-live="polite">{status}</p>
          </div>
          <div className={styles.voteButtons} role="group" aria-label="Vote">
            <button
              type="button"
              className={styles.pick}
              onClick={() => void vote("a")}
              disabled={!canVote}
            >
              A is better
            </button>
            <button
              type="button"
              className={styles.tie}
              onClick={() => void vote("tie")}
              disabled={!canVote}
            >
              Tie
            </button>
            <button
              type="button"
              className={styles.pick}
              onClick={() => void vote("b")}
              disabled={!canVote}
            >
              B is better
            </button>
          </div>
        </div>

        <div className={styles.outcome} aria-hidden={done ? undefined : true}>
          <div>
            <h2 id={done ? "arena-vote-title" : undefined}>
              {done?.outcome === "tie"
                ? "You called it a tie."
                : `You voted for Run ${done?.outcome === "b" ? "B" : "A"}.`}{" "}
              Here is who built each run.
            </h2>
            <p>
              {moved
                ? "Both ratings moved with your vote."
                : "A tie between equally rated runs moves neither rating."}
            </p>
          </div>
          <div className={styles.voteButtons}>
            <Link
              href="/"
              className={styles.tie}
              tabIndex={done ? undefined : -1}
            >
              See the leaderboard
            </Link>
            <button
              type="button"
              className={styles.next}
              onClick={next}
              disabled={!done || refreshing}
            >
              {refreshing ? "Loading…" : "Next pair"}
              <ArrowRight aria-hidden="true" weight="bold" />
            </button>
          </div>
        </div>
      </section>

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

      <p className={styles.sandboxNote}>
        Each game runs in a sandboxed frame on this page: scripts and pointer
        lock only.
      </p>
    </>
  );
}

function ArenaCard({
  side,
  name,
  played,
  playing,
  onPlay,
  onStop,
  result,
  picked,
}: {
  side: ArenaSide;
  name: Name;
  played: boolean;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  /** The run's rating change, once the vote is in. */
  result: Result | null;
  picked: boolean;
}) {
  const [allControls, setAllControls] = useState(false);
  const extra = side.controls.length - SHORT_CONTROLS;
  const delta = result ? formatDelta(result) : "";

  return (
    <section
      className={styles.side}
      data-playing={playing ? "true" : undefined}
      data-revealed={result ? "true" : undefined}
      data-picked={picked ? "true" : undefined}
      aria-label={`Run ${name}`}
    >
      <div className={styles.stage}>
        <InlinePlayer
          game={side}
          playing={playing}
          onPlay={onPlay}
          onStop={onStop}
          startLabel={played ? `Play Run ${name} again` : `Play Run ${name}`}
        />
      </div>

      <div className={styles.sideHead}>
        <div className={styles.sideMeta}>
          <p>Run {name}</p>
          <p
            className={styles.sideStatus}
            data-state={playing ? "playing" : played ? "played" : undefined}
          >
            <i aria-hidden="true" />
            {playing ? "Playing now" : played ? "Played" : "Not played yet"}
          </p>
        </div>
        <h2>{side.title}</h2>
        <div className={styles.builder}>
          <span aria-hidden={result ? true : undefined}>
            Builder hidden until you vote
          </span>
          {result ? (
            <span>
              <ProviderMark provider={side.provider} size={16} />
              {side.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.elo}>
        <div>
          {result ? (
            <p>
              <span>
                <s>{Math.round(result.before).toLocaleString("en-US")}</s> →{" "}
                {Math.round(result.after).toLocaleString("en-US")}
              </span>
              <b data-dir={delta[0]}>{delta}</b>
              <small>Arena Elo</small>
              {picked ? <strong>Your pick</strong> : null}
            </p>
          ) : null}
        </div>
      </div>

      {side.controls.length > 0 ? (
        <div className={styles.sideControls}>
          <h3>Controls</h3>
          <ControlList
            controls={
              allControls
                ? side.controls
                : side.controls.slice(0, SHORT_CONTROLS)
            }
          />
          {extra > 0 ? (
            <button
              type="button"
              onClick={() => setAllControls((value) => !value)}
              aria-expanded={allControls}
            >
              {allControls ? "Fewer controls" : `All controls (+${extra})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
