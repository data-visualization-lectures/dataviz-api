// /api/stripe-webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabaseAdmin } from "./_lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const sig = req.headers["stripe-signature"] as string | undefined;

  // Vercel Functions の req.body は既にパースされている可能性があるので、
  // 実運用では "raw-body" を使うなど調整が必要です。
  // ここでは「擬似コード」として書きます。
  const buf = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig!, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed.", err);
    res.status(400).send("Bad signature");
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;

        if (!userId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const status = mapStripeStatus(subscription.status);

        await upsertSubscription({
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status,
          currentPeriodEnd: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : undefined
        });

        break;
      }

      // 他の event.type (customer.subscription.updated など) も同様に処理
      default:
        console.log(`Unhandled event: ${event.type}`);
    }

    res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    res.status(500).send("server error");
  }
}

type LocalStatus = "none" | "active" | "past_due" | "canceled" | "incomplete" | "trialing";

function mapStripeStatus(status: Stripe.Subscription.Status): LocalStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "none";
  }
}

async function upsertSubscription(params: {
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status?: LocalStatus;
  currentPeriodEnd?: Date;
}) {
  const { userId, stripeCustomerId, stripeSubscriptionId, status, currentPeriodEnd } = params;

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      status,
      current_period_end: currentPeriodEnd?.toISOString()
    });
  } else {
    await supabaseAdmin
      .from("subscriptions")
      .update({
        stripe_customer_id: stripeCustomerId ?? existing.stripe_customer_id,
        stripe_subscription_id: stripeSubscriptionId ?? existing.stripe_subscription_id,
        status: status ?? existing.status,
        current_period_end: currentPeriodEnd?.toISOString() ?? existing.current_period_end,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId);
  }
}