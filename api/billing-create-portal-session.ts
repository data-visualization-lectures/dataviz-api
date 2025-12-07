// /api/billing-create-portal-session.ts
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