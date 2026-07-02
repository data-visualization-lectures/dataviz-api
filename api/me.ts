// /api/me.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { isAcademiaEmail } from "./_lib/academia.js";
import { logger } from "./_lib/logger.js";
import { expireSubscriptionIfNeeded } from "./_lib/subscription-expiry.js";
import { getUserGroups, getActiveGroupSubscription } from "./_lib/group.js";
import { resolveEntitlements } from "./_lib/entitlements.js";
import { applyAcademiaSubscriptionOverride } from "./_lib/academia-entitlements.js";
import { fetchPlanScope } from "./_lib/plans.js";
import {
  expireServiceTrialsForUserIfNeeded,
  fetchServiceTrialsForUser,
  startEligibleServiceTrial,
} from "./_lib/service-trials.js";
import { canStartEligibleServiceTrial } from "./_lib/service-trial-start.js";
import { resolveServiceScopeFromRequest } from "./_lib/request-app-context.js";
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
      { data: profile, error: profileError },
      serviceTrials,
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
        .maybeSingle(),
      fetchServiceTrialsForUser(supabaseAdmin, user.id),
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
    let updatedServiceTrials = serviceTrials;
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
    updatedServiceTrials = await expireServiceTrialsForUserIfNeeded(
      supabaseAdmin,
      user.id,
      updatedServiceTrials,
      new Date(),
    );

    // アカデミア会員（無料付与）判定
    // DBに有効なサブスクリプションがない、かつ大学ドメインの場合に付与
    let finalSubscription = applyAcademiaSubscriptionOverride({
      subscription: updatedSubscription,
      userId: user.id,
      isAcademia: !!user.email && (await isAcademiaEmail(user.email)),
    });

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
    const requestedServiceScope = resolveServiceScopeFromRequest(req);
    let entitlements = resolveEntitlements({
      subscription: finalSubscription,
      planScope,
      serviceTrials: updatedServiceTrials,
    });

    if (
      requestedServiceScope &&
      canStartEligibleServiceTrial({
        requestedServiceScope,
        accessibleScopes: entitlements.accessibleScopes,
        serviceTrial: updatedServiceTrials[requestedServiceScope],
        hasSubscriptionRecord: !!updatedSubscription,
      })
    ) {
      const startedTrial = await startEligibleServiceTrial(
        supabaseAdmin,
        user.id,
        requestedServiceScope,
      );
      if (startedTrial) {
        updatedServiceTrials = {
          ...updatedServiceTrials,
          [requestedServiceScope]: startedTrial,
        };
        entitlements = resolveEntitlements({
          subscription: finalSubscription,
          planScope,
          serviceTrials: updatedServiceTrials,
        });
      }
    }

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
      service_trials: {
        viz: updatedServiceTrials.viz
          ? {
              status: updatedServiceTrials.viz.status,
              current_period_end: updatedServiceTrials.viz.current_period_end ?? null,
            }
          : null,
        prep: updatedServiceTrials.prep
          ? {
              status: updatedServiceTrials.prep.status,
              current_period_end: updatedServiceTrials.prep.current_period_end ?? null,
            }
          : null,
      },
    });
  } catch (err: any) {
    logger.error("me handler error", err);
    return res
      .status(500)
      .json({ error: "internal_error", detail: err?.message ?? String(err) });
  }
}
