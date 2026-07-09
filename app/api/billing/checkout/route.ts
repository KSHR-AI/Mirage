import { NextResponse } from "next/server";
import { getBaseUrl, requireEnv } from "../../../../lib/env";
import { getStripe } from "../../../../lib/stripe";
import {
  getSubscriptionForUser,
  isSubscriptionActive,
  upsertStripeCustomer,
} from "../../../../lib/subscriptions";
import { getCurrentUser } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in before subscribing." }, { status: 401 });
  }

  const stripe = getStripe();
  const baseUrl = getBaseUrl(request);
  const existing = await getSubscriptionForUser(user.id);

  if (isSubscriptionActive(existing)) {
    return NextResponse.json({ subscribed: true });
  }

  let customerId = existing?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: {
        supabase_user_id: user.id,
        app: "mirage",
      },
    });
    customerId = customer.id;
    await upsertStripeCustomer({
      userId: user.id,
      email: user.email ?? null,
      customerId,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: requireEnv("STRIPE_PRICE_ID"), quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: user.id,
    metadata: {
      supabase_user_id: user.id,
      app: "mirage",
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        app: "mirage",
      },
    },
    success_url: `${baseUrl}/?checkout=success`,
    cancel_url: `${baseUrl}/?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
