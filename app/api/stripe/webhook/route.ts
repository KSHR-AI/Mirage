import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireEnv } from "../../../../lib/env";
import { getStripe } from "../../../../lib/stripe";
import {
  getSubscriptionByCustomer,
  upsertSubscriptionFromStripe,
} from "../../../../lib/subscriptions";

export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook." },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : null;
    const userId = session.metadata?.supabase_user_id ?? session.client_reference_id;

    if (subscriptionId && userId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await upsertSubscriptionFromStripe({
        userId,
        email: session.customer_details?.email ?? null,
        subscription,
      });
    }
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    const userId =
      subscription.metadata.supabase_user_id ??
      (await getSubscriptionByCustomer(customerId))?.user_id;

    if (userId) {
      await upsertSubscriptionFromStripe({
        userId,
        email: null,
        subscription,
      });
    }
  }

  return NextResponse.json({ received: true });
}
