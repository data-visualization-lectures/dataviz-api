// api/_lib/webhook-handlers.ts
// Stripe Webhook イベントハンドラー

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { logger } from "./logger.js";
import {
    toIso,
    mapStripeStatus,
    resolvePlanId,
    getUserIdFromCustomer,
    upsertSubscription,
} from "./webhook-helpers.js";

/**
 * checkout.session.completed イベントハンドラー
 */
export async function handleCheckoutCompleted(
    event: Stripe.Event,
    stripe: Stripe,
    supabaseAdmin: SupabaseClient
): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;

    const userId = session.metadata?.user_id;
    const customerId = (session.customer as string | null) ?? null;
    const subscriptionId = (session.subscription as string | null) ?? null;

    if (!userId || !customerId) {
        logger.warn(
            "checkout.session.completed: missing userId or customerId",
            { userId, customerId }
        );
        return; // Stripe には 200 を返してリトライループを防ぐ
    }

    let status = mapStripeStatus("active");
    let currentPeriodEnd: string | null | undefined = undefined;
    let cancelAtPeriodEnd: boolean | null = false;
    let planId: string | undefined = undefined;
    let stripeSubscription: Stripe.Subscription | null = null;

    if (subscriptionId) {
        try {
            stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
            status = mapStripeStatus(stripeSubscription.status);
            currentPeriodEnd = toIso(stripeSubscription.current_period_end) ?? undefined;
            cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
        } catch (err) {
            logger.error("checkout.session.completed: retrieve subscription failed", err);
        }
    }

    if (stripeSubscription || session?.line_items) {
        const priceId =
                stripeSubscription?.items.data[0]?.price?.id ??
                (session?.line_items as any)?.data?.[0]?.price?.id;
        planId = await resolvePlanId(supabaseAdmin, priceId);
    }

    try {
        await upsertSubscription(supabaseAdmin, {
            userId,
            customerId,
            subscriptionId,
            status,
            currentPeriodEnd,
            cancelAtPeriodEnd,
            planId,
        });
    } catch (error) {
        logger.error("checkout.session.completed upsert error:", error);
    }

    // チームプラン決済時: グループを自動作成
    if (planId?.startsWith("team_") && subscriptionId) {
        try {
            // 冪等性チェック: 同じsubscription_idで既にグループが存在すればスキップ
            const { data: existing } = await supabaseAdmin
                .from("groups")
                .select("id")
                .eq("stripe_subscription_id", subscriptionId)
                .maybeSingle();

            if (!existing) {
                // display_nameを取得してグループ名に使用
                const { data: profile } = await supabaseAdmin
                    .from("profiles")
                    .select("display_name")
                    .eq("id", userId)
                    .maybeSingle();
                const groupName = profile?.display_name
                    ? `${profile.display_name} のチーム`
                    : "新規チーム";

                const maxSeats = planId.includes("small") ? 5 : planId.includes("standard") ? 10 : 30;

                const { data: group, error: groupError } = await supabaseAdmin
                    .from("groups")
                    .insert({
                        name: groupName,
                        max_seats: maxSeats,
                        stripe_subscription_id: subscriptionId,
                    })
                    .select()
                    .single();

                if (groupError) {
                    logger.error("checkout.session.completed: group creation failed", groupError);
                } else if (group) {
                    await supabaseAdmin
                        .from("group_members")
                        .insert({ group_id: group.id, user_id: userId, role: "owner" });
                    logger.info("Group created via checkout", { groupId: group.id, userId, planId });
                }
            }
        } catch (err) {
            logger.error("checkout.session.completed: group auto-creation error", err);
        }
    }
}

/**
 * customer.subscription.updated イベントハンドラー
 */
export async function handleSubscriptionUpdated(
    event: Stripe.Event,
    stripe: Stripe,
    supabaseAdmin: SupabaseClient
): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = (subscription.customer as string | null) ?? null;
    const userId = await getUserIdFromCustomer(stripe, customerId, subscription);

    if (!userId) {
        logger.warn("subscription.updated: missing userId", { customerId });
        return;
    }

    const status = mapStripeStatus(subscription.status);
    let currentPeriodEnd = toIso(subscription.current_period_end) ?? undefined;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    logger.info(
        `[Webhook] subscription.updated: subId=${subscription.id}, status=${status}, cancelAtPeriodEnd=${cancelAtPeriodEnd}, current_period_end=${subscription.current_period_end}`
    );
    // イベントオブジェクトのcurrent_period_endがnullの場合はStripe APIから直接取得
    if (!currentPeriodEnd) {
        try {
            const freshSub = await stripe.subscriptions.retrieve(subscription.id);
            currentPeriodEnd = toIso(freshSub.current_period_end) ?? undefined;
            logger.info(`[Webhook] subscription.updated: retrieved fresh current_period_end=${freshSub.current_period_end}`);
        } catch (err) {
            logger.error("subscription.updated: retrieve subscription for period_end failed", err as Error);
        }
    }
    const priceId = subscription.items.data[0]?.price?.id;
    const planId = await resolvePlanId(supabaseAdmin, priceId);

    await upsertSubscription(supabaseAdmin, {
        userId,
        customerId,
        subscriptionId: subscription.id,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
    });
}

/**
 * customer.subscription.deleted イベントハンドラー
 */
export async function handleSubscriptionDeleted(
    event: Stripe.Event,
    stripe: Stripe,
    supabaseAdmin: SupabaseClient
): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = (subscription.customer as string | null) ?? null;
    const userId = await getUserIdFromCustomer(stripe, customerId, subscription);

    if (!userId) {
        logger.warn("subscription.deleted: missing userId", { customerId });
        return;
    }

    // ユーザーが既に削除されている場合（アカウント削除フロー）はスキップ
    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

    if (!profile) {
        logger.info("subscription.deleted: user already deleted, skipping upsert", { userId, customerId });
        return;
    }

    const status = mapStripeStatus(subscription.status ?? "canceled");
    const currentPeriodEnd = toIso(subscription.current_period_end) ?? undefined;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    const priceId = subscription.items.data[0]?.price?.id;
    const planId = await resolvePlanId(supabaseAdmin, priceId);

    await upsertSubscription(supabaseAdmin, {
        userId,
        customerId,
        subscriptionId: subscription.id,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
    });
}

/**
 * invoice.payment_succeeded イベントハンドラー
 */
export async function handleInvoicePaymentSucceeded(
    event: Stripe.Event,
    stripe: Stripe,
    supabaseAdmin: SupabaseClient
): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = (invoice.subscription as string | null) ?? null;
    const customerId = (invoice.customer as string | null) ?? null;
    let subscription: Stripe.Subscription | null = null;

    if (subscriptionId) {
        try {
            subscription = await stripe.subscriptions.retrieve(subscriptionId);
        } catch (err) {
            logger.error("invoice.payment_succeeded: retrieve subscription failed", err);
        }
    }

    const userId = await getUserIdFromCustomer(stripe, customerId, subscription);
    if (!userId) {
        logger.warn("invoice.payment_succeeded: missing userId", {
            customerId,
            subscriptionId,
        });
        return;
    }

    const status = subscription ? mapStripeStatus(subscription.status) : mapStripeStatus("active");
    const currentPeriodEnd = subscription
        ? (toIso(subscription.current_period_end) ?? undefined)
        : undefined;
    const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false;

    const priceId =
        invoice.lines.data[0]?.price?.id ??
        subscription?.items.data[0]?.price?.id;
    const planId = await resolvePlanId(supabaseAdmin, priceId);

    await upsertSubscription(supabaseAdmin, {
        userId,
        customerId,
        subscriptionId,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
    });
}

/**
 * invoice.payment_failed イベントハンドラー
 */
export async function handleInvoicePaymentFailed(
    event: Stripe.Event,
    stripe: Stripe,
    supabaseAdmin: SupabaseClient
): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = (invoice.subscription as string | null) ?? null;
    const customerId = (invoice.customer as string | null) ?? null;
    let subscription: Stripe.Subscription | null = null;

    if (subscriptionId) {
        try {
            subscription = await stripe.subscriptions.retrieve(subscriptionId);
        } catch (err) {
            logger.error("invoice.payment_failed: retrieve subscription failed", err);
        }
    }

    const userId = await getUserIdFromCustomer(stripe, customerId, subscription);
    if (!userId) {
        logger.warn("invoice.payment_failed: missing userId", {
            customerId,
            subscriptionId,
        });
        return;
    }

    const status = subscription
        ? mapStripeStatus(subscription.status ?? "past_due")
        : mapStripeStatus("past_due");
    const currentPeriodEnd = subscription
        ? (toIso(subscription.current_period_end) ?? undefined)
        : undefined;
    const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false;

    const priceId =
        invoice.lines.data[0]?.price?.id ??
        subscription?.items.data[0]?.price?.id;
    const planId = await resolvePlanId(supabaseAdmin, priceId);

    await upsertSubscription(supabaseAdmin, {
        userId,
        customerId,
        subscriptionId,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
    });
}
