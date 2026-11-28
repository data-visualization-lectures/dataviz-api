// api/_lib/webhook-subscription-identity.ts
// subscriptions has one row per user, but a user can have more than one
// Stripe subscription over time (re-subscribing after a cancellation, or
// checking out again while an old one is still past_due). This decides
// whether a webhook about one Stripe subscription may overwrite the row.

import type { SubscriptionStatus } from "./types.js";

export type SubscriptionEventDecision =
  | "apply"
  | "ignore_stale_subscription"
  | "ignore_other_live_subscription";

const LIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
  "past_due",
]);

const IN_GOOD_STANDING: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
]);

export function isLiveSubscriptionStatus(
  status: SubscriptionStatus | null | undefined,
): boolean {
  return !!status && LIVE_STATUSES.has(status);
}

export function decideSubscriptionEvent(params: {
  rowSubscriptionId: string | null | undefined;
  rowStatus: SubscriptionStatus | null | undefined;
  eventSubscriptionId: string;
  eventStatus: SubscriptionStatus;
}): SubscriptionEventDecision {
  const { rowSubscriptionId, rowStatus, eventSubscriptionId, eventStatus } = params;

  // No Stripe subscription recorded yet, or the event is about the one we track.
  if (!rowSubscriptionId || rowSubscriptionId === eventSubscriptionId) {
    return "apply";
  }

  // A different subscription that has ended (or never started) must not
  // overwrite the row: e.g. the old subscription's deletion after the user
  // already checked out a new one.
  if (!isLiveSubscriptionStatus(eventStatus)) {
    return "ignore_stale_subscription";
  }

  // The tracked subscription has ended or is not in good standing, and a
  // different one is live: switch the row to the new subscription.
  if (!rowStatus || !IN_GOOD_STANDING.has(rowStatus)) {
    // Do not replace a past_due row with another past_due subscription.
    if (rowStatus === "past_due" && !IN_GOOD_STANDING.has(eventStatus)) {
      return "ignore_other_live_subscription";
    }
    return "apply";
  }

  // Both subscriptions are live and the tracked one is in good standing.
  // Keep the tracked one; the other is reported for manual follow-up.
  return "ignore_other_live_subscription";
}
