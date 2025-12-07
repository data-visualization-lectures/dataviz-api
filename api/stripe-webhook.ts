// /api/stripe-webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

type SubRow = {
  id?: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | null;
};

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
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !webhookSecret) {
    console.error("Missing env for stripe-webhook", {
      supabaseUrl: !!supabaseUrl,
      serviceRoleKey: !!serviceRoleKey,
      stripeSecretKey: !!stripeSecretKey,
      webhookSecret: !!webhookSecret,
    });
    return res.status(500).send("missing_env");
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20" as any,
  });

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sig = req.headers["stripe-signature"];
  if (!sig || Array.isArray(sig)) {
    return res.status(400).send("Missing stripe-signature");
  }

  let event: Stripe.Event;

  try {
    const rawBody = await readRawBody(req); // ★ ここで生の body を取得
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const userId = session.metadata?.user_id;
        const customerId = (session.customer as string | null) ?? null;
        const subscriptionId = (session.subscription as string | null) ?? null;

        if (!userId || !customerId) {
          console.warn(
            "checkout.session.completed: missing userId or customerId",
            { userId, customerId }
          );
          break; // Stripe には 200 を返してリトライループを防ぐ
        }

        const upsert: SubRow = {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: "active", // 仮のフラグ。必要に応じて後続の subscription イベントで上書き
          current_period_end: null,
        };

        const { error } = await supabaseAdmin
          .from("subscriptions")
          .upsert(upsert, { onConflict: "user_id" });

        if (error) {
          console.error("checkout.session.completed upsert error:", error);
        }

        break;
      }

      default: {
        console.log("Unhandled Stripe event type:", event.type);
      }
    }

    return res.status(200).send("ok");
  } catch (err: any) {
    console.error("stripe-webhook handler error:", err);
    return res.status(500).send("internal_webhook_error");
  }
}