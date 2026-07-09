import type Stripe from "stripe";
import { sql } from "./db";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "past_due"
  | "paused"
  | "trialing"
  | "unpaid";

export type UserSubscription = {
  user_id: string;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus | null;
  current_period_end: string | null;
};

export function isSubscriptionActive(subscription: Pick<UserSubscription, "status"> | null) {
  return subscription?.status === "active" || subscription?.status === "trialing";
}

export async function getSubscriptionForUser(userId: string) {
  const rows = await sql()<UserSubscription[]>`
    select
      user_id,
      email,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      current_period_end
    from public.mirage_subscriptions
    where user_id = ${userId}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function getSubscriptionByCustomer(customerId: string) {
  const rows = await sql()<UserSubscription[]>`
    select
      user_id,
      email,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      current_period_end
    from public.mirage_subscriptions
    where stripe_customer_id = ${customerId}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function upsertStripeCustomer({
  userId,
  email,
  customerId,
}: {
  userId: string;
  email: string | null;
  customerId: string;
}) {
  await sql()`
    insert into public.mirage_subscriptions (
      user_id,
      email,
      stripe_customer_id,
      updated_at
    )
    values (${userId}, ${email}, ${customerId}, now())
    on conflict (user_id)
    do update set
      email = excluded.email,
      stripe_customer_id = excluded.stripe_customer_id,
      updated_at = now()
  `;
}

export async function upsertSubscriptionFromStripe({
  userId,
  email,
  subscription,
}: {
  userId: string;
  email: string | null;
  subscription: Stripe.Subscription;
}) {
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000)
    : null;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  await sql()`
    insert into public.mirage_subscriptions (
      user_id,
      email,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      current_period_end,
      updated_at
    )
    values (
      ${userId},
      ${email},
      ${customerId},
      ${subscription.id},
      ${subscription.status},
      ${currentPeriodEnd},
      now()
    )
    on conflict (user_id)
    do update set
      email = coalesce(excluded.email, public.mirage_subscriptions.email),
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      updated_at = now()
  `;
}
