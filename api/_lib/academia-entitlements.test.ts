import test from "node:test";
import assert from "node:assert/strict";

import { applyAcademiaSubscriptionOverride } from "./academia-entitlements.ts";

const NOW = new Date("2026-07-02T00:00:00.000Z");

test("applyAcademiaSubscriptionOverride leaves non-academia users unchanged", () => {
  assert.equal(
    applyAcademiaSubscriptionOverride({
      subscription: null,
      userId: "user_1",
      isAcademia: false,
      now: NOW,
    }),
    null,
  );

  const subscription = {
    user_id: "user_1",
    status: "canceled" as const,
    plan_id: "viz_monthly_jpy",
  };
  assert.equal(
    applyAcademiaSubscriptionOverride({
      subscription,
      userId: "user_1",
      isAcademia: false,
      now: NOW,
    }),
    subscription,
  );
});

test("applyAcademiaSubscriptionOverride creates active academia access when no subscription exists", () => {
  assert.deepEqual(
    applyAcademiaSubscriptionOverride({
      subscription: null,
      userId: "user_academia",
      isAcademia: true,
      now: NOW,
    }),
    {
      user_id: "user_academia",
      status: "active",
      plan_id: "academia",
      current_period_end: null,
      created_at: "2026-07-02T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:00.000Z",
    },
  );
});

test("applyAcademiaSubscriptionOverride upgrades inactive subscriptions for academia users", () => {
  assert.deepEqual(
    applyAcademiaSubscriptionOverride({
      subscription: {
        id: "sub_1",
        user_id: "user_academia",
        status: "past_due",
        plan_id: "viz_monthly_jpy",
        current_period_end: "2026-06-01T00:00:00.000Z",
        stripe_subscription_id: "stripe_sub_1",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      userId: "user_academia",
      isAcademia: true,
      now: NOW,
    }),
    {
      id: "sub_1",
      user_id: "user_academia",
      status: "active",
      plan_id: "academia",
      current_period_end: null,
      stripe_subscription_id: "stripe_sub_1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:00.000Z",
    },
  );
});

test("applyAcademiaSubscriptionOverride does not replace an active paid subscription", () => {
  const subscription = {
    user_id: "user_academia",
    status: "active" as const,
    plan_id: "prep_monthly_jpy",
    current_period_end: "2026-08-01T00:00:00.000Z",
  };

  assert.equal(
    applyAcademiaSubscriptionOverride({
      subscription,
      userId: "user_academia",
      isAcademia: true,
      now: NOW,
    }),
    subscription,
  );
});
