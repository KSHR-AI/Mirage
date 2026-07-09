import Stripe from "stripe";
import { requireEnv } from "./env";

let stripe: Stripe | undefined;

export function getStripe() {
  if (!stripe) {
    stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: "2026-06-24.dahlia",
    });
  }

  return stripe;
}
