// api/_lib/subscription.ts

import { AuthenticatedUser, supabaseAdmin } from "./supabase.js";
import { isAcademiaEmail } from "./academia.js";
import { getActiveGroupSubscription } from "./group.js";
import { logger } from "./logger.js";

export async function checkSubscription(user: AuthenticatedUser): Promise<boolean> {
    // 1. Check DB for active/trialing subscription
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", user.id)
        .in("status", ["active", "trialing"])
        .maybeSingle();

    if (subscription) {
        if (subscription.status === "trialing") {
            const periodEnd = subscription.current_period_end
                ? new Date(subscription.current_period_end)
                : null;
            if (periodEnd && periodEnd >= new Date()) {
                return true;
            }
            // 期限切れの trialing はアクセス不可 → 以降のチェックへ
        } else {
            // active
            return true;
        }
    }

    // 2. グループ所属チェック: ownerのサブスクが有効ならメンバーにもアクセス権を付与
    const groupSub = await getActiveGroupSubscription(user.id);
    if (groupSub) {
        return true;
    }

    // 3. Academia check as fallback
    // アカデミア会員（無料付与）判定
    // DBに有効なサブスクリプションがない、かつ大学ドメインの場合に付与
    if (user.email && (await isAcademiaEmail(user.email))) {
        // DBにレコードがなくても、アカデミアメールアドレスなら許可
        return true;
    }

    // Error logging if needed, or simply return false
    if (error) {
        logger.error("checkSubscription error", error as Error, { userId: user.id });
    }

    return false;
}
