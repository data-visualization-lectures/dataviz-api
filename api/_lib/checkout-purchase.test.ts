import test from "node:test";
import assert from "node:assert/strict";

import {
  CheckoutPurchaseError,
  resolveCheckoutPurchase,
  type CheckoutSessionForPurchase,
} from "./checkout-purchase.ts";

function session(
  overrides: Partial<CheckoutSessionForPurchase> = {},
): CheckoutSessionForPurchase {
  return {
    id: "cs_test_123",
    status: "complete",
    payment_status: "paid",
    amount_total: 2480,
    currency: "jpy",
    metadata: {
      user_id: "user-123",
      plan_id: "bundle_monthly_jpy",
    },
    ...overrides,
  };
}

test("resolveCheckoutPurchase returns GA4 purchase fields", () => {
  assert.deepEqual(
    resolveCheckoutPurchase(session(), "user-123"),
    {
      plan: "bundle_monthly_jpy",
      value: 2480,
      currency: "JPY",
      transaction_id: "cs_test_123",
    },
  );
});

test("resolveCheckoutPurchase converts decimal currency minor units", () => {
  assert.equal(
    resolveCheckoutPurchase(
      session({
        amount_total: 1900,
        currency: "usd",
        metadata: {
          user_id: "user-123",
          plan_id: "bundle_monthly_usd",
        },
      }),
      "user-123",
    ).value,
    19,
  );
});

test("resolveCheckoutPurchase rejects a session owned by another user", () => {
  assert.throws(
    () => resolveCheckoutPurchase(session(), "other-user"),
    (error: unknown) =>
      error instanceof CheckoutPurchaseError &&
      error.code === "checkout_session_forbidden" &&
      error.statusCode === 403,
  );
});

test("resolveCheckoutPurchase rejects incomplete and unpaid sessions", () => {
  assert.throws(
    () => resolveCheckoutPurchase(session({ status: "open" }), "user-123"),
    /checkout_session_incomplete/,
  );
  assert.throws(
    () =>
      resolveCheckoutPurchase(
        session({ payment_status: "unpaid" }),
        "user-123",
      ),
    /checkout_session_unpaid/,
  );
});

test("resolveCheckoutPurchase accepts zero-value completed checkouts", () => {
  assert.equal(
    resolveCheckoutPurchase(
      session({ payment_status: "no_payment_required", amount_total: 0 }),
      "user-123",
    ).value,
    0,
  );
});
