// /api/stripe-webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { config } from "./_lib/config.js";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from "./_lib/webhook-handlers.js";

// ---- raw body を読むヘルパー ----
async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of req) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("[Webhook] Handler invoked. Method:", req.method);

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const stripe = new Stripe(config.stripe.secretKey, {
    apiVersion: config.stripe.apiVersion as any,
  });

  const supabaseAdmin = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const sig = req.headers["stripe-signature"];
  if (!sig || Array.isArray(sig)) {
    return res.status(400).send("Missing stripe-signature");
  }

  let event: Stripe.Event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, config.stripe.webhookSecret);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event, stripe, supabaseAdmin);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event, stripe, supabaseAdmin);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event, stripe, supabaseAdmin);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event, stripe, supabaseAdmin);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event, stripe, supabaseAdmin);
        break;

      default:
        console.log("Unhandled Stripe event type:", event.type);
    }

    return res.status(200).send("ok");
  } catch (err: any) {
    console.error("stripe-webhook handler error:", err);
    return res.status(500).send("internal_webhook_error");
  }
}
