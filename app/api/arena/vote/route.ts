import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  VOTER_COOKIE,
  VOTER_COOKIE_MAX_AGE,
  clientIp,
  getVoteSecret,
  hashClient,
  isVoterId,
  newVoterId,
} from "../../../arena/security";
import { getVoteStore } from "../../../arena/store";
import { castVote, type VoteRequest } from "../../../arena/vote";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_048;

function fail(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "cross-origin");

  const store = getVoteStore();
  const secret = getVoteSecret();
  if (!store || !secret) return fail(503, "voting-closed");

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return fail(413, "too-large");
  let body: Partial<VoteRequest>;
  try {
    body = JSON.parse(text) as Partial<VoteRequest>;
  } catch {
    return fail(400, "bad-request");
  }
  if (!body || typeof body !== "object") return fail(400, "bad-request");

  const jar = await cookies();
  const existing = jar.get(VOTER_COOKIE)?.value;
  const voter = isVoterId(existing) ? existing : newVoterId();
  const client = hashClient(secret, clientIp(request.headers));

  let result;
  try {
    result = await castVote(
      store,
      secret,
      { a: body.a, b: body.b, outcome: body.outcome, token: body.token },
      voter,
      client,
    );
  } catch (error) {
    console.error("Arena vote failed", error);
    return fail(502, "store-unavailable");
  }

  const response = result.ok
    ? NextResponse.json(result, { headers: { "cache-control": "no-store" } })
    : fail(result.status, result.error);
  if (voter !== existing) {
    response.cookies.set(VOTER_COOKIE, voter, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: VOTER_COOKIE_MAX_AGE,
      path: "/",
    });
  }
  return response;
}
