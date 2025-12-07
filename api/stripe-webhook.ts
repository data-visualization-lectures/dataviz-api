import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ================== 型定義 ==================
type SubRow = {
  id?: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | null;
};

// ================== ハンドラ本体 ==================
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

  // Vercel 環境では body が string / Buffer / object のどれかになる場合があるので、一旦 string 化
  let rawBody: string;
  if (typeof req.body === "string") {
    rawBody = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString("utf8");
  } else {
    rawBody = JSON.stringify(req.body ?? {});
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  try {
    switch (event.type) {
      /**
       * 1. checkout.session.completed
       *   - Checkout セッションが完了したタイミング
       *   - metadata.user_id / customer / subscription を元に subscriptions 行を upsert
       */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const userId = session.metadata?.user_id;
        const customerId = (session.customer as string | null) ?? null;
        const subscriptionId = (session.subscription as string | null) ?? null;

        if (!userId || !customerId) {
          console.warn("checkout.session.completed: missing userId or customerId", {
            userId,
            customerId,
          });
          break; // 200 で返して Stripe 側には OK を返す（リトライループを避ける）
        }

        // ここでは「サブスクの存在フラグ」を Supabase に書く。status 等は後続の
        // customer.subscription.* イベントでより正確に更新する。
        const upsert: SubRow = {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: "active", // 仮。後続イベントで上書きされる前提
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

      /**
       * 2. customer.subscription.created / updated / deleted
       *    - Stripe サブスクリプションのライフサイクル変化
       *    - status, current_period_end などを Supabase 側に反映する
       */
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const customerId = sub.customer as string;
        const stripeSubId = sub.id;
        const status = sub.status; // 'active' | 'canceled' | 'past_due' など
        const currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        // まず stripe_customer_id から該当ユーザーの subscriptions 行を探す
        const { data: existing, error: selectError } = await supabaseAdmin
          .from("subscriptions")
          .select("*")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (selectError) {
          console.error("subscription select error:", selectError);
          break;
        }
        if (!existing) {
          console.warn(
            "subscription event but subscriptions row not found for customer",
            customerId
          );
          break;
        }

        const upsert: SubRow = {
          user_id: existing.user_id,
          stripe_customer_id: customerId,
          stripe_subscription_id: stripeSubId,
          status,
          current_period_end: currentPeriodEnd,
        };

        const { error: upsertError } = await supabaseAdmin
          .from("subscriptions")
          .upsert(upsert, { onConflict: "user_id" });

        if (upsertError) {
          console.error("subscription upsert error:", upsertError);
        }
        break;
      }

      default: {
        // 他のイベントはログだけ残して無視
        console.log("Unhandled Stripe event type:", event.type);
      }
    }

    return res.status(200).send("ok");
  } catch (err: any) {
    console.error("stripe-webhook handler error:", err);
    return res.status(500).send("internal_webhook_error");
  }
}