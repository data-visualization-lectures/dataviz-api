// api/_lib/group.ts

import { supabaseAdmin } from "./supabase.js";
import { combineServiceScopes } from "./entitlements.js";
import type { ServiceScope } from "./types.js";

function normalizeServiceScope(scope: unknown): ServiceScope | null {
    return scope === "viz" || scope === "prep" || scope === "bundle"
        ? scope
        : null;
}

function latestCurrentPeriodEnd(values: Array<unknown>): string | null {
    const dates = values
        .filter((value): value is string => typeof value === "string")
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => b.getTime() - a.getTime());

    return dates[0]?.toISOString() ?? null;
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

    // owner のサブスクが active かつ実 team_* プランかチェック。
    // 仮想 plan_id の team_member は継承元として扱わない。
    const { data: subscriptions } = await supabaseAdmin
        .from("subscriptions")
        .select("status, current_period_end, plan_id")
        .in("user_id", ownerIds)
        .eq("status", "active")
        .like("plan_id", "team_%")
        .neq("plan_id", "team_member");

    if (!subscriptions || subscriptions.length === 0) return null;

    const planIds = [
        ...new Set(
            subscriptions
                .map((subscription) =>
                    typeof subscription.plan_id === "string" ? subscription.plan_id : null
                )
                .filter((planId): planId is string => Boolean(planId))
        ),
    ];
    const { data: plans } = planIds.length > 0
        ? await supabaseAdmin
            .from("plans")
            .select("id, scope")
            .in("id", planIds)
        : { data: [] };
    const scopeByPlanId = new Map(
        ((plans ?? []) as Array<{ id: string; scope: unknown }>).map((plan) => [
            plan.id,
            normalizeServiceScope(plan.scope),
        ])
    );

    return {
        current_period_end: latestCurrentPeriodEnd(
            subscriptions.map((subscription) => subscription.current_period_end)
        ),
        plan_id: planIds[0] ?? null,
        scope: combineServiceScopes(
            subscriptions.map((subscription) =>
                typeof subscription.plan_id === "string"
                    ? scopeByPlanId.get(subscription.plan_id)
                    : null
            )
        ),
    };
}
