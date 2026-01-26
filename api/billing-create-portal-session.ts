// /api/billing-create-portal-session.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { createStripeClient } from "./_lib/stripe.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { config } from "./_lib/config.js";
import { logger } from "./_lib/logger.js";

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

    // subscriptions から stripe_customer_id を取得
    const { data: sub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      logger.error("subscriptions select error", subError);
      return res.status(500).json({ error: "subscriptions_select_failed" });
    }

    let stripeCustomerId = sub?.stripe_customer_id as string | undefined;

    // まだ Stripe Customer がなければ作成 (Just-in-Time Creation)
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
        // レコード自体がない場合（通常ありえないが念のため）
        const { error: insertError } = await supabaseAdmin
          .from("subscriptions")
          .insert({
            user_id: user.id,
            stripe_customer_id: stripeCustomerId,
            status: "none"
          });

        if (insertError) {
          logger.error("subscriptions insert error (JIT)", insertError);
          return res.status(500).json({ error: "subscriptions_insert_failed" });
        }
      } else {
        // レコードはあるがIDがない場合（トライアルユーザーなど）
        const { error: updateError } = await supabaseAdmin
          .from("subscriptions")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("user_id", user.id);

        if (updateError) {
          logger.error("subscriptions update error (JIT)", updateError);
          return res.status(500).json({ error: "subscriptions_update_failed" });
        }
      }
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${config.frontend.baseUrl}/account`
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    logger.error("Stripe portal session error:", err);
    return res.status(500).json({ error: err.message ?? "unknown_error" });
  }
}
