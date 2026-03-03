// api/billing-cancel-and-refund.ts
// 初回14日以内の解約・全額返金 API

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { createStripeClient } from "./_lib/stripe.js";
import { logger } from "./_lib/logger.js";

const REFUND_PERIOD_DAYS = 14;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (handleCorsAndMethods(req, res, ["POST"])) {
        return;
    }

    try {
        // 1. 認証チェック
        const user = await getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: "not_authenticated" });
        }

        const userId = user.id;

        // 2. subscriptions テーブルからレコード取得
        const { data: subscription, error: subError } = await supabaseAdmin
            .from("subscriptions")
            .select("status, stripe_subscription_id, stripe_customer_id, refunded_at")
            .eq("user_id", userId)
            .maybeSingle();

        if (subError) {
            logger.error("Failed to fetch subscription", subError as unknown as Error, { userId });
            throw subError;
        }

        // 3. 事前バリデーション
        if (!subscription || subscription.status !== "active") {
            return res.status(400).json({ error: "no_active_subscription" });
        }

        if (!subscription.stripe_subscription_id) {
            return res.status(400).json({ error: "no_stripe_subscription" });
        }

        if (subscription.refunded_at) {
            return res.status(403).json({ error: "refund_already_used" });
        }

        const stripe = createStripeClient();
        const stripeSubscriptionId = subscription.stripe_subscription_id;

        // 4. Stripe 最新 Invoice 取得 + 14日判定
        const invoices = await stripe.invoices.list({
            subscription: stripeSubscriptionId,
            limit: 1,
        });

        const latestInvoice = invoices.data[0];
        if (!latestInvoice || !latestInvoice.payment_intent) {
            return res.status(400).json({ error: "no_invoice_found" });
        }

        const invoiceCreatedAt = latestInvoice.created * 1000; // epoch秒 → ミリ秒
        const now = Date.now();
        const daysSincePayment = (now - invoiceCreatedAt) / (1000 * 60 * 60 * 24);

        if (daysSincePayment > REFUND_PERIOD_DAYS) {
            return res.status(403).json({ error: "refund_period_expired" });
        }

        logger.info("Refund eligible", {
            userId,
            daysSincePayment: Math.floor(daysSincePayment),
            invoiceId: latestInvoice.id,
        });

        // 5. 全額返金
        const paymentIntentId = typeof latestInvoice.payment_intent === "string"
            ? latestInvoice.payment_intent
            : latestInvoice.payment_intent.id;

        try {
            await stripe.refunds.create({ payment_intent: paymentIntentId });
            logger.info("Refund created", { userId, paymentIntentId });
        } catch (refundErr: any) {
            logger.error("Stripe refund failed", refundErr as Error, { userId, paymentIntentId });
            return res.status(500).json({ error: "refund_failed", detail: refundErr?.message });
        }

        // 6. サブスクリプションキャンセル
        try {
            await stripe.subscriptions.cancel(stripeSubscriptionId);
            logger.info("Subscription canceled", { userId, stripeSubscriptionId });
        } catch (cancelErr: any) {
            // 返金は成功済みなのでキャンセル失敗はログに残して続行
            logger.error("Subscription cancel failed after refund", cancelErr as Error, {
                userId,
                stripeSubscriptionId,
            });
        }

        // 7. Supabase 更新
        const { error: updateError } = await supabaseAdmin
            .from("subscriptions")
            .update({
                status: "canceled",
                refunded_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);

        if (updateError) {
            logger.error("Subscription DB update failed after refund", updateError as unknown as Error, { userId });
            // 返金・キャンセルは成功済みなので DB 更新失敗でも成功を返す
        }

        logger.info("Cancel and refund completed", { userId });
        return res.status(200).json({ success: true });
    } catch (err: any) {
        logger.error("billing-cancel-and-refund handler error", err as Error);
        return res
            .status(500)
            .json({ error: "internal_error", detail: err?.message ?? String(err) });
    }
}
