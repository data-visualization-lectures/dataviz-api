// api/_lib/trial.ts
// トライアルユーザー関連のヘルパー関数

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

/**
 * トライアル期間（日数）
 */
export const TRIAL_PERIOD_DAYS = 30;

/**
 * 招待コードが有効かどうかを検証
 */
export function isValidTrialCode(code: string | null | undefined, validCode: string): boolean {
    if (!code || !validCode) return false;
    return code === validCode;
}

/**
 * トライアルサブスクリプションを作成
 */
export async function createTrialSubscription(
    supabaseAdmin: SupabaseClient,
    userId: string
): Promise<void> {
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + TRIAL_PERIOD_DAYS);

    const { error } = await supabaseAdmin.from("subscriptions").insert({
        user_id: userId,
        status: "trialing",
        current_period_end: trialEndDate.toISOString(),
        plan_id: "pro_monthly",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });

    if (error) {
        logger.error("createTrialSubscription failed", error, { userId });
        throw error;
    } else {
        logger.info("createTrialSubscription succeeded", { userId, trialEndDate });
    }
}

/**
 * トライアル期限をチェックし、期限切れの場合はcanceledに更新
 * @returns 更新が行われた場合はtrue
 */
export async function checkAndExpireTrial(
    supabaseAdmin: SupabaseClient,
    userId: string,
    subscription: any
): Promise<boolean> {
    // trialingステータスでない場合はスキップ
    if (subscription?.status !== "trialing") {
        return false;
    }

    // current_period_endがない場合はスキップ
    if (!subscription.current_period_end) {
        return false;
    }

    // 期限チェック
    const periodEnd = new Date(subscription.current_period_end);
    const now = new Date();

    if (periodEnd < now) {
        // 期限切れ → canceledに更新
        const { error } = await supabaseAdmin
            .from("subscriptions")
            .update({
                status: "canceled",
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);

        if (error) {
            logger.error("checkAndExpireTrial update failed", error, { userId });
            throw error;
        } else {
            logger.info("Trial expired and updated to canceled", { userId, periodEnd });
            return true;
        }
    }

    return false;
}
