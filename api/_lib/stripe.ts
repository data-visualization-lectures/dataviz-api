import Stripe from "stripe";
import { config } from "./config.js";

export function createStripeClient() {
  return new Stripe(config.stripe.secretKey, {
    apiVersion: config.stripe.apiVersion as any,
  });
}
