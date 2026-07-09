import { NextResponse } from "next/server";
import { requireEnv } from "../../../../lib/env";
import {
  getSubscriptionForUser,
  isSubscriptionActive,
} from "../../../../lib/subscriptions";
import { getCurrentUser } from "../../../../lib/supabase/server";

const TOKEN_LIFETIME_SECONDS = 6 * 60 * 60;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in before starting a Reactor session." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const subscription = await getSubscriptionForUser(user.id);
  if (!isSubscriptionActive(subscription)) {
    return NextResponse.json(
      { error: "Subscribe before starting a Reactor session." },
      { status: 402, headers: NO_STORE_HEADERS },
    );
  }

  const res = await fetch("https://api.reactor.inc/tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Reactor-API-Key": requireEnv("REACTOR_API_KEY"),
    },
    body: JSON.stringify({ expires_after: TOKEN_LIFETIME_SECONDS }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Reactor token request failed with ${res.status}` },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }

  const { jwt, expires_at } = (await res.json()) as {
    jwt: string;
    expires_at: number;
  };

  return NextResponse.json(
    { jwt, expires_at },
    { headers: NO_STORE_HEADERS },
  );
}
