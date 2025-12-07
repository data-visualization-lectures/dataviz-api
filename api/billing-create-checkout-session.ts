// /api/billing-create-checkout-session.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { setCors } from "./_lib/cors";
import { supabaseAdmin } from "./_lib/supabaseAdmin";
import { getUserFromRequest } from "./_lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any
});

const PRO_PRICE_ID = process.env.STRIPE_PRO_MONTHLY_PRICE_ID!;

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

  // subscriptions テーブルから stripe_customer_id を探す
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  let stripeCustomerId = sub?.stripe_customer_id;

  if (!stripeCustomerId) {
    // Stripe Customer を作成
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      metadata: {
        user_id: user.id
      }
    });

    stripeCustomerId = customer.id;

    // Supabase 側に保存
    if (!sub) {
      await supabaseAdmin.from("subscriptions").insert({
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        status: "none"
      });
    } else {
      await supabaseAdmin
        .from("subscriptions")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("user_id", user.id);
    }
  }

  try {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [
      {
        price: PRO_PRICE_ID,
        quantity: 1
      }
    ],
    success_url: `${process.env.FRONTEND_BASE_URL}/billing/success`,
    cancel_url: `${process.env.FRONTEND_BASE_URL}/billing/cancel`,
    metadata: {
      user_id: user.id
    }
  });
    res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    res.status(500).json({ error: err.message });
  }

}