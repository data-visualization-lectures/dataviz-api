import type Stripe from "stripe";

export type SubscriptionCancellationMode = "scheduled" | "immediate";

export type SubscriptionCanceledAnalytics = {
  clientSeed: string;
  timestampMicros: number;
  params: {
    plan: string;
    reason: string;
    cancellation_mode: SubscriptionCancellationMode;
  };
};

type SubscriptionForCancellation = Pick<
  Stripe.Subscription,
  "id" | "cancel_at_period_end" | "metadata" | "cancellation_details"
>;

export function resolveSubscriptionCanceledAnalytics(params: {
  eventType:
    | "customer.subscription.updated"
    | "customer.subscription.deleted";
  eventCreated: number;
  subscription: SubscriptionForCancellation;
  previousCancelAtPeriodEnd?: boolean;
  resolvedPlanId?: string;
}): SubscriptionCanceledAnalytics | null {
  const {
    eventType,
    eventCreated,
    subscription,
    previousCancelAtPeriodEnd,
    resolvedPlanId,
  } = params;

  let cancellationMode: SubscriptionCancellationMode;

  if (eventType === "customer.subscription.updated") {
    if (
      subscription.cancel_at_period_end !== true ||
      previousCancelAtPeriodEnd !== false
    ) {
      return null;
    }
    cancellationMode = "scheduled";
  } else {
    if (subscription.cancel_at_period_end === true) {
      return null;
    }
    cancellationMode = "immediate";
  }

  const cancellationDetails = subscription.cancellation_details;
  const reason =
    cancellationDetails?.feedback ??
    cancellationDetails?.reason ??
    cancellationMode;

  return {
    clientSeed: `stripe-subscription:${subscription.id}`,
    timestampMicros: eventCreated * 1_000_000,
    params: {
      plan: resolvedPlanId ?? subscription.metadata?.plan_id ?? "unknown",
      reason,
      cancellation_mode: cancellationMode,
    },
  };
}
