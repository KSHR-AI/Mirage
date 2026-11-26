"use client";

import { ArrowRight, Equals, Trophy } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ProviderMark } from "../bench/ProviderMark";
import type { ProviderKey } from "../bench/scores";
import type { Outcome } from "./elo";
import styles from "./Arena.module.css";

export type ArenaSide = {
  runId: string;
  title: string;
  label: string;
  provider: ProviderKey;
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
    message: "You have already voted on this pair. Try the next matchup.",
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

function formatDelta(result: Result) {
  const delta = Math.round(result.after) - Math.round(result.before);
  return `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}`;
}

export function ArenaVote({
  token,
  sides,
  minViewMs,
}: {
  token: string;
  sides: readonly [ArenaSide, ArenaSide];
  minViewMs: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [ready, setReady] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  // The parent keys this component by token, so a new matchup starts fresh.
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), minViewMs);
    return () => window.clearTimeout(timer);
  }, [token, minViewMs]);

  async function vote(outcome: Outcome) {
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
    startRefresh(() => router.refresh());
  }

  const locked =
    state.kind === "sending" ||
    state.kind === "done" ||
    (state.kind === "error" && state.final);

  return (
    <section className={styles.vote} aria-labelledby="arena-vote-title">
      <h2 id="arena-vote-title" className={styles.voteTitle}>
        Which run is better?
      </h2>
      <div className={styles.voteButtons} role="group" aria-label="Vote">
        <button
          type="button"
          className={styles.voteButton}
          onClick={() => vote("a")}
          disabled={locked || !ready}
          aria-pressed={state.kind === "done" && state.outcome === "a"}
        >
          <Trophy aria-hidden="true" weight="bold" />A is better
        </button>
        <button
          type="button"
          className={styles.voteButton}
          onClick={() => vote("tie")}
          disabled={locked || !ready}
          aria-pressed={state.kind === "done" && state.outcome === "tie"}
        >
          <Equals aria-hidden="true" weight="bold" />
          Tie
        </button>
        <button
          type="button"
          className={styles.voteButton}
          onClick={() => vote("b")}
          disabled={locked || !ready}
          aria-pressed={state.kind === "done" && state.outcome === "b"}
        >
          <Trophy aria-hidden="true" weight="bold" />B is better
        </button>
      </div>

      <div className={styles.voteStatus} aria-live="polite">
        {state.kind === "idle" && !ready ? (
          <p>Voting opens in a few seconds. Open both games first.</p>
        ) : null}
        {state.kind === "sending" ? <p>Recording your vote…</p> : null}
        {state.kind === "error" ? (
          <p className={styles.voteError}>{state.message}</p>
        ) : null}
        {state.kind === "done" ? (
          <>
            <p>Vote recorded. Here is who built each run:</p>
            <ul className={styles.reveal}>
              {sides.map((side, i) => {
                const result = i === 0 ? state.a : state.b;
                const delta = formatDelta(result);
                return (
                  <li key={side.runId}>
                    <span className={styles.revealTag}>
                      {i === 0 ? "A" : "B"}
                    </span>
                    <ProviderMark provider={side.provider} size={20} />
                    <span className={styles.revealLabel}>
                      <strong>{side.label}</strong>
                      <span>{side.title}</span>
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
          </>
        ) : null}
      </div>

      {locked && state.kind !== "sending" ? (
        <button
          type="button"
          className={styles.nextButton}
          onClick={next}
          disabled={refreshing}
        >
          {refreshing ? "Loading…" : "Next matchup"}
          <ArrowRight aria-hidden="true" weight="bold" />
        </button>
      ) : null}
    </section>
  );
}
