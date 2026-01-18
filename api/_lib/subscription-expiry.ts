// api/_lib/subscription-expiry.ts
// サブスクリプション期限切れ判定と更新

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionRecord } from "./types.js";
import { logger } from "./logger.js";

function parsePeriodEnd(subscription: SubscriptionRecord): Date | null {
    if (!subscription.current_period_end) {
        return null;
    }
    const periodEnd = new Date(subscription.current_period_end);
    if (Number.isNaN(periodEnd.getTime())) {
        return null;
    }
    return periodEnd;
}

export function shouldExpireSubscription(
    subscription: SubscriptionRecord,
    now: Date
): boolean {
    if (subscription.status === "canceled") {
        return false;
    }

    const periodEnd = parsePeriodEnd(subscription);
    if (!periodEnd || periodEnd >= now) {
        return false;
    }

    if (subscription.status === "trialing") {
        return true;
    }

    return subscription.cancel_at_period_end === true;
}

export async function expireSubscriptionIfNeeded(
    supabaseAdmin: SupabaseClient,
    subscription: SubscriptionRecord,
    now: Date
): Promise<boolean> {
    if (!shouldExpireSubscription(subscription, now)) {
        return false;
    }

    const { error } = await supabaseAdmin
        .from("subscriptions")
        .update({
            status: "canceled",
            updated_at: now.toISOString(),
        })
        .eq("user_id", subscription.user_id);

    if (error) {
        logger.error("expireSubscriptionIfNeeded update failed", error, {
            userId: subscription.user_id,
        });
        throw error;
    }

    logger.info("Subscription expired and updated to canceled", {
        userId: subscription.user_id,
    });
    return true;
}
