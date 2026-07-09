import { NextResponse } from "next/server";
import {
  getSubscriptionForUser,
  isSubscriptionActive,
} from "../../../lib/subscriptions";
import { getCurrentUser } from "../../../lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({
      user: null,
      subscription: null,
      canGenerate: false,
    });
  }

  const subscription = await getSubscriptionForUser(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
    },
    subscription,
    canGenerate: isSubscriptionActive(subscription),
  });
}
