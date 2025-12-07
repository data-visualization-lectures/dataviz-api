// /api/billing-create-portal-session.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { setCors } from "./_lib/cors.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";

// ================== Stripe クライアント ==================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any
});

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL ?? "https://auth.dataviz.jp";

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

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

    // Billing Portal セッション作成
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${FRONTEND_BASE_URL}/account`
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Stripe portal session error:", err);
    return res.status(500).json({ error: err.message ?? "unknown_error" });
  }
}
