// /api/billing-create-checkout-session.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { createStripeClient } from "./_lib/stripe.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { config } from "./_lib/config.js";
import { logger } from "./_lib/logger.js";
import {
  resolveCheckoutPlanSelection,
} from "./_lib/plan-catalog.js";
import { fetchPlanRecord } from "./_lib/plans.js";

// ================== Stripe クライアント ==================
const stripe = createStripeClient();

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsAndMethods(req, res, ["POST"])) {
    return;
  }

  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    // subscriptions テーブルから stripe_customer_id を探す
    const { data: sub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      logger.error("subscriptions select error", subError);
      return res.status(500).json({ error: "subscriptions_select_failed" });
    }

    // 既にアクティブな購読がある場合は Checkout へ進ませない
    // ただしチームプランへのアップグレードは許可する
    const { plan, currency, plan_id: requestedPlanId } = req.body ?? {};
    const resolvedPlan = resolveCheckoutPlanSelection(requestedPlanId ?? plan, currency);
    if (!resolvedPlan) {
      return res.status(400).json({ error: "invalid_plan" });
    }

    if (sub?.status === "active" && !resolvedPlan.isTeamPlan) {
      return res.status(200).json({
        error: "already_subscribed",
        redirect_url: `${config.frontend.baseUrl}/account`
      });
    }

    let stripeCustomerId = sub?.stripe_customer_id as string | undefined;

    // まだ Stripe Customer がなければ作成
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: {
          user_id: user.id
        }
      });

      stripeCustomerId = customer.id;

      // Supabase 側に保存
      if (!sub) {
        const { error: insertError } = await supabaseAdmin
          .from("subscriptions")
          .insert({
            user_id: user.id,
            stripe_customer_id: stripeCustomerId,
            status: "none"
          });

        if (insertError) {
          logger.error("subscriptions insert error", insertError);
          return res.status(500).json({ error: "subscriptions_insert_failed" });
        }
      } else {
        const { error: updateError } = await supabaseAdmin
          .from("subscriptions")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("user_id", user.id);

        if (updateError) {
          logger.error("subscriptions update error", updateError);
          return res.status(500).json({ error: "subscriptions_update_failed" });
        }
      }
    }

    const planRecord = await fetchPlanRecord(resolvedPlan.planId);
    const priceId = planRecord?.stripePriceId ?? null;
    if (!priceId) {
      logger.error("missing stripe price id for plan", undefined, {
        requestedPlanId: requestedPlanId ?? plan,
        resolvedPlanId: resolvedPlan.planId,
      });
      return res.status(500).json({ error: "missing_stripe_price_id" });
    }

    // Checkout セッション作成
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${config.frontend.baseUrl}/billing/success`,
      cancel_url: `${config.frontend.baseUrl}/billing/cancel`,
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: resolvedPlan.planId,
          canonical_plan_id: resolvedPlan.canonicalPlanId,
        }
      },
      metadata: {
        user_id: user.id,
        plan_id: resolvedPlan.planId,
        canonical_plan_id: resolvedPlan.canonicalPlanId,
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    logger.error("Stripe checkout error:", err);
    return res.status(500).json({ error: err.message ?? "unknown_error" });
  }
}
