import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import {
  resolveSubscriptionCanceledAnalytics,
} from "./subscription-canceled-analytics.ts";

type SubscriptionForTest = Pick<
  Stripe.Subscription,
  "id" | "cancel_at_period_end" | "metadata" | "cancellation_details"
>;

function subscription(
  overrides: Partial<SubscriptionForTest> = {},
): SubscriptionForTest {
  return {
    id: "sub_123",
    cancel_at_period_end: false,
    metadata: { plan_id: "bundle_monthly_jpy" },
    cancellation_details: {
      feedback: null,
      reason: "cancellation_requested",
      comment: null,
    },
    ...overrides,
  };
}

test("scheduled cancellation is emitted only on the false-to-true transition", () => {
  const signal = resolveSubscriptionCanceledAnalytics({
    eventType: "customer.subscription.updated",
    eventCreated: 1_750_000_000,
    subscription: subscription({ cancel_at_period_end: true }),
    previousCancelAtPeriodEnd: false,
    resolvedPlanId: "viz_monthly_jpy",
  });

  assert.deepEqual(signal, {
    clientSeed: "stripe-subscription:sub_123",
    timestampMicros: 1_750_000_000_000_000,
    params: {
      plan: "viz_monthly_jpy",
      reason: "cancellation_requested",
      cancellation_mode: "scheduled",
    },
  });

  assert.equal(
    resolveSubscriptionCanceledAnalytics({
      eventType: "customer.subscription.updated",
      eventCreated: 1_750_000_000,
      subscription: subscription({ cancel_at_period_end: true }),
      previousCancelAtPeriodEnd: true,
    }),
    null,
  );
});

test("immediate deletion emits a cancellation event", () => {
  assert.deepEqual(
    resolveSubscriptionCanceledAnalytics({
      eventType: "customer.subscription.deleted",
      eventCreated: 1_750_000_000,
      subscription: subscription({
        cancellation_details: {
          feedback: "too_expensive",
          reason: "cancellation_requested",
          comment: null,
        },
      }),
    })?.params,
    {
      plan: "bundle_monthly_jpy",
      reason: "too_expensive",
      cancellation_mode: "immediate",
    },
  );
});

test("period-end deletion does not duplicate a scheduled cancellation", () => {
  assert.equal(
    resolveSubscriptionCanceledAnalytics({
      eventType: "customer.subscription.deleted",
      eventCreated: 1_750_000_000,
      subscription: subscription({ cancel_at_period_end: true }),
    }),
    null,
  );
});

test("missing plan and reason use non-empty fallbacks", () => {
  assert.deepEqual(
    resolveSubscriptionCanceledAnalytics({
      eventType: "customer.subscription.deleted",
      eventCreated: 1_750_000_000,
      subscription: subscription({
        metadata: {},
        cancellation_details: null,
      }),
    })?.params,
    {
      plan: "unknown",
      reason: "immediate",
      cancellation_mode: "immediate",
    },
  );
});
