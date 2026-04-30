import test from "node:test";
import assert from "node:assert/strict";

import {
  hasAccessibleScope,
  isSubscribedStatus,
  resolveAccessibleScopes,
  resolveEntitlements,
  resolveSubscriptionScope,
} from "./entitlements.ts";

test("active and trialing statuses are treated as subscribed", () => {
  assert.equal(isSubscribedStatus("active"), true);
  assert.equal(isSubscribedStatus("trialing"), true);
  assert.equal(isSubscribedStatus("canceled"), false);
});

test("legacy plan ids resolve to bundle scope in phase 1", () => {
  assert.equal(
    resolveSubscriptionScope({
      subscription: { plan_id: "pro_monthly" },
      planScope: null,
    }),
    "bundle",
  );
  assert.equal(
    resolveSubscriptionScope({
      subscription: { plan_id: "team_member" },
      planScope: null,
    }),
    "bundle",
  );
});

test("accessible scopes stay shared while compatibility mode is active", () => {
  assert.deepEqual(
    resolveAccessibleScopes({
      subscription: { status: "active" },
      planScope: null,
    }),
    ["viz", "prep"],
  );
  assert.deepEqual(
    resolveAccessibleScopes({
      subscription: { status: "canceled" },
      planScope: null,
    }),
    [],
  );
  assert.deepEqual(
    resolveAccessibleScopes({
      subscription: { status: "active" },
      planScope: "viz",
    }),
    ["viz"],
  );
  assert.deepEqual(
    resolveAccessibleScopes({
      subscription: { status: "active" },
      planScope: "prep",
    }),
    ["prep"],
  );
});

test("resolveEntitlements keeps unsubscribed users out while preserving scope metadata", () => {
  assert.deepEqual(
    resolveEntitlements({
      subscription: { plan_id: "pro_monthly", status: "active" },
      planScope: null,
    }),
    {
      isSubscribed: true,
      subscriptionScope: "bundle",
      accessibleScopes: ["viz", "prep"],
    },
  );

  assert.deepEqual(
    resolveEntitlements({
      subscription: { plan_id: "trial", status: "canceled" },
      planScope: null,
    }),
    {
      isSubscribed: false,
      subscriptionScope: "bundle",
      accessibleScopes: [],
    },
  );
});

test("hasAccessibleScope allows bundle and matching scoped access", () => {
  assert.equal(
    hasAccessibleScope({
      requiredScope: "viz",
      subscriptionScope: "bundle",
      accessibleScopes: ["viz", "prep"],
    }),
    true,
  );
  assert.equal(
    hasAccessibleScope({
      requiredScope: "viz",
      subscriptionScope: "viz",
      accessibleScopes: ["viz"],
    }),
    true,
  );
  assert.equal(
    hasAccessibleScope({
      requiredScope: "prep",
      subscriptionScope: "viz",
      accessibleScopes: ["viz"],
    }),
    false,
  );
});
