// api/cron-expire-subscriptions.ts
// Vercel Scheduled Function: サブスクリプション期限切れの一括更新

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_lib/supabase.js";
import { logger } from "./_lib/logger.js";

function isAuthorizedCron(req: VercelRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return true;
  }

  const authHeader =
    (req.headers["authorization"] as string | undefined) ??
    (req.headers["Authorization"] as string | undefined);

  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length) === cronSecret;
  }

  const vercelCronHeader = req.headers["x-vercel-cron"];
  if (vercelCronHeader === "1") {
    return true;
  }

  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const { data: canceledByPeriodEnd, error: periodEndError } =
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "canceled",
          updated_at: nowIso,
        })
        .eq("cancel_at_period_end", true)
        .lt("current_period_end", nowIso)
        .neq("status", "canceled")
        .select("user_id");

    if (periodEndError) {
      logger.error("cron: period-end update failed", periodEndError);
    }

    const { data: canceledTrials, error: trialError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "canceled",
        updated_at: nowIso,
      })
      .eq("status", "trialing")
      .lt("current_period_end", nowIso)
      .select("user_id");

    if (trialError) {
      logger.error("cron: trial update failed", trialError);
    }

    const { count: staleActiveCount, error: staleActiveError } =
      await supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("cancel_at_period_end", false)
        .lt("current_period_end", nowIso)
        .neq("status", "canceled");

    if (staleActiveError) {
      logger.error("cron: stale-active count failed", staleActiveError);
    }

    return res.status(200).json({
      now: nowIso,
      expired_by_period_end: canceledByPeriodEnd?.length ?? 0,
      expired_trials: canceledTrials?.length ?? 0,
      stale_active_count: staleActiveCount ?? 0,
    });
  } catch (err) {
    logger.error("cron: unexpected error", err as Error);
    return res.status(500).json({ error: "internal_error" });
  }
}
