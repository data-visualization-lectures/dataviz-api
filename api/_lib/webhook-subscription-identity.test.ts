import test from "node:test";
import assert from "node:assert/strict";

import { decideSubscriptionEvent } from "./webhook-subscription-identity.ts";

const OLD = "sub_old";
const NEW = "sub_new";

test("applies when no Stripe subscription is recorded yet", () => {
  assert.equal(
    decideSubscriptionEvent({
      rowSubscriptionId: null,
      rowStatus: "none",
      eventSubscriptionId: NEW,
      eventStatus: "active",
    }),
    "apply",
  );
});

test("applies every status change of the tracked subscription", () => {
  for (const eventStatus of ["active", "past_due", "canceled", "incomplete"] as const) {
    assert.equal(
      decideSubscriptionEvent({
        rowSubscriptionId: OLD,
        rowStatus: "active",
        eventSubscriptionId: OLD,
        eventStatus,
      }),
      "apply",
      eventStatus,
    );
  }
});

test("re-checkout while past_due: the new active subscription takes over the row", () => {
  assert.equal(
    decideSubscriptionEvent({
      rowSubscriptionId: OLD,
      rowStatus: "past_due",
      eventSubscriptionId: NEW,
      eventStatus: "active",
    }),
    "apply",
  );
});

test("the old subscription's deletion does not cancel the new one", () => {
  assert.equal(
    decideSubscriptionEvent({
      rowSubscriptionId: NEW,
      rowStatus: "active",
      eventSubscriptionId: OLD,
      eventStatus: "canceled",
    }),
    "ignore_stale_subscription",
  );
});

test("the old subscription's failed payment does not mark the new one past_due", () => {
  assert.equal(
    decideSubscriptionEvent({
      rowSubscriptionId: NEW,
      rowStatus: "active",
      eventSubscriptionId: OLD,
      eventStatus: "past_due",
    }),
    "ignore_other_live_subscription",
  );
});

test("re-subscribing after a cancellation adopts the new subscription", () => {
  assert.equal(
    decideSubscriptionEvent({
      rowSubscriptionId: OLD,
      rowStatus: "canceled",
      eventSubscriptionId: NEW,
      eventStatus: "active",
    }),
    "apply",
  );
});

test("an ended subscription does not replace a canceled row with a different id", () => {
  assert.equal(
    decideSubscriptionEvent({
      rowSubscriptionId: OLD,
      rowStatus: "canceled",
      eventSubscriptionId: NEW,
      eventStatus: "incomplete",
    }),
    "ignore_stale_subscription",
  );
});

test("a second live subscription does not flip a row that is in good standing", () => {
  assert.equal(
    decideSubscriptionEvent({
      rowSubscriptionId: OLD,
      rowStatus: "active",
      eventSubscriptionId: NEW,
      eventStatus: "active",
    }),
    "ignore_other_live_subscription",
  );
});

test("a past_due row is not replaced by another past_due subscription", () => {
  assert.equal(
    decideSubscriptionEvent({
      rowSubscriptionId: OLD,
      rowStatus: "past_due",
      eventSubscriptionId: NEW,
      eventStatus: "past_due",
    }),
    "ignore_other_live_subscription",
  );
});

test("an incomplete row is replaced by a live subscription", () => {
  assert.equal(
    decideSubscriptionEvent({
      rowSubscriptionId: OLD,
      rowStatus: "incomplete",
      eventSubscriptionId: NEW,
      eventStatus: "trialing",
    }),
    "apply",
  );
});
