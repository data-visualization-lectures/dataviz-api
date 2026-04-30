// api/_lib/subscription.ts

import { AuthenticatedUser, supabaseAdmin } from "./supabase.js";
import { isAcademiaEmail } from "./academia.js";
import { getActiveGroupSubscription } from "./group.js";
import { logger } from "./logger.js";
import { hasAccessibleScope, resolveEntitlements } from "./entitlements.js";
import { fetchPlanScope } from "./plans.js";
import { resolveRequiredScopeFromApp } from "./app-registry.js";
import { config } from "./config.js";
import type { AccessibleScope, ServiceScope, SubscriptionRecord } from "./types.js";

export interface SubscriptionAccessOptions {
    appName?: string | null;
    requiredScope?: ServiceScope | AccessibleScope | null;
}

export interface ResolvedSubscriptionAccess {
    hasSubscription: boolean;
    shouldAllow: boolean;
    scopeAllowed: boolean;
    requiredScope: ServiceScope | AccessibleScope | null;
    subscriptionScope: ServiceScope | null;
    accessibleScopes: AccessibleScope[];
    subscription: SubscriptionRecord | null;
}

async function resolveEffectiveSubscription(
    user: AuthenticatedUser,
): Promise<SubscriptionRecord | null> {
    // 1. Check DB for active/trialing subscription
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan_id, status, current_period_end")
        .eq("user_id", user.id)
        .in("status", ["active", "trialing"])
        .maybeSingle();

    let effectiveSubscription: SubscriptionRecord | null = null;
    if (subscription) {
        if (subscription.status === "trialing") {
            const periodEnd = subscription.current_period_end
                ? new Date(subscription.current_period_end)
                : null;
            if (periodEnd && periodEnd >= new Date()) {
                effectiveSubscription = subscription as SubscriptionRecord;
            }
            // 期限切れの trialing はアクセス不可 → 以降のチェックへ
        } else {
            // active
            effectiveSubscription = subscription as SubscriptionRecord;
        }
    }

    // 2. グループ所属チェック: ownerのサブスクが有効ならメンバーにもアクセス権を付与
    const groupSub = await getActiveGroupSubscription(user.id);
    if (groupSub) {
        effectiveSubscription = {
            user_id: user.id,
            plan_id: "team_member",
            status: "active",
            current_period_end: groupSub.current_period_end,
        };
    }

    // 3. Academia check as fallback
    // アカデミア会員（無料付与）判定
    // DBに有効なサブスクリプションがない、かつ大学ドメインの場合に付与
    if (!effectiveSubscription && user.email && (await isAcademiaEmail(user.email))) {
        effectiveSubscription = {
            user_id: user.id,
            plan_id: "academia",
            status: "active",
            current_period_end: null,
        };
    }

    // Error logging if needed, or simply return false
    if (error) {
        logger.error("checkSubscription error", error as Error, { userId: user.id });
    }

    return effectiveSubscription;
}

export async function resolveSubscriptionAccess(
    user: AuthenticatedUser,
    opts: SubscriptionAccessOptions = {},
): Promise<ResolvedSubscriptionAccess> {
    const effectiveSubscription = await resolveEffectiveSubscription(user);
    const planScope = await fetchPlanScope(effectiveSubscription?.plan_id);
    const entitlements = resolveEntitlements({
        subscription: effectiveSubscription,
        planScope,
    });
    const requiredScope =
        opts.requiredScope ?? resolveRequiredScopeFromApp(opts.appName);
    const scopeAllowed = hasAccessibleScope({
        requiredScope,
        subscriptionScope: entitlements.subscriptionScope,
        accessibleScopes: entitlements.accessibleScopes,
    });

    return {
        hasSubscription: entitlements.isSubscribed,
        shouldAllow: entitlements.isSubscribed && (
            !config.subscription.scopeEnforcementEnabled || scopeAllowed
        ),
        scopeAllowed,
        requiredScope,
        subscriptionScope: entitlements.subscriptionScope,
        accessibleScopes: entitlements.accessibleScopes,
        subscription: effectiveSubscription,
    };
}

export async function checkSubscription(
    user: AuthenticatedUser,
    opts: SubscriptionAccessOptions = {},
): Promise<boolean> {
    const access = await resolveSubscriptionAccess(user, opts);
    return access.shouldAllow;
}
