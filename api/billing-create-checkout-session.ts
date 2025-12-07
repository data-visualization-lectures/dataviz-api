// /api/billing-create-checkout-session.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ================== CORS ==================
function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "https://auth.dataviz.jp");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization"
  );
}

// ================== Supabase 管理クライアント ==================
const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// ================== 認証ヘルパ ==================
type AuthenticatedUser = {
  id: string;
  email: string;
};

async function getUserFromRequest(
  req: VercelRequest
): Promise<AuthenticatedUser | null> {
  const header =
    (req.headers["authorization"] as string | undefined) ??
    (req.headers["Authorization"] as string | undefined);

  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = header.slice("bearer ".length);

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    console.error("getUserFromRequest error", error);
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? ""
  };
}

// ================== Stripe クライアント ==================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any
});

const PRO_PRICE_ID = process.env.STRIPE_PRO_MONTHLY_PRICE_ID!;
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

    // subscriptions テーブルから stripe_customer_id を探す
    const { data: sub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      console.error("subscriptions select error", subError);
      return res.status(500).json({ error: "subscriptions_select_failed" });
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
          console.error("subscriptions insert error", insertError);
          return res.status(500).json({ error: "subscriptions_insert_failed" });
        }
      } else {
        const { error: updateError } = await supabaseAdmin
          .from("subscriptions")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("user_id", user.id);

        if (updateError) {
          console.error("subscriptions update error", updateError);
          return res.status(500).json({ error: "subscriptions_update_failed" });
        }
      }
    }

    // Checkout セッション作成
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: PRO_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${FRONTEND_BASE_URL}/billing/success`,
      cancel_url: `${FRONTEND_BASE_URL}/billing/cancel`,
      metadata: {
        user_id: user.id
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({ error: err.message ?? "unknown_error" });
  }
}