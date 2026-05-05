// api/_lib/group.ts

import { supabaseAdmin } from "./supabase.js";
import type { ServiceScope } from "./types.js";

function normalizeServiceScope(scope: unknown): ServiceScope | null {
    return scope === "viz" || scope === "prep" || scope === "bundle"
        ? scope
        : null;
}

/**
 * ユーザーの所属グループ情報を返す
 */
export async function getUserGroups(userId: string): Promise<
    { group_id: string; role: string; group_name: string }[]
> {
    const { data } = await supabaseAdmin
        .from("group_members")
        .select("group_id, role, groups(name)")
        .eq("user_id", userId);

    return (data ?? []).map((row: any) => ({
        group_id: row.group_id,
        role: row.role,
        group_name: row.groups?.name ?? "",
    }));
}

/**
 * ユーザーが所属するグループIDの一覧を返す
 */
export async function getUserGroupIds(userId: string): Promise<string[]> {
    const { data } = await supabaseAdmin
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);

    return (data ?? []).map((d) => d.group_id);
}

/**
 * ユーザーがownerであるグループIDを返す（保存先選択用）
 */
export async function getLeaderGroupIds(userId: string): Promise<string[]> {
    const { data } = await supabaseAdmin
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId)
        .eq("role", "owner");

    return (data ?? []).map((d) => d.group_id);
}

/**
 * ユーザーが所属するグループの owner に
 * 「active かつ team_* プラン」のサブスクがあるか確認し、
 * あればそのサブスク情報を返す。
 */
export async function getActiveGroupSubscription(userId: string): Promise<
    { current_period_end: string | null; plan_id: string | null; scope: ServiceScope | null } | null
> {
    // ユーザーが所属するグループを取得
    const { data: memberships } = await supabaseAdmin
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);

    if (!memberships || memberships.length === 0) return null;

    const groupIds = memberships.map((m) => m.group_id);

    // 各グループのownerを取得
    const { data: owners } = await supabaseAdmin
        .from("group_members")
        .select("user_id")
        .in("group_id", groupIds)
        .eq("role", "owner");

    if (!owners || owners.length === 0) return null;

    const ownerIds = [...new Set(owners.map((o) => o.user_id))];

    // owner のサブスクが active かつ team_* プランかチェック
    const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("status, current_period_end, plan_id")
        .in("user_id", ownerIds)
        .eq("status", "active")
        .like("plan_id", "team_%")
        .limit(1)
        .maybeSingle();

    if (!subscription) return null;

    const planId =
        typeof subscription.plan_id === "string" ? subscription.plan_id : null;
    const { data: plan } = planId
        ? await supabaseAdmin
            .from("plans")
            .select("scope")
            .eq("id", planId)
            .maybeSingle()
        : { data: null };

    return {
        current_period_end:
            typeof subscription.current_period_end === "string"
                ? subscription.current_period_end
                : null,
        plan_id: planId,
        scope: normalizeServiceScope(plan?.scope),
    };
}
