// /api/me.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { isAcademiaEmail } from "./_lib/academia.js";
import { logger } from "./_lib/logger.js";
import { expireSubscriptionIfNeeded } from "./_lib/subscription-expiry.js";
import { getUserGroups, getActiveGroupSubscription } from "./_lib/group.js";
import { resolveEntitlements } from "./_lib/entitlements.js";
import { fetchPlanScope } from "./_lib/plans.js";
import type { ServiceScope } from "./_lib/types.js";

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS は一番最初に
  if (handleCorsAndMethods(req, res, ["GET"])) {
    return;
  }

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
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
      (!finalSubscription || (finalSubscription as any).status !== "active") &&
      user.email &&
      (await isAcademiaEmail(user.email))
    ) {
      if (!finalSubscription) {
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
          ...finalSubscription,
          status: "active",
          plan_id: "academia",
          current_period_end: null,
        };
      }
    }

    // グループ所属チェック: ownerのサブスクが有効ならメンバーにもactive権限を付与
    let inheritedTeamMemberScope: ServiceScope | null = null;
    if (!finalSubscription || (finalSubscription as any).status !== "active") {
      const groupSub = await getActiveGroupSubscription(user.id);
      if (groupSub) {
        inheritedTeamMemberScope = groupSub.scope;
        finalSubscription = {
          user_id: user.id,
          status: "active",
          plan_id: "team_member",
          current_period_end: groupSub.current_period_end,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any;
      }
    }

    // グループ情報を取得
    const groups = await getUserGroups(user.id);
    const planScope =
      inheritedTeamMemberScope ?? (await fetchPlanScope(finalSubscription?.plan_id));
    const entitlements = resolveEntitlements({
      subscription: finalSubscription,
      planScope,
    });

    return res.status(200).json({
      user: { id: user.id, email: user.email },
      profile,
      subscription: finalSubscription
        ? {
            ...finalSubscription,
            scope: entitlements.subscriptionScope,
          }
        : null,
      groups,
      accessible_scopes: entitlements.accessibleScopes,
    });
  } catch (err: any) {
    logger.error("me handler error", err);
    return res
      .status(500)
      .json({ error: "internal_error", detail: err?.message ?? String(err) });
  }
}
