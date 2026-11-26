import { getEntryForRun } from "../bench/entries";
import { isOutcome, type Outcome } from "./elo";
import { pairKey, verifyMatchup } from "./security";
import type { VoteStore } from "./store";

export const VOTER_LIMIT_PER_HOUR = 60;
export const CLIENT_LIMIT_PER_HOUR = 120;
export const VOTER_PAIR_TTL = 60 * 60 * 24 * 30;
export const CLIENT_PAIR_TTL = 60 * 60 * 24;

export type VoteRequest = {
  a: unknown;
  b: unknown;
  outcome: unknown;
  token: unknown;
};

export type SideResult = {
  runId: string;
  entryId: string;
  before: number;
  after: number;
};

export type VoteResponse =
  | { ok: true; outcome: Outcome; a: SideResult; b: SideResult }
  | {
      ok: false;
      status: 400 | 409 | 429;
      error:
        | "bad-request"
        | "invalid-token"
        | "too-soon"
        | "expired"
        | "already-voted"
        | "rate-limited";
    };

function runEntry(runId: unknown) {
  if (typeof runId !== "string" || runId.length > 100) return null;
  const entry = getEntryForRun(runId);
  return entry ? { runId, entry } : null;
}

/**
 * Validates and records one vote. `voter` is the anonymous cookie ID and
 * `client` the keyed IP hash; neither is stored beyond expiring dedupe and
 * rate-limit keys.
 */
export async function castVote(
  store: VoteStore,
  secret: string,
  request: VoteRequest,
  voter: string,
  client: string,
  now = Date.now(),
): Promise<VoteResponse> {
  const a = runEntry(request.a);
  const b = runEntry(request.b);
  if (!a || !b || a.runId === b.runId || !isOutcome(request.outcome)) {
    return { ok: false, status: 400, error: "bad-request" };
  }

  const token = verifyMatchup(secret, request.token, a.runId, b.runId, now);
  if (!token.ok) {
    return {
      ok: false,
      status: token.reason === "invalid" ? 400 : 409,
      error: token.reason === "invalid" ? "invalid-token" : token.reason,
    };
  }

  const hour = Math.floor(now / 3_600_000);
  const [voterCount, clientCount] = await Promise.all([
    store.count(`rate:v:${voter}:${hour}`, 3_600),
    store.count(`rate:c:${client}:${hour}`, 3_600),
  ]);
  if (
    voterCount > VOTER_LIMIT_PER_HOUR ||
    clientCount > CLIENT_LIMIT_PER_HOUR
  ) {
    return { ok: false, status: 429, error: "rate-limited" };
  }

  const pair = pairKey(a.runId, b.runId);
  if (!(await store.claim(`seen:v:${voter}:${pair}`, VOTER_PAIR_TTL))) {
    return { ok: false, status: 409, error: "already-voted" };
  }
  if (!(await store.claim(`seen:c:${client}:${pair}`, CLIENT_PAIR_TTL))) {
    return { ok: false, status: 409, error: "already-voted" };
  }

  const result = await store.recordVote({
    runA: a.runId,
    runB: b.runId,
    outcome: request.outcome,
  });

  return {
    ok: true,
    outcome: request.outcome,
    a: { runId: a.runId, entryId: a.entry.id, ...result.a },
    b: { runId: b.runId, entryId: b.entry.id, ...result.b },
  };
}
