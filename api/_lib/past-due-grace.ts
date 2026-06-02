import type { SubscriptionRecord, SubscriptionStatus } from "./types.js";

export const PAST_DUE_GRACE_DAYS = 7;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function computePastDueGraceUntil(
  eventCreatedEpochSeconds: number,
  graceDays = PAST_DUE_GRACE_DAYS,
): string {
  const graceUntil = new Date(eventCreatedEpochSeconds * 1000);
  graceUntil.setDate(graceUntil.getDate() + graceDays);
  return graceUntil.toISOString();
}

export function isPastDueWithinGrace(
  subscription:
    | Pick<SubscriptionRecord, "status" | "past_due_grace_until">
    | null
    | undefined,
  now: Date = new Date(),
): boolean {
  if (subscription?.status !== "past_due") {
    return false;
  }

  const graceUntil = parseDate(subscription.past_due_grace_until);
  return !!graceUntil && graceUntil >= now;
}

export function hasActiveSubscriptionAccess(
  subscription:
    | Pick<SubscriptionRecord, "status" | "past_due_grace_until">
    | null
    | undefined,
  now: Date = new Date(),
): boolean {
  return (
    subscription?.status === "active" ||
    subscription?.status === "trialing" ||
    isPastDueWithinGrace(subscription, now)
  );
}

export function resolvePastDueGraceUntilForUpsert(params: {
  status: SubscriptionStatus | undefined;
  existingPastDueGraceUntil?: string | null;
  candidatePastDueGraceUntil?: string | null;
}): string | null | undefined {
  if (params.status === undefined) {
    return undefined;
  }

  if (params.status !== "past_due") {
    return null;
  }

  if (params.candidatePastDueGraceUntil === undefined) {
    return undefined;
  }

  return params.existingPastDueGraceUntil || params.candidatePastDueGraceUntil;
}
