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
    fetchTrackedSubscription,
} from "./webhook-helpers.js";
import { decideSubscriptionEvent } from "./webhook-subscription-identity.js";
import type { SubscriptionStatus } from "./types.js";
import { fetchPlanScope } from "./plans.js";
import { consumeServiceTrialsForPaidScope } from "./service-trials.js";
import { computePastDueGraceUntil } from "./past-due-grace.js";
import { sendGa4Event } from "./ga4-measurement.js";
import { resolveSubscriptionCanceledAnalytics } from "./subscription-canceled-analytics.js";

async function trackSubscriptionCanceled(params: {
    event: Stripe.Event;
    subscription: Stripe.Subscription;
    previousCancelAtPeriodEnd?: boolean;
    resolvedPlanId?: string;
}): Promise<void> {
    if (
        params.event.type !== "customer.subscription.updated" &&
        params.event.type !== "customer.subscription.deleted"
    ) {
        return;
    }

    const analytics = resolveSubscriptionCanceledAnalytics({
        eventType: params.event.type,
        eventCreated: params.event.created,
        subscription: params.subscription,
        previousCancelAtPeriodEnd: params.previousCancelAtPeriodEnd,
        resolvedPlanId: params.resolvedPlanId,
    });

    if (!analytics) {
        return;
    }

    const sent = await sendGa4Event({
        clientSeed: analytics.clientSeed,
        name: "subscription_canceled",
        timestampMicros: analytics.timestampMicros,
        params: analytics.params,
    });

    if (sent) {
        logger.info("Tracked subscription_canceled in GA4", {
            stripeEventId: params.event.id,
            subscriptionId: params.subscription.id,
            ...analytics.params,
        });
    }
}

async function consumeCoveredServiceTrials(params: {
    userId: string;
    planId: string | undefined;
    status: string | null | undefined;
    supabaseAdmin: SupabaseClient;
}): Promise<void> {
    if (params.status !== "active" && params.status !== "trialing") {
        return;
    }
    if (!params.planId) {
        return;
    }

    const planScope = await fetchPlanScope(params.planId, params.supabaseAdmin);
    const consumedScopes = await consumeServiceTrialsForPaidScope(params.supabaseAdmin, {
        userId: params.userId,
        scope: planScope,
    });

    if (consumedScopes.length > 0) {
        logger.info("Consumed service trials for paid subscription", {
            userId: params.userId,
            planId: params.planId,
            consumedScopes,
        });
    }
}

/**
 * このイベントの Stripe subscription が、ユーザーの subscriptions 行を更新してよいか判定する。
 * 旧い subscription のイベントが、新しい subscription を追跡している行を上書きしないようにする。
 */
async function shouldApplySubscriptionEvent(params: {
    event: Stripe.Event;
    supabaseAdmin: SupabaseClient;
    userId: string;
    subscriptionId: string;
    status: SubscriptionStatus;
}): Promise<boolean> {
    const tracked = await fetchTrackedSubscription(params.supabaseAdmin, params.userId);
    const decision = decideSubscriptionEvent({
        rowSubscriptionId: tracked.stripeSubscriptionId,
        rowStatus: tracked.status,
        eventSubscriptionId: params.subscriptionId,
        eventStatus: params.status,
    });

    if (decision === "apply") {
        return true;
    }

    const metadata = {
        eventId: params.event.id,
        eventType: params.event.type,
        userId: params.userId,
        eventSubscriptionId: params.subscriptionId,
        eventStatus: params.status,
        trackedSubscriptionId: tracked.stripeSubscriptionId,
        trackedStatus: tracked.status,
    };
    if (decision === "ignore_other_live_subscription") {
        // 同じユーザーに有効な Stripe subscription が 2 本ある。二重課金の可能性があるので運用で確認する。
        logger.warn("Webhook ignored: user has another live Stripe subscription", metadata);
    } else {
        logger.info("Webhook ignored: event is about a subscription the row no longer tracks", metadata);
    }
    return false;
}

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

    if (!subscriptionId) {
        logger.warn("checkout.session.completed: session has no subscription", {
            userId,
            sessionId: session.id,
        });
        return;
    }

    // 取得に失敗した場合は throw して Stripe に再送させる
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const status = mapStripeStatus(stripeSubscription.status);
    const currentPeriodEnd = toIso(stripeSubscription.current_period_end) ?? undefined;
    const cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
    const planId = await resolvePlanId(
        supabaseAdmin,
        stripeSubscription.items.data[0]?.price?.id
    );

    const shouldApply = await shouldApplySubscriptionEvent({
        event,
        supabaseAdmin,
        userId,
        subscriptionId,
        status,
    });
    if (!shouldApply) {
        return;
    }

    // upsert に失敗した場合は throw してイベントを未処理に戻し、Stripe に再送させる
    await upsertSubscription(supabaseAdmin, {
        userId,
        customerId,
        subscriptionId,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
    });
    await consumeCoveredServiceTrials({
        userId,
        planId,
        status,
        supabaseAdmin,
    });

    // チームプラン決済時: グループを自動作成
    if (planId?.startsWith("team_")) {
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

    // イベントの到着順は保証されないため、Stripe から最新の状態を取得して反映する。
    // 取得に失敗した場合は throw して Stripe に再送させる。
    const freshSubscription = await stripe.subscriptions.retrieve(subscription.id);
    const status = mapStripeStatus(freshSubscription.status);
    const currentPeriodEnd = toIso(freshSubscription.current_period_end) ?? undefined;
    const cancelAtPeriodEnd = freshSubscription.cancel_at_period_end;
    const priceId = freshSubscription.items.data[0]?.price?.id;
    const planId = await resolvePlanId(supabaseAdmin, priceId);

    const shouldApply = await shouldApplySubscriptionEvent({
        event,
        supabaseAdmin,
        userId,
        subscriptionId: subscription.id,
        status,
    });
    if (!shouldApply) {
        return;
    }

    await upsertSubscription(supabaseAdmin, {
        userId,
        customerId,
        subscriptionId: subscription.id,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
        pastDueGraceUntil:
            status === "past_due"
                ? computePastDueGraceUntil(event.created)
                : undefined,
    });
    await consumeCoveredServiceTrials({
        userId,
        planId,
        status,
        supabaseAdmin,
    });

    const previousSubscription =
        event.data.previous_attributes as Partial<Stripe.Subscription> | undefined;
    await trackSubscriptionCanceled({
        event,
        subscription,
        previousCancelAtPeriodEnd: previousSubscription?.cancel_at_period_end,
        resolvedPlanId: planId,
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

    const shouldApply = await shouldApplySubscriptionEvent({
        event,
        supabaseAdmin,
        userId,
        subscriptionId: subscription.id,
        status,
    });
    if (!shouldApply) {
        return;
    }

    await upsertSubscription(supabaseAdmin, {
        userId,
        customerId,
        subscriptionId: subscription.id,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
    });
    await trackSubscriptionCanceled({
        event,
        subscription,
        resolvedPlanId: planId,
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

    if (!subscriptionId) {
        logger.info("invoice.payment_succeeded: invoice is not for a subscription, skipping", {
            invoiceId: invoice.id,
            customerId,
        });
        return;
    }

    // 取得に失敗した場合は throw して Stripe に再送させる
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const userId = await getUserIdFromCustomer(stripe, customerId, subscription);
    if (!userId) {
        logger.warn("invoice.payment_succeeded: missing userId", {
            customerId,
            subscriptionId,
        });
        return;
    }

    const status = mapStripeStatus(subscription.status);
    const currentPeriodEnd = toIso(subscription.current_period_end) ?? undefined;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end ?? false;

    const priceId =
        invoice.lines.data[0]?.price?.id ??
        subscription.items.data[0]?.price?.id;
    const planId = await resolvePlanId(supabaseAdmin, priceId);

    const shouldApply = await shouldApplySubscriptionEvent({
        event,
        supabaseAdmin,
        userId,
        subscriptionId,
        status,
    });
    if (!shouldApply) {
        return;
    }

    await upsertSubscription(supabaseAdmin, {
        userId,
        customerId,
        subscriptionId,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
        clearPastDueGrace: true,
    });
    await consumeCoveredServiceTrials({
        userId,
        planId,
        status,
        supabaseAdmin,
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

    if (!subscriptionId) {
        logger.info("invoice.payment_failed: invoice is not for a subscription, skipping", {
            invoiceId: invoice.id,
            customerId,
        });
        return;
    }

    // 取得に失敗した場合は throw して Stripe に再送させる
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const userId = await getUserIdFromCustomer(stripe, customerId, subscription);
    if (!userId) {
        logger.warn("invoice.payment_failed: missing userId", {
            customerId,
            subscriptionId,
        });
        return;
    }

    const status = mapStripeStatus(subscription.status ?? "past_due");
    const currentPeriodEnd = toIso(subscription.current_period_end) ?? undefined;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end ?? false;

    const priceId =
        invoice.lines.data[0]?.price?.id ??
        subscription.items.data[0]?.price?.id;
    const planId = await resolvePlanId(supabaseAdmin, priceId);

    const shouldApply = await shouldApplySubscriptionEvent({
        event,
        supabaseAdmin,
        userId,
        subscriptionId,
        status,
    });
    if (!shouldApply) {
        return;
    }

    await upsertSubscription(supabaseAdmin, {
        userId,
        customerId,
        subscriptionId,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
        pastDueGraceUntil:
            status === "past_due"
                ? computePastDueGraceUntil(event.created)
                : undefined,
    });
}
