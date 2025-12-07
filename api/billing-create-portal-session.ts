// /api/billing-create-portal-session.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { setCors } from "./_lib/cors";
import { supabaseAdmin } from "./_lib/supabaseAdmin";
import { getUserFromRequest } from "./_lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const user = await getUserFromRequest(req as any as Request);
  if (!user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const { data: sub, error } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !sub?.stripe_customer_id) {
    res.status(400).json({ error: "no_customer" });
    return;
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.FRONTEND_BASE_URL}/account`
  });

  try {
    // Stripe customer の取得（あなたの DB に保存済みならそこから取る）
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id, // ここはあなたの実装に合わせて調整
      return_url: "https://auth.dataviz.jp/account",
    });
    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Stripe portal session error:", err);
    return res.status(500).json({ error: err.message });
  }
}