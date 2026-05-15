import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";
import {
  resolveCanonicalPlanId as resolveCanonicalPlanIdFromCatalog,
  resolveKnownPlanMetadata,
  type BillingInterval,
} from "./plan-catalog.js";
import type { PlanRecord, ServiceScope } from "./types.js";

export function normalizePlanScope(
  scope: string | null | undefined,
): ServiceScope | null {
  if (scope === "viz" || scope === "prep" || scope === "bundle") {
    return scope;
  }
  return null;
}

export interface ResolvedPlanRecord {
  planId: string;
  canonicalPlanId: string;
  scope: ServiceScope | null;
  stripePriceId: string | null;
  amount: number | null;
  currency: string | null;
  name: string | null;
  billingInterval: BillingInterval | null;
  isTeamPlan: boolean;
}

export function normalizeCanonicalPlanId(
  canonicalPlanId: string | null | undefined,
  planId: string | null | undefined,
): string | null {
  if (typeof canonicalPlanId === "string" && canonicalPlanId.trim().length > 0) {
    return canonicalPlanId;
  }

  return resolveCanonicalPlanIdFromCatalog(planId);
}

function inferBillingInterval(
  planId: string | null | undefined,
): BillingInterval | null {
  if (!planId) {
    return null;
  }

  if (planId.includes("yearly")) {
    return "yearly";
  }
  if (planId.includes("monthly")) {
    return "monthly";
  }

  return null;
}

function toResolvedPlanRecord(
  row: (Partial<PlanRecord> & { id?: string | null; canonical_plan_id?: string | null }) | null,
  fallbackPlanId?: string | null,
): ResolvedPlanRecord | null {
  const planId = row?.id ?? fallbackPlanId ?? null;
  if (!planId) {
    return null;
  }

  const catalogMetadata = resolveKnownPlanMetadata(planId);

  return {
    planId,
    canonicalPlanId:
      normalizeCanonicalPlanId(row?.canonical_plan_id, planId) ?? planId,
    scope: normalizePlanScope(row?.scope) ?? catalogMetadata?.scope ?? null,
    stripePriceId:
      typeof row?.stripe_price_id === "string" && row.stripe_price_id.trim().length > 0
        ? row.stripe_price_id
        : null,
    amount:
      typeof row?.amount === "number"
        ? row.amount
        : null,
    currency:
      typeof row?.currency === "string"
        ? row.currency
        : catalogMetadata?.currency ?? null,
    name:
      typeof row?.name === "string"
        ? row.name
        : planId,
    billingInterval: catalogMetadata?.billingInterval ?? inferBillingInterval(planId),
    isTeamPlan: catalogMetadata?.isTeamPlan ?? planId.startsWith("team_"),
  };
}

export async function fetchPlanRecord(
  planId: string | null | undefined,
  client: SupabaseClient = supabaseAdmin,
): Promise<ResolvedPlanRecord | null> {
  if (!planId) {
    return null;
  }

  const { data, error } = await client
    .from("plans")
    .select("id, stripe_price_id, canonical_plan_id, scope, amount, currency, name")
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    logger.error("fetchPlanRecord failed", error, { planId });
  }

  return toResolvedPlanRecord(data, planId);
}

export async function fetchPlanRecordByPriceId(
  priceId: string | null | undefined,
  client: SupabaseClient = supabaseAdmin,
): Promise<ResolvedPlanRecord | null> {
  if (!priceId) {
    return null;
  }

  const { data, error } = await client
    .from("plans")
    .select("id, stripe_price_id, canonical_plan_id, scope, amount, currency, name")
    .eq("stripe_price_id", priceId)
    .maybeSingle();

  if (error) {
    logger.error("fetchPlanRecordByPriceId failed", error, { priceId });
  }

  return toResolvedPlanRecord(data);
}

export async function fetchPlanScope(
  planId: string | null | undefined,
  client: SupabaseClient = supabaseAdmin,
): Promise<ServiceScope | null> {
  return (await fetchPlanRecord(planId, client))?.scope ?? null;
}
