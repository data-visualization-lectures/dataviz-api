// /api/billing-create-portal-session.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getUserFromRequest } from "../lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  res.status(200).json({ url: portalSession.url });
}