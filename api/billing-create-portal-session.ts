// /api/billing-create-portal-session.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCors } from "./_lib/cors.js";
import { createStripeClient } from "./_lib/stripe.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { config } from "./_lib/config.js";

// ================== Stripe クライアント ==================
const stripe = createStripeClient();

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).end();
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
      console.error("subscriptions select error", subError);
      return res.status(500).json({ error: "subscriptions_select_failed" });
    }

    const stripeCustomerId = sub?.stripe_customer_id as string | undefined;

    if (!stripeCustomerId) {
      // そもそも課金していない or 顧客ID未保存
      return res.status(400).json({ error: "no_stripe_customer" });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${config.frontend.baseUrl}/account`
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Stripe portal session error:", err);
    return res.status(500).json({ error: err.message ?? "unknown_error" });
  }
}
