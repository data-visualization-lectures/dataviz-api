// api/_lib/subscription.ts

import { AuthenticatedUser, supabaseAdmin } from "./supabase.js";
import { isAcademiaEmail } from "./academia.js";

export async function checkSubscription(user: AuthenticatedUser): Promise<boolean> {
    // 1. Check DB for active/trialing subscription
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .in("status", ["active", "trialing"])
        .maybeSingle();

    if (subscription) {
        return true;
    }

    // 2. Academia check as fallback
    // アカデミア会員（無料付与）判定
    // DBに有効なサブスクリプションがない、かつ大学ドメインの場合に付与
    if (user.email && isAcademiaEmail(user.email)) {
        // DBにレコードがなくても、アカデミアメールアドレスなら許可
        return true;
    }

    // Error logging if needed, or simply return false
    if (error) {
        console.error("checkSubscription error", error);
    }

    return false;
}
