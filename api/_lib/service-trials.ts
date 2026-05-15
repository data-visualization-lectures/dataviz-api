import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";
import { TRIAL_PERIOD_DAYS } from "./trial.js";
import type {
  AccessibleScope,
  ServiceScope,
  ServiceTrialMap,
  ServiceTrialRecord,
  ServiceTrialScope,
  ServiceTrialStatus,
} from "./types.js";

const SERVICE_TRIAL_SCOPES: readonly AccessibleScope[] = ["viz", "prep"];

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function normalizeServiceTrialScope(
  value: unknown,
): ServiceTrialScope | null {
  return value === "viz" || value === "prep" ? value : null;
}

export function normalizeServiceTrialStatus(
  value: unknown,
): ServiceTrialStatus | null {
  return value === "eligible" || value === "trialing" || value === "expired"
    ? value
    : null;
}

function normalizeServiceTrialRecord(
  value: Partial<ServiceTrialRecord> | null | undefined,
): ServiceTrialRecord | null {
  const scope = normalizeServiceTrialScope(value?.service_scope);
  const status = normalizeServiceTrialStatus(value?.status);
  const userId =
    typeof value?.user_id === "string" && value.user_id.trim().length > 0
      ? value.user_id
      : null;

  if (!scope || !status || !userId) {
    return null;
  }

  return {
    user_id: userId,
    service_scope: scope,
    status,
    started_at:
      typeof value?.started_at === "string" ? value.started_at : null,
    current_period_end:
      typeof value?.current_period_end === "string"
        ? value.current_period_end
        : null,
    expired_at:
      typeof value?.expired_at === "string" ? value.expired_at : null,
    created_at:
      typeof value?.created_at === "string" ? value.created_at : undefined,
    updated_at:
      typeof value?.updated_at === "string" ? value.updated_at : undefined,
  };
}

export function createEmptyServiceTrialMap(): ServiceTrialMap {
  return {
    viz: null,
    prep: null,
  };
}

export function mapServiceTrials(
  records: Array<Partial<ServiceTrialRecord> | null | undefined>,
): ServiceTrialMap {
  const mapped = createEmptyServiceTrialMap();

  for (const record of records) {
    const normalized = normalizeServiceTrialRecord(record);
    if (!normalized) {
      continue;
    }
    mapped[normalized.service_scope] = normalized;
  }

  return mapped;
}

export async function fetchServiceTrialsForUser(
  client: SupabaseClient,
  userId: string,
): Promise<ServiceTrialMap> {
  const { data, error } = await client
    .from("service_trials")
    .select(
      "user_id, service_scope, status, started_at, current_period_end, expired_at, created_at, updated_at",
    )
    .eq("user_id", userId);

  if (error) {
    logger.error("fetchServiceTrialsForUser failed", error, { userId });
    throw error;
  }

  return mapServiceTrials((data ?? []) as Array<Partial<ServiceTrialRecord>>);
}

export function hasEligibleServiceTrial(
  record: Pick<ServiceTrialRecord, "status"> | null | undefined,
): boolean {
  return record?.status === "eligible";
}

export function isServiceTrialActive(
  record: Pick<ServiceTrialRecord, "status" | "current_period_end"> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (record?.status !== "trialing") {
    return false;
  }

  const periodEnd = parseDate(record.current_period_end);
  return !!periodEnd && periodEnd >= now;
}

export function shouldExpireServiceTrial(
  record: Pick<ServiceTrialRecord, "status" | "current_period_end">,
  now: Date = new Date(),
): boolean {
  if (record.status !== "trialing") {
    return false;
  }

  const periodEnd = parseDate(record.current_period_end);
  return !periodEnd || periodEnd < now;
}

export function getActiveServiceTrialScopes(
  serviceTrials: ServiceTrialMap | null | undefined,
  now: Date = new Date(),
): AccessibleScope[] {
  if (!serviceTrials) {
    return [];
  }

  return SERVICE_TRIAL_SCOPES.filter((scope) =>
    isServiceTrialActive(serviceTrials[scope], now),
  );
}

export async function expireServiceTrialIfNeeded(
  client: SupabaseClient,
  record: ServiceTrialRecord,
  now: Date,
): Promise<boolean> {
  if (!shouldExpireServiceTrial(record, now)) {
    return false;
  }

  const nowIso = now.toISOString();
  const { error } = await client
    .from("service_trials")
    .update({
      status: "expired",
      expired_at: nowIso,
      updated_at: nowIso,
    })
    .eq("user_id", record.user_id)
    .eq("service_scope", record.service_scope)
    .eq("status", "trialing");

  if (error) {
    logger.error("expireServiceTrialIfNeeded update failed", error, {
      userId: record.user_id,
      serviceScope: record.service_scope,
    });
    throw error;
  }

  logger.info("Service trial expired", {
    userId: record.user_id,
    serviceScope: record.service_scope,
  });
  return true;
}

export async function expireServiceTrialsForUserIfNeeded(
  client: SupabaseClient,
  userId: string,
  serviceTrials: ServiceTrialMap,
  now: Date,
): Promise<ServiceTrialMap> {
  let changed = false;

  for (const scope of SERVICE_TRIAL_SCOPES) {
    const trial = serviceTrials[scope];
    if (!trial) {
      continue;
    }

    if (await expireServiceTrialIfNeeded(client, trial, now)) {
      changed = true;
    }
  }

  if (!changed) {
    return serviceTrials;
  }

  return fetchServiceTrialsForUser(client, userId);
}

export async function startEligibleServiceTrial(
  client: SupabaseClient,
  userId: string,
  scope: AccessibleScope,
  now: Date = new Date(),
): Promise<ServiceTrialRecord | null> {
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_PERIOD_DAYS);

  const nowIso = now.toISOString();
  const { data, error } = await client
    .from("service_trials")
    .update({
      status: "trialing",
      started_at: nowIso,
      current_period_end: trialEnd.toISOString(),
      expired_at: null,
      updated_at: nowIso,
    })
    .eq("user_id", userId)
    .eq("service_scope", scope)
    .eq("status", "eligible")
    .select(
      "user_id, service_scope, status, started_at, current_period_end, expired_at, created_at, updated_at",
    )
    .maybeSingle();

  if (error) {
    logger.error("startEligibleServiceTrial failed", error, {
      userId,
      scope,
    });
    throw error;
  }

  return normalizeServiceTrialRecord(data as Partial<ServiceTrialRecord> | null);
}

export function resolveServiceTrialConsumptionScopes(
  scope: ServiceScope | null | undefined,
): AccessibleScope[] {
  if (scope === "bundle") {
    return ["viz", "prep"];
  }
  if (scope === "viz" || scope === "prep") {
    return [scope];
  }
  return [];
}

export async function consumeServiceTrialsForPaidScope(
  client: SupabaseClient,
  params: {
    userId: string;
    scope: ServiceScope | null | undefined;
    now?: Date;
  },
): Promise<AccessibleScope[]> {
  const scopes = resolveServiceTrialConsumptionScopes(params.scope);
  if (scopes.length === 0) {
    return [];
  }

  const nowIso = (params.now ?? new Date()).toISOString();
  const { data, error } = await client
    .from("service_trials")
    .update({
      status: "expired",
      expired_at: nowIso,
      updated_at: nowIso,
    })
    .eq("user_id", params.userId)
    .in("service_scope", scopes)
    .in("status", ["eligible", "trialing"])
    .select("service_scope");

  if (error) {
    logger.error("consumeServiceTrialsForPaidScope failed", error, {
      userId: params.userId,
      scope: params.scope,
    });
    throw error;
  }

  return Array.from(
    new Set(
      ((data ?? []) as Array<{ service_scope?: unknown }>)
        .map((row) => normalizeServiceTrialScope(row.service_scope))
        .filter((scope): scope is AccessibleScope => scope !== null),
    ),
  );
}
