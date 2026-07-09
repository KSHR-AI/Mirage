import { NextResponse } from "next/server";
import { getBaseUrl } from "../../../../lib/env";
import { getStripe } from "../../../../lib/stripe";
import { getSubscriptionForUser } from "../../../../lib/subscriptions";
import { getCurrentUser } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const subscription = await getSubscriptionForUser(user.id);
  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer yet." }, { status: 404 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: getBaseUrl(request),
  });

  return NextResponse.json({ url: session.url });
}
