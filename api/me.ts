// /api/me.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCors } from "./_lib/cors.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { isAcademiaEmail } from "./_lib/academia.js";

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS は一番最初に
  setCors(req, res);

  // Preflight (OPTIONS)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    let { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // アカデミア会員（無料付与）判定
    // DBに有効なサブスクリプションがない、かつ大学ドメインの場合に付与
    if (
      (!subscription || subscription.status !== "active") &&
      user.email &&
      isAcademiaEmail(user.email)
    ) {
      if (!subscription) {
        // 全くレコードがない場合はオブジェクトを捏造
        subscription = {
          user_id: user.id,
          status: "active",
          plan_id: "academia",
          current_period_end: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      } else {
        // レコードはあるが active ではない場合 (canceled/past_due 等)
        // academia 権限で上書きして active に見せる
        subscription.status = "active";
        subscription.plan_id = "academia";
        subscription.current_period_end = null;
      }
    }

    if (subError) {
      console.error("subscriptions error", subError);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("profiles error", profileError);
    }

    return res.status(200).json({
      user: { id: user.id, email: user.email },
      profile,
      subscription,
    });
  } catch (err: any) {
    console.error("me handler error", err);
    return res
      .status(500)
      .json({ error: "internal_error", detail: err?.message ?? String(err) });
  }
}
