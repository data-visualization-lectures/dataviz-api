// api/_lib/webhook-helpers.ts
// Stripe Webhook 処理の共通ヘルパー関数

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { SubscriptionStatus } from "./types.js";

/**
 * Unix エポック秒を ISO 8601 文字列に変換
 */
export function toIso(epochSeconds: number | null | undefined): string | null {
    return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null;
}

/**
 * Stripe のサブスクリプションステータスを Supabase の enum にマッピング
 */
export function mapStripeStatus(
    status: Stripe.Subscription.Status | null | undefined
): SubscriptionStatus {
    switch (status) {
        case "active":
            return "active";
        case "trialing":
            return "trialing";
        case "past_due":
            return "past_due";
        case "incomplete":
            return "incomplete";
        case "incomplete_expired":
            return "canceled";
        case "unpaid":
            return "past_due";
        case "canceled":
            return "canceled";
        default:
            return "none";
    }
}

/**
 * Stripe Price ID から Supabase の plan_id を解決
 */
export async function resolvePlanId(
    supabaseAdmin: SupabaseClient,
    priceId: string | null | undefined
): Promise<string | undefined> {
    if (!priceId) return undefined;

    const { data, error } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("stripe_price_id", priceId)
        .maybeSingle();

    if (error) {
        console.error("resolvePlanId error", error);
        return undefined;
    }

    return data?.id;
}

/**
 * Stripe Customer から user_id を取得
 * サブスクリプションの metadata または Customer の metadata から取得
 */
export async function getUserIdFromCustomer(
    stripe: Stripe,
    customerId: string | null | undefined,
    subscription?: Stripe.Subscription | null
): Promise<string | null> {
    // まずサブスクリプションの metadata を確認
    if (subscription?.metadata?.user_id) {
        return subscription.metadata.user_id;
    }

    if (!customerId) return null;

    try {
        const customer = (await stripe.customers.retrieve(
            customerId
        )) as Stripe.Customer;

        const userId = customer.metadata?.user_id;
        if (!userId) {
            console.warn("customer metadata missing user_id", { customerId });
        }

        return userId ?? null;
    } catch (err) {
        console.error("getUserIdFromCustomer error", err);
        return null;
    }
}

/**
 * subscriptions テーブルを upsert
 */
export async function upsertSubscription(
    supabaseAdmin: SupabaseClient,
    params: {
        userId: string;
        customerId?: string | null;
        subscriptionId?: string | null;
        status?: SubscriptionStatus;
        currentPeriodEnd?: string | null;
        cancelAtPeriodEnd?: boolean | null;
        planId?: string | undefined;
    }
): Promise<void> {
    const payload: Record<string, any> = {
        user_id: params.userId,
    };

    if (params.customerId !== undefined) {
        payload.stripe_customer_id = params.customerId;
    }
    if (params.subscriptionId !== undefined) {
        payload.stripe_subscription_id = params.subscriptionId;
    }
    if (params.status !== undefined) {
        payload.status = params.status;
    }
    if (params.currentPeriodEnd !== undefined) {
        payload.current_period_end = params.currentPeriodEnd;
    }
    if (params.cancelAtPeriodEnd !== undefined) {
        payload.cancel_at_period_end = params.cancelAtPeriodEnd;
    }
    if (params.planId !== undefined) {
        payload.plan_id = params.planId ?? "pro_monthly";
    }

    const { error } = await supabaseAdmin
        .from("subscriptions")
        .upsert(payload, { onConflict: "user_id" });

    if (error) {
        console.error("upsertSubscription failed:", error, "payload:", payload);
        throw error;
    } else {
        console.log("upsertSubscription succeeded. Payload:", JSON.stringify(payload));
    }
}
