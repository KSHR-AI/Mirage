import { applyVote, K_FACTOR, type Outcome } from "./elo";

/**
 * Where arena votes live. Production uses Upstash Redis over its REST API
 * (the store Vercel's Marketplace provisions, which sets KV_REST_API_URL and
 * KV_REST_API_TOKEN). Without those variables, development keeps votes in
 * memory and production turns voting off.
 *
 * Nothing here stores a raw IP address or anything that identifies a voter:
 * callers pass an anonymous cookie ID and a keyed hash of the IP.
 */

export type StoredRating = { rating: number; votes: number };

export type VoteInput = {
  entryA: string;
  entryB: string;
  seedA: number;
  seedB: number;
  outcome: Outcome;
};

export type VoteResult = {
  a: { before: number; after: number };
  b: { before: number; after: number };
};

export interface VoteStore {
  readonly kind: "redis" | "memory";
  /** Ratings and vote counts for every entry that has been voted on. */
  getRatings(): Promise<Map<string, StoredRating>>;
  /** Applies one vote to both entries atomically. */
  recordVote(vote: VoteInput): Promise<VoteResult>;
  /** Sets `key` if unset and returns true; false if it was already set. */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  /** Increments a counter that expires `ttlSeconds` after it is created. */
  count(key: string, ttlSeconds: number): Promise<number>;
}

const PREFIX = "mirage:arena:";
const RATINGS_KEY = `${PREFIX}ratings`;
const VOTES_KEY = `${PREFIX}votes`;
const LOG_KEY = `${PREFIX}log`;
const LOG_LIMIT = 50_000;

// Runs inside Redis so concurrent votes never read a stale rating.
// KEYS: ratings hash, votes hash, log list.
// ARGV: entryA, entryB, seedA, seedB, scoreA (1, 0.5, 0), k, log entry, cap.
const VOTE_SCRIPT = `
local ra = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or ARGV[3])
local rb = tonumber(redis.call('HGET', KEYS[1], ARGV[2]) or ARGV[4])
local ea = 1 / (1 + 10 ^ ((rb - ra) / 400))
local delta = tonumber(ARGV[6]) * (tonumber(ARGV[5]) - ea)
local na = ra + delta
local nb = rb - delta
redis.call('HSET', KEYS[1], ARGV[1], tostring(na), ARGV[2], tostring(nb))
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
redis.call('HINCRBY', KEYS[2], ARGV[2], 1)
redis.call('LPUSH', KEYS[3], ARGV[7])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[8]) - 1)
return {tostring(ra), tostring(na), tostring(rb), tostring(nb)}
`;

function scoreFor(outcome: Outcome) {
  return outcome === "a" ? 1 : outcome === "b" ? 0 : 0.5;
}

function logEntry(vote: VoteInput) {
  return JSON.stringify({
    a: vote.entryA,
    b: vote.entryB,
    o: vote.outcome,
    t: Date.now(),
  });
}

class RedisStore implements VoteStore {
  readonly kind = "redis";

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async command<T>(args: readonly (string | number)[]): Promise<T> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.map(String)),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as {
      result?: T;
      error?: string;
    } | null;
    if (!response.ok || !body || body.error !== undefined) {
      throw new Error(
        `Vote store request failed: ${body?.error ?? response.status}`,
      );
    }
    return body.result as T;
  }

  async getRatings() {
    const [ratings, votes] = await Promise.all([
      this.command<string[]>(["HGETALL", RATINGS_KEY]),
      this.command<string[]>(["HGETALL", VOTES_KEY]),
    ]);
    const counts = new Map<string, number>();
    for (let i = 0; i + 1 < votes.length; i += 2) {
      counts.set(votes[i], Number(votes[i + 1]));
    }
    const result = new Map<string, StoredRating>();
    for (let i = 0; i + 1 < ratings.length; i += 2) {
      const rating = Number(ratings[i + 1]);
      if (!Number.isFinite(rating)) continue;
      result.set(ratings[i], { rating, votes: counts.get(ratings[i]) ?? 0 });
    }
    return result;
  }

  async recordVote(vote: VoteInput) {
    const [beforeA, afterA, beforeB, afterB] = (
      await this.command<string[]>([
        "EVAL",
        VOTE_SCRIPT,
        3,
        RATINGS_KEY,
        VOTES_KEY,
        LOG_KEY,
        vote.entryA,
        vote.entryB,
        vote.seedA,
        vote.seedB,
        scoreFor(vote.outcome),
        K_FACTOR,
        logEntry(vote),
        LOG_LIMIT,
      ])
    ).map(Number);
    return {
      a: { before: beforeA, after: afterA },
      b: { before: beforeB, after: afterB },
    };
  }

  async claim(key: string, ttlSeconds: number) {
    const result = await this.command<string | null>([
      "SET",
      PREFIX + key,
      "1",
      "NX",
      "EX",
      ttlSeconds,
    ]);
    return result === "OK";
  }

  async count(key: string, ttlSeconds: number) {
    const value = await this.command<number>(["INCR", PREFIX + key]);
    if (value === 1) await this.command(["EXPIRE", PREFIX + key, ttlSeconds]);
    return value;
  }
}

/** In-process store for development and tests. Votes vanish on restart. */
export class MemoryStore implements VoteStore {
  readonly kind = "memory";
  private readonly ratings = new Map<string, StoredRating>();
  private readonly keys = new Map<string, { value: number; expires: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async getRatings() {
    return new Map(
      [...this.ratings].map(([id, rating]) => [id, { ...rating }] as const),
    );
  }

  async recordVote(vote: VoteInput) {
    const a = this.ratings.get(vote.entryA) ?? { rating: vote.seedA, votes: 0 };
    const b = this.ratings.get(vote.entryB) ?? { rating: vote.seedB, votes: 0 };
    const next = applyVote(a.rating, b.rating, vote.outcome);
    this.ratings.set(vote.entryA, { rating: next.a, votes: a.votes + 1 });
    this.ratings.set(vote.entryB, { rating: next.b, votes: b.votes + 1 });
    return {
      a: { before: a.rating, after: next.a },
      b: { before: b.rating, after: next.b },
    };
  }

  private live(key: string) {
    const entry = this.keys.get(key);
    if (entry && entry.expires <= this.now()) {
      this.keys.delete(key);
      return undefined;
    }
    return entry;
  }

  async claim(key: string, ttlSeconds: number) {
    if (this.live(key)) return false;
    this.keys.set(key, { value: 1, expires: this.now() + ttlSeconds * 1000 });
    return true;
  }

  async count(key: string, ttlSeconds: number) {
    const entry = this.live(key);
    if (entry) {
      entry.value += 1;
      return entry.value;
    }
    this.keys.set(key, { value: 1, expires: this.now() + ttlSeconds * 1000 });
    return 1;
  }
}

function readRedisConfig() {
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  if (!url || !token) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, token };
}

const globalStore = globalThis as typeof globalThis & {
  __mirageArenaStore?: VoteStore;
};

/** The configured store, or null when voting is off. */
export function getVoteStore(): VoteStore | null {
  if (globalStore.__mirageArenaStore) return globalStore.__mirageArenaStore;
  const redis = readRedisConfig();
  let store: VoteStore | null = null;
  if (redis) store = new RedisStore(redis.url, redis.token);
  else if (process.env.NODE_ENV !== "production") store = new MemoryStore();
  if (store) globalStore.__mirageArenaStore = store;
  return store;
}
