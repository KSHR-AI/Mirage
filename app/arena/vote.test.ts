import { describe, expect, it } from "vitest";
import { INITIAL_RATING } from "./elo";
import { MIN_VIEW_MS, signMatchup } from "./security";
import { MemoryStore } from "./store";
import { castVote, VOTER_LIMIT_PER_HOUR } from "./vote";

const SECRET = "test-secret-that-is-at-least-32-characters";
const A = "grand-theft-astra";
const B = "port-solano-001";
const C = "crosstown";
const VOTER = "11111111-2222-3333-4444-555555555555";
const T0 = 1_800_000_000_000;

function setup() {
  let now = T0;
  const store = new MemoryStore(() => now);
  const vote = (
    a: string,
    b: string,
    outcome: unknown = "a",
    options: { voter?: string; client?: string; at?: number } = {},
  ) => {
    const issuedAt = now;
    const token = signMatchup(SECRET, { a, b, issuedAt });
    now += options.at ?? MIN_VIEW_MS;
    return castVote(
      store,
      SECRET,
      { a, b, outcome, token },
      options.voter ?? VOTER,
      options.client ?? "client",
      now,
    );
  };
  return { store, vote };
}

describe("castVote", () => {
  it("records a win from the initial ratings", async () => {
    const { store, vote } = setup();
    const result = await vote(A, B, "a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.a.before).toBe(INITIAL_RATING);
    expect(result.b.before).toBe(INITIAL_RATING);
    expect(result.a.after).toBeGreaterThan(INITIAL_RATING);
    expect(result.b.after).toBeLessThan(result.b.before);
    const ratings = await store.getRatings();
    expect(ratings.get(result.a.runId)?.votes).toBe(1);
    expect(ratings.get(result.b.runId)?.votes).toBe(1);
  });

  it("rejects unknown runs, a bad outcome and a forged token", async () => {
    const { store, vote } = setup();
    expect(await vote(A, "nope")).toMatchObject({ error: "bad-request" });
    expect(await vote(A, A)).toMatchObject({ error: "bad-request" });
    expect(await vote(A, B, "both")).toMatchObject({ error: "bad-request" });
    const forged = await castVote(
      store,
      SECRET,
      { a: A, b: B, outcome: "a", token: `${T0}.forged` },
      VOTER,
      "client",
      T0 + MIN_VIEW_MS,
    );
    expect(forged).toMatchObject({ status: 400, error: "invalid-token" });
  });

  it("refuses a vote cast too soon after the matchup was shown", async () => {
    const { vote } = setup();
    expect(await vote(A, B, "a", { at: 500 })).toMatchObject({
      status: 409,
      error: "too-soon",
    });
  });

  it("allows one vote per pair per voter, in either order", async () => {
    const { vote } = setup();
    expect((await vote(A, B)).ok).toBe(true);
    expect(await vote(B, A, "tie")).toMatchObject({ error: "already-voted" });
    expect((await vote(A, C)).ok).toBe(true);
  });

  it("allows one vote per pair per client address", async () => {
    const { vote } = setup();
    expect((await vote(A, B)).ok).toBe(true);
    const other = "99999999-2222-3333-4444-555555555555";
    expect(await vote(A, B, "b", { voter: other })).toMatchObject({
      error: "already-voted",
    });
  });

  it("rate-limits a voter", async () => {
    const { store } = setup();
    const hour = Math.floor((T0 + MIN_VIEW_MS) / 3_600_000);
    for (let i = 0; i < VOTER_LIMIT_PER_HOUR; i += 1) {
      await store.count(`rate:v:${VOTER}:${hour}`, 3_600);
    }
    const token = signMatchup(SECRET, { a: A, b: B, issuedAt: T0 });
    const result = await castVote(
      store,
      SECRET,
      { a: A, b: B, outcome: "a", token },
      VOTER,
      "client",
      T0 + MIN_VIEW_MS,
    );
    expect(result).toMatchObject({ status: 429, error: "rate-limited" });
  });
});
