// api/_lib/webhook-handlers.ts
// Stripe Webhook イベントハンドラー

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
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
        console.warn(
            "checkout.session.completed: missing userId or customerId",
            { userId, customerId }
        );
        return; // Stripe には 200 を返してリトライループを防ぐ
    }

    let status = mapStripeStatus("active");
    let currentPeriodEnd: string | null | undefined = undefined;
    let cancelAtPeriodEnd: boolean | null = false;
    let planId: string | undefined = undefined;

    if (subscriptionId) {
        try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            status = mapStripeStatus(subscription.status);
            currentPeriodEnd = toIso(subscription.current_period_end) ?? undefined;
            cancelAtPeriodEnd = subscription.cancel_at_period_end;
            const priceId =
                subscription.items.data[0]?.price?.id ??
                (session?.line_items as any)?.data?.[0]?.price?.id;
            planId = await resolvePlanId(supabaseAdmin, priceId);
        } catch (err) {
            console.error("checkout.session.completed: retrieve subscription failed", err);
        }
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
        console.error("checkout.session.completed upsert error:", error);
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
        console.warn("subscription.updated: missing userId", { customerId });
        return;
    }

    const status = mapStripeStatus(subscription.status);
    const currentPeriodEnd = toIso(subscription.current_period_end) ?? undefined;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    console.log(
        `[Webhook] subscription.updated: subId=${subscription.id}, status=${status}, cancelAtPeriodEnd=${cancelAtPeriodEnd}`
    );
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
        console.warn("subscription.deleted: missing userId", { customerId });
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
            console.error("invoice.payment_succeeded: retrieve subscription failed", err);
        }
    }

    const userId = await getUserIdFromCustomer(stripe, customerId, subscription);
    if (!userId) {
        console.warn("invoice.payment_succeeded: missing userId", {
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
            console.error("invoice.payment_failed: retrieve subscription failed", err);
        }
    }

    const userId = await getUserIdFromCustomer(stripe, customerId, subscription);
    if (!userId) {
        console.warn("invoice.payment_failed: missing userId", {
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
