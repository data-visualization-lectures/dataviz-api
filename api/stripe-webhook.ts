// /api/stripe-webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { config } from "./_lib/config.js";
import { logger } from "./_lib/logger.js";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from "./_lib/webhook-handlers.js";

// ---- raw body を読むヘルパー ----
// vercel dev はストリームを先に消費するため req.body にフォールバック
async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of req) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }

  const buf = Buffer.concat(chunks);
  if (buf.length > 0) return buf;

  // vercel dev: ストリームが空の場合 req.body を使用
  if (typeof req.body === "string") return Buffer.from(req.body);
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body) return Buffer.from(JSON.stringify(req.body));

  return buf;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logger.info("[Webhook] Handler invoked. Method:", req.method);

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
    // vercel dev はストリームを再シリアライズするため署名検証が失敗する。
    // ローカル開発時は req.body から直接イベントを構築する。
    if (process.env.USE_ENV_FILE && req.body && typeof req.body === "object") {
      logger.info("[Webhook] Skipping signature verification (vercel dev)");
      event = req.body as Stripe.Event;
    } else {
      return res.status(400).send(`Webhook Error: ${err?.message}`);
    }
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
        logger.info("Unhandled Stripe event type", { eventType: event.type });
    }

    return res.status(200).send("ok");
  } catch (err: any) {
    logger.error("stripe-webhook handler error:", err);
    return res.status(500).send("internal_webhook_error");
  }
}
