import test from "node:test";
import assert from "node:assert/strict";

import { hasLiveStripeSubscription } from "./checkout-guard.ts";

test("a live Stripe subscription blocks a new checkout", () => {
  for (const status of ["active", "trialing", "past_due"]) {
    assert.equal(
      hasLiveStripeSubscription({ stripe_subscription_id: "sub_1", status }),
      true,
      status,
    );
  }
});

test("an ended Stripe subscription allows a new checkout", () => {
  for (const status of ["canceled", "incomplete", "none"]) {
    assert.equal(
      hasLiveStripeSubscription({ stripe_subscription_id: "sub_1", status }),
      false,
      status,
    );
  }
});

test("rows without a Stripe subscription (academia, admin, campaign trial) are not live Stripe subscriptions", () => {
  assert.equal(hasLiveStripeSubscription({ stripe_subscription_id: null, status: "active" }), false);
  assert.equal(hasLiveStripeSubscription({ stripe_subscription_id: "", status: "trialing" }), false);
  assert.equal(hasLiveStripeSubscription(null), false);
  assert.equal(hasLiveStripeSubscription(undefined), false);
});
