import Stripe from "stripe";

const apiVersion = "2024-06-20" as const;

export function createStripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: apiVersion as any
  });
}
