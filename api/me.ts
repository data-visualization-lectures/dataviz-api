// /api/me.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCors } from "./_lib/cors.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { isAcademiaEmail } from "./_lib/academia.js";
import { logger } from "./_lib/logger.js";
import { expireSubscriptionIfNeeded } from "./_lib/subscription-expiry.js";

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS は一番最初に
  setCors(req, res);

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

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

    // データベースクエリを並列実行してパフォーマンスを向上
    const [
      { data: subscription, error: subError },
      { data: profile, error: profileError }
    ] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle()
    ]);

    // エラーログ
    if (subError) {
      logger.error("subscriptions query failed", subError, { userId: user.id });
    }
    if (profileError) {
      logger.error("profiles query failed", profileError, { userId: user.id });
    }

    // 期限切れチェック
    // trialing 期限切れ、または cancel_at_period_end の期間終了で canceled に更新
    let updatedSubscription = subscription;
    if (subscription) {
      const now = new Date();
      const wasExpired = await expireSubscriptionIfNeeded(
        supabaseAdmin,
        subscription,
        now
      );
      if (wasExpired) {
        // 期限切れで更新された場合、最新のデータを再取得
        const { data: refreshed } = await supabaseAdmin
          .from("subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        updatedSubscription = refreshed;
      }
    }

    // アカデミア会員（無料付与）判定
    // DBに有効なサブスクリプションがない、かつ大学ドメインの場合に付与
    let finalSubscription = updatedSubscription;
    if (
      (!subscription || subscription.status !== "active") &&
      user.email &&
      isAcademiaEmail(user.email)
    ) {
      if (!subscription) {
        // 全くレコードがない場合はオブジェクトを捏造
        finalSubscription = {
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
        finalSubscription = {
          ...subscription,
          status: "active",
          plan_id: "academia",
          current_period_end: null,
        };
      }
    }

    return res.status(200).json({
      user: { id: user.id, email: user.email },
      profile,
      subscription: finalSubscription,
    });
  } catch (err: any) {
    logger.error("me handler error", err);
    return res
      .status(500)
      .json({ error: "internal_error", detail: err?.message ?? String(err) });
  }
}
