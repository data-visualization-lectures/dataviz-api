// /api/stripe-webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

type SubscriptionStatus =
  | "none"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing";

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
    // console.error("[Webhook] Missing stripe-signature");
    return res.status(400).send("Missing stripe-signature");
  }

  let event: Stripe.Event;

  try {
    const rawBody = await readRawBody(req); // ★ ここで生の body を取得
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    // console.log("[Webhook] Event verified. Type:", event.type);
  } catch (err: any) {
    // console.error("Webhook signature verification failed:", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  // ---- 共通ヘルパー ----
  const toIso = (epochSeconds: number | null | undefined): string | null => {
    return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null;
  };

  const mapStripeStatus = (
    status: Stripe.Subscription.Status | null | undefined
  ): SubscriptionStatus => {
    switch (status) {
      case "active":
        return "active";
      case "trialing":
        return "trialing";
      case "past_due":
        return "past_due";
      case "incomplete":
        return "incomplete";
      case "incomplete_expired":
        return "canceled";
      case "unpaid":
        return "past_due";
      case "canceled":
        return "canceled";
      default:
        return "none";
    }
  };

  const resolvePlanId = async (
    priceId: string | null | undefined
  ): Promise<string | undefined> => {
    if (!priceId) return undefined;
    const { data, error } = await supabaseAdmin
      .from("plans")
      .select("id")
      .eq("stripe_price_id", priceId)
      .maybeSingle();

    if (error) {
      console.error("resolvePlanId error", error);
      return undefined;
    }
    return data?.id;
  };

  const getUserIdFromCustomer = async (
    customerId: string | null | undefined,
    subscription?: Stripe.Subscription | null
  ): Promise<string | null> => {
    if (subscription?.metadata?.user_id) {
      return subscription.metadata.user_id;
    }
    if (!customerId) return null;
    try {
      const customer = (await stripe.customers.retrieve(
        customerId
      )) as Stripe.Customer;
      const userId = customer.metadata?.user_id;
      if (!userId) {
        console.warn("customer metadata missing user_id", { customerId });
      }
      return userId ?? null;
    } catch (err) {
      console.error("getUserIdFromCustomer error", err);
      return null;
    }
  };

  const upsertSubscription = async (params: {
    userId: string;
    customerId?: string | null;
    subscriptionId?: string | null;
    status?: SubscriptionStatus;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean | null;
    planId?: string | undefined;
  }) => {
    const payload: Record<string, any> = {
      user_id: params.userId,
    };

    if (params.customerId !== undefined) {
      payload.stripe_customer_id = params.customerId;
    }
    if (params.subscriptionId !== undefined) {
      payload.stripe_subscription_id = params.subscriptionId;
    }
    if (params.status !== undefined) {
      payload.status = params.status;
    }
    if (params.currentPeriodEnd !== undefined) {
      payload.current_period_end = params.currentPeriodEnd;
    }
    if (params.cancelAtPeriodEnd !== undefined) {
      payload.cancel_at_period_end = params.cancelAtPeriodEnd;
    }
    if (params.planId !== undefined) {
      payload.plan_id = params.planId ?? "pro_monthly";
    }

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.error("upsertSubscription failed:", error, "payload:", payload);
      throw error;
    } else {
      console.log("upsertSubscription succeeded. Payload:", JSON.stringify(payload));
    }
  };

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

        let status: SubscriptionStatus = "active";
        let currentPeriodEnd: string | null | undefined = undefined;
        let cancelAtPeriodEnd: boolean | null = false;
        let planId: string | undefined = undefined;

        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(
              subscriptionId
            );
            status = mapStripeStatus(subscription.status);
            currentPeriodEnd = toIso(subscription.current_period_end) ?? undefined;
            cancelAtPeriodEnd = subscription.cancel_at_period_end;
            const priceId =
              subscription.items.data[0]?.price?.id ??
              (session?.line_items as any)?.data?.[0]?.price?.id;
            planId = await resolvePlanId(priceId);
          } catch (err) {
            console.error("checkout.session.completed: retrieve subscription failed", err);
          }
        }

        try {
          await upsertSubscription({
            userId,
            customerId,
            subscriptionId,
            status,
            currentPeriodEnd,
            cancelAtPeriodEnd,
            planId,
          });
        } catch (error) {
          console.error("checkout.session.completed upsert error:", error);
        }

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = (subscription.customer as string | null) ?? null;
        const userId = await getUserIdFromCustomer(customerId, subscription);

        if (!userId) {
          console.warn("subscription.updated: missing userId", { customerId });
          break;
        }

        const status = mapStripeStatus(subscription.status);
        const currentPeriodEnd = toIso(subscription.current_period_end) ?? undefined;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;
        console.log(`[Webhook] subscription.updated: subId=${subscription.id}, status=${status}, cancelAtPeriodEnd=${cancelAtPeriodEnd}`);
        const priceId = subscription.items.data[0]?.price?.id;
        const planId = await resolvePlanId(priceId);

        try {
          await upsertSubscription({
            userId,
            customerId,
            subscriptionId: subscription.id,
            status,
            currentPeriodEnd,
            cancelAtPeriodEnd,
            planId,
          });
        } catch (error) {
          console.error("subscription.updated upsert error:", error);
          return res.status(500).send("update_failed");
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = (subscription.customer as string | null) ?? null;
        const userId = await getUserIdFromCustomer(customerId, subscription);

        if (!userId) {
          console.warn("subscription.deleted: missing userId", { customerId });
          break;
        }

        const status = mapStripeStatus(subscription.status ?? "canceled");
        const currentPeriodEnd = toIso(subscription.current_period_end) ?? undefined;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;
        const priceId = subscription.items.data[0]?.price?.id;
        const planId = await resolvePlanId(priceId);

        try {
          await upsertSubscription({
            userId,
            customerId,
            subscriptionId: subscription.id,
            status,
            currentPeriodEnd,
            cancelAtPeriodEnd,
            planId,
          });
        } catch (error) {
          console.error("subscription.deleted upsert error:", error);
          return res.status(500).send("delete_failed");
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice.subscription as string | null) ?? null;
        const customerId = (invoice.customer as string | null) ?? null;
        let subscription: Stripe.Subscription | null = null;

        if (subscriptionId) {
          try {
            subscription = await stripe.subscriptions.retrieve(subscriptionId);
          } catch (err) {
            console.error("invoice.payment_succeeded: retrieve subscription failed", err);
          }
        }

        const userId = await getUserIdFromCustomer(customerId, subscription);
        if (!userId) {
          console.warn("invoice.payment_succeeded: missing userId", {
            customerId,
            subscriptionId,
          });
          break;
        }

        const status =
          subscription ? mapStripeStatus(subscription.status) : "active";
        const currentPeriodEnd = subscription
          ? (toIso(subscription.current_period_end) ?? undefined)
          : undefined;
        const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false;

        const priceId =
          invoice.lines.data[0]?.price?.id ??
          subscription?.items.data[0]?.price?.id;
        const planId = await resolvePlanId(priceId);

        try {
          await upsertSubscription({
            userId,
            customerId,
            subscriptionId,
            status,
            currentPeriodEnd,
            cancelAtPeriodEnd,
            planId,
          });
        } catch (error) {
          console.error("invoice.payment_succeeded upsert error:", error);
          return res.status(500).send("invoice_update_failed");
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice.subscription as string | null) ?? null;
        const customerId = (invoice.customer as string | null) ?? null;
        let subscription: Stripe.Subscription | null = null;

        if (subscriptionId) {
          try {
            subscription = await stripe.subscriptions.retrieve(subscriptionId);
          } catch (err) {
            console.error("invoice.payment_failed: retrieve subscription failed", err);
          }
        }

        const userId = await getUserIdFromCustomer(customerId, subscription);
        if (!userId) {
          console.warn("invoice.payment_failed: missing userId", {
            customerId,
            subscriptionId,
          });
          break;
        }

        const status = subscription
          ? mapStripeStatus(subscription.status ?? "past_due")
          : "past_due";
        const currentPeriodEnd = subscription
          ? (toIso(subscription.current_period_end) ?? undefined)
          : undefined;
        const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false;

        const priceId =
          invoice.lines.data[0]?.price?.id ??
          subscription?.items.data[0]?.price?.id;
        const planId = await resolvePlanId(priceId);

        try {
          await upsertSubscription({
            userId,
            customerId,
            subscriptionId,
            status,
            currentPeriodEnd,
            cancelAtPeriodEnd,
            planId,
          });
        } catch (error) {
          console.error("invoice.payment_failed upsert error:", error);
          return res.status(500).send("invoice_failed_update_failed");
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
