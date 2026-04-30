import { supabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";
import type { ServiceScope } from "./types.js";

export function normalizePlanScope(
  scope: string | null | undefined,
): ServiceScope | null {
  if (scope === "viz" || scope === "prep" || scope === "bundle") {
    return scope;
  }
  return null;
}

export async function fetchPlanScope(
  planId: string | null | undefined,
): Promise<ServiceScope | null> {
  if (!planId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("scope")
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    logger.error("fetchPlanScope failed", error, { planId });
    return null;
  }

  return normalizePlanScope(data?.scope);
}
