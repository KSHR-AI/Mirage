import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Signing and anonymisation for arena votes. VOTE_SECRET (32+ characters)
 * signs matchup tokens and keys the IP hash; production refuses votes
 * without it. Development falls back to a fixed secret.
 */

export const VOTER_COOKIE = "mirage_voter";
export const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A matchup must be on screen this long before its vote counts. */
export const MIN_VIEW_MS = 4_000;
/** A matchup token expires after this long. */
export const MAX_TOKEN_AGE_MS = 2 * 60 * 60 * 1000;

const DEV_SECRET = "mirage-arena-development-secret-not-for-production";

export function getVoteSecret(): string | null {
  const secret = process.env.VOTE_SECRET ?? "";
  if (secret.length >= 32) return secret;
  return process.env.NODE_ENV === "production" ? null : DEV_SECRET;
}

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export type Matchup = { a: string; b: string; issuedAt: number };

/** A token that proves the server offered runs `a` and `b` at `issuedAt`. */
export function signMatchup(secret: string, matchup: Matchup) {
  const payload = `${matchup.a}|${matchup.b}|${matchup.issuedAt}`;
  return `${matchup.issuedAt}.${sign(secret, payload)}`;
}

export type TokenCheck =
  | { ok: true; issuedAt: number }
  | { ok: false; reason: "invalid" | "too-soon" | "expired" };

export function verifyMatchup(
  secret: string,
  token: unknown,
  a: string,
  b: string,
  now = Date.now(),
): TokenCheck {
  if (typeof token !== "string" || token.length > 200) {
    return { ok: false, reason: "invalid" };
  }
  const [issued, signature] = token.split(".");
  const issuedAt = Number(issued);
  if (!Number.isSafeInteger(issuedAt) || !signature) {
    return { ok: false, reason: "invalid" };
  }
  const expected = Buffer.from(sign(secret, `${a}|${b}|${issuedAt}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "invalid" };
  }
  const age = now - issuedAt;
  if (age < MIN_VIEW_MS) return { ok: false, reason: "too-soon" };
  if (age > MAX_TOKEN_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true, issuedAt };
}

/** A keyed, truncated hash of the client IP. The raw IP is never kept. */
export function hashClient(secret: string, ip: string) {
  return sign(secret, `ip:${ip}`).slice(0, 22);
}

const VOTER_ID = /^[0-9a-f-]{36}$/;

export function isVoterId(value: unknown): value is string {
  return typeof value === "string" && VOTER_ID.test(value);
}

export function newVoterId() {
  return randomUUID();
}

/** The client IP as Vercel reports it, or "unknown". */
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Order-independent key for a pair of runs. */
export function pairKey(a: string, b: string) {
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}
