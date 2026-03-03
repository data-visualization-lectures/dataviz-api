// api/delete-account.ts
// アカウント削除 API

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { createStripeClient } from "./_lib/stripe.js";
import { removeProjectFiles } from "./_lib/projects-storage.js";
import { logger } from "./_lib/logger.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (handleCorsAndMethods(req, res, ["POST"])) {
        return;
    }

    try {
        const user = await getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: "unauthorized" });
        }

        const userId = user.id;
        logger.info("Account deletion started", { userId });

        // 1. Storage ファイルの削除
        const { data: projects, error: projectsError } = await supabaseAdmin
            .from("projects")
            .select("storage_path, thumbnail_path")
            .eq("user_id", userId);

        if (projectsError) {
            logger.error("Failed to fetch projects for deletion", projectsError as unknown as Error, { userId });
            throw projectsError;
        }

        if (projects && projects.length > 0) {
            const filesToRemove: string[] = [];
            for (const p of projects) {
                if (p.storage_path) filesToRemove.push(p.storage_path);
                if (p.thumbnail_path) filesToRemove.push(p.thumbnail_path);
            }

            if (filesToRemove.length > 0) {
                const { error: storageError } = await removeProjectFiles(filesToRemove);
                if (storageError) {
                    logger.warn("Storage file removal partially failed", { userId, error: storageError });
                    // Storage 削除失敗はユーザー削除をブロックしない
                }
                logger.info("Storage files removed", { userId, count: filesToRemove.length });
            }
        }

        // 2. Stripe Customer の削除
        const { data: subscription } = await supabaseAdmin
            .from("subscriptions")
            .select("stripe_customer_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (subscription?.stripe_customer_id) {
            try {
                const stripe = createStripeClient();
                await stripe.customers.del(subscription.stripe_customer_id);
                logger.info("Stripe customer deleted", { userId, customerId: subscription.stripe_customer_id });
            } catch (stripeErr: any) {
                logger.warn("Stripe customer deletion failed", { userId, error: stripeErr?.message });
                // Stripe 削除失敗はユーザー削除をブロックしない
            }
        }

        // 3. DB レコードを明示的に削除（CASCADE だけに頼らない防御的アプローチ）
        const { error: subDelError } = await supabaseAdmin
            .from("subscriptions")
            .delete()
            .eq("user_id", userId);
        if (subDelError) {
            logger.warn("Subscriptions deletion failed", { userId, error: subDelError.message });
        } else {
            logger.info("Subscriptions deleted", { userId });
        }

        const { error: projDelError } = await supabaseAdmin
            .from("projects")
            .delete()
            .eq("user_id", userId);
        if (projDelError) {
            logger.warn("Projects deletion failed", { userId, error: projDelError.message });
        } else {
            logger.info("Projects deleted", { userId });
        }

        const { error: profDelError } = await supabaseAdmin
            .from("profiles")
            .delete()
            .eq("id", userId);
        if (profDelError) {
            logger.warn("Profiles deletion failed", { userId, error: profDelError.message });
        } else {
            logger.info("Profiles deleted", { userId });
        }

        // 4. Supabase Auth ユーザー削除（明示的に hard delete を指定）
        const { data: deleteData, error: deleteError } =
            await supabaseAdmin.auth.admin.deleteUser(userId, false);
        logger.info("deleteUser response", {
            userId,
            data: deleteData,
            error: deleteError,
        });
        if (deleteError) {
            logger.error("User deletion failed", deleteError as unknown as Error, { userId });
            throw deleteError;
        }

        logger.info("Account deleted successfully", { userId });
        return res.status(200).json({ success: true });
    } catch (err: any) {
        logger.error("Delete account handler error", err as Error);
        return res
            .status(500)
            .json({ error: "internal_error", detail: err?.message ?? String(err) });
    }
}
